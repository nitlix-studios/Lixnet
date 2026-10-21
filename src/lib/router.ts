import type { StandardSchemaV1 } from "./standardschema";
import type { LixnetServerInjections } from "./types";

/**
 * Type-level description of a route added with `LixnetServer.route(...)`: the input the
 * client sends and the output it receives.
 */
export type LixnetRoute<TInput, TOutput> = { input: TInput; output: TOutput };

export type LixnetRoutes = Record<string, LixnetRoute<any, any>>;

/**
 * Converts `typeof server` (built with `.route(...)`) into the `Events` shape clients use
 * (`name: (input) => output`). Anything else is passed through, so clients accept either.
 */
export type InferLixnetEvents<T> = T extends { readonly "~routes": infer TRoutes extends LixnetRoutes }
    ? { [K in keyof TRoutes]: (input: TRoutes[K]["input"]) => TRoutes[K]["output"] }
    : T;

type RouteHandlerInput<TSchema> = TSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TSchema> & LixnetServerInjections
    : any;

/**
 * The `routes` constructor option: `{ name: { schema?, handler } }`. Each handler is typed from
 * its own schema; without one, annotate the handler's parameter.
 */
export type LixnetRouteDefinitions<TSchemas> = {
    [K in keyof TSchemas]: {
        schema?: TSchemas[K];
        handler: (input: RouteHandlerInput<TSchemas[K]>) => unknown;
    };
};

/** Turns the `routes` option's type into routes, the same shape `.route(...)` records. */
export type LixnetRoutesFromDefinitions<TDefs> = {
    [K in keyof TDefs]: TDefs[K] extends { handler: (input: infer TParams) => infer TOutput }
        ? LixnetRoute<
              TDefs[K] extends { schema: infer TSchema extends StandardSchemaV1 }
                  ? StandardSchemaV1.InferInput<TSchema>
                  : Omit<TParams, keyof LixnetServerInjections>,
              Awaited<TOutput>
          >
        : never;
};
