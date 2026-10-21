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

type RouteHandlerInput<TSchema, TInjections> = TSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TSchema> & TInjections
    : any;

/**
 * The `routes` constructor option: `{ name: { schema?, handler } }`. Each handler is typed from
 * its own schema; without one, annotate the handler's parameter.
 */
export type LixnetRouteDefinitions<TSchemas, TInjections = LixnetServerInjections> = {
    [K in keyof TSchemas]: {
        schema?: TSchemas[K];
        handler: (input: RouteHandlerInput<TSchemas[K], TInjections>) => unknown;
    };
};

/** The input a route definition's caller sends: the schema's input, else the handler's parameter minus injections. */
export type LixnetRouteDefinitionInput<TDef, TInjections = LixnetServerInjections> =
    TDef extends { schema: infer TSchema extends StandardSchemaV1 }
        ? StandardSchemaV1.InferInput<TSchema>
        : TDef extends { handler: (input: infer TParams) => any }
          ? Omit<TParams, keyof TInjections>
          : never;

/** Turns the `routes` option's type into routes, the same shape `.route(...)` records. */
export type LixnetRoutesFromDefinitions<TDefs, TInjections = LixnetServerInjections> = {
    [K in keyof TDefs]: TDefs[K] extends { handler: (input: any) => infer TOutput }
        ? LixnetRoute<LixnetRouteDefinitionInput<TDefs[K], TInjections>, Awaited<TOutput>>
        : never;
};

/**
 * `routes` (or its alias `events`) as `{ name: { schema?, handler } }`: the same as calling
 * `.route(name, ...)` for each. Pass one or the other.
 */
export type LixnetRoutesOption<TRouteDefinitions> =
    | { routes?: TRouteDefinitions; events?: never }
    | { events?: TRouteDefinitions; routes?: never };
