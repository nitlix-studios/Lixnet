import type { StandardSchemaV1 } from "./standardschema";
import type {
    LixnetRouteDefinitions,
    LixnetRoute,
    LixnetRoutes,
    LixnetRoutesFromDefinitions,
    LixnetRoutesOption,
} from "./router";

/** Injected into every `LixnetPeerEvents` handler next to its input. */
export type LixnetPeerInjections = {
    socket: WebSocket;
};

/** A registered peer event, read by `LixnetPeer` when dispatching. */
export type LixnetPeerEventEntry = {
    schema?: StandardSchemaV1;
    handler: (input: any) => unknown;
};

/**
 * The events one side of a WebSocket handles, with inferred types: the peer counterpart of
 * `LixnetServer`'s `routes` / `.route(...)`.
 *
 * Define each side's events on their own, `import type` the other side's, and pass both to the peer:
 *
 * ```ts
 * // server/events.ts
 * export const serverEvents = new LixnetPeerEvents({
 *     routes: { hello: { schema: z.object({ name: z.string() }), handler: ({ name }) => `Hi ${name}` } },
 * });
 *
 * // server/socket.ts
 * import type { clientEvents } from "../client/events";
 * const peer = new LixnetPeer<typeof clientEvents>({ events: serverEvents });
 * ```
 *
 * The events object never refers to the other side's types, so the two sides can import each
 * other's types without a circular type.
 */
export default class LixnetPeerEvents<
    Routes extends LixnetRoutes = {},
    // Inferred from the `routes` option: its schemas (to type each handler) and its definitions.
    TSchemas extends Record<string, unknown> = {},
    TDefs extends Record<string, { handler: (input: any) => unknown }> = {}
> {
    /** Type-only: routes from the `routes` option and `.route(...)`, read by `InferLixnetEvents`. */
    declare readonly "~routes": Routes & LixnetRoutesFromDefinitions<TDefs, LixnetPeerInjections>;

    /** Registered events by name. */
    public readonly entries: Record<string, LixnetPeerEventEntry> = {};

    public constructor({
        routes,
        events,
    }: LixnetRoutesOption<TDefs & LixnetRouteDefinitions<TSchemas, LixnetPeerInjections>> = {}) {
        for (const [event, route] of Object.entries(routes ?? events ?? {})) {
            this.entries[event] = route as LixnetPeerEventEntry;
        }
    }

    /** With a schema, the handler gets the schema's output and the other peer sends its input. */
    public route<K extends string, TSchema extends StandardSchemaV1, TOutput>(
        event: K,
        route: {
            schema: TSchema;
            handler: (input: StandardSchemaV1.InferOutput<TSchema> & LixnetPeerInjections) => TOutput;
        }
    ): LixnetPeerEvents<
        Routes & Record<K, LixnetRoute<StandardSchemaV1.InferInput<TSchema>, Awaited<TOutput>>>,
        TSchemas,
        TDefs
    >;

    /** Without a schema, the input is the handler's parameter type minus `socket`. */
    public route<K extends string, TParams, TOutput>(
        event: K,
        route: { schema?: undefined; handler: (input: TParams) => TOutput }
    ): LixnetPeerEvents<
        Routes & Record<K, LixnetRoute<Omit<TParams, keyof LixnetPeerInjections>, Awaited<TOutput>>>,
        TSchemas,
        TDefs
    >;

    public route(event: string, route: LixnetPeerEventEntry) {
        this.entries[event] = route;
        return this;
    }
}
