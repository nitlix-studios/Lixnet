import LixnetServerBase, { type LixnetServerBaseOptions } from "./serverbase";
import type {
    FunctionInput,
    FunctionOutput,
    LXNEventEntries,
    LXNEventSchema,
    LXNServerHandler,
    LXN_ServerClient_EventType,
} from "./types";
import { LixnetResponse } from "./util/response";
import { type LixnetRequest, createLixnetRequest } from "./util/request";
import getDefaultFormatter from "./util/getDefaultFormatter";
import type { StandardSchemaV1 } from "./standardschema";
import type {
    LixnetRouteDefinitions,
    LixnetRoute,
    LixnetRoutes,
    LixnetRoutesFromDefinitions,
} from "./router";
import type { LixnetServerInjections } from "./types";

type LXNServerEventInput<
    Events extends LXN_ServerClient_EventType,
    TName extends keyof Events
> = {
    event: TName;
    handler: LXNServerHandler<
        FunctionInput<Events[TName]> & { request: LixnetRequest, response: LixnetResponse },
        FunctionOutput<Events[TName]>
    >;
    schema?: LXNEventSchema<Events, TName>;
};

/**
 * Routes with inferred types, as `{ name: { schema?, handler } }`: the same as calling
 * `.route(name, ...)` for each. `events` is an alias of `routes`; pass one or the other.
 */
type LixnetServerRoutesOption<TRouteDefinitions> =
    | { routes?: TRouteDefinitions; events?: never }
    | { events?: TRouteDefinitions; routes?: never };

export default class LixnetServer<
    Events extends LXN_ServerClient_EventType = LXN_ServerClient_EventType,
    Routes extends LixnetRoutes = {},
    // Inferred from the `routes` option: its schemas (to type each handler) and its definitions.
    TSchemas extends Record<string, unknown> = {},
    TDefs extends Record<string, { handler: (input: any) => unknown }> = {}
> extends LixnetServerBase<
    LXNServerEventInput<Events, keyof Events>
> {
    /** Type-only: routes from the `routes` option and `.route(...)`, read by `InferLixnetEvents`. */
    declare readonly "~routes": Routes & LixnetRoutesFromDefinitions<TDefs>;

    private formatter: (this: LixnetResponse) => Response;

    public constructor({
        formatter,
        routes,
        events,
        ...options
    }: LixnetServerBaseOptions & {
        formatter?: (this: LixnetResponse) => Response;
    } & LixnetServerRoutesOption<TDefs & LixnetRouteDefinitions<TSchemas>> = {}) {
        super(options);
        this.formatter = formatter ?? getDefaultFormatter(this.defaultHeaders);

        for (const [event, route] of Object.entries(routes ?? events ?? {})) {
            this.register({ ...(route as object), event } as LXNServerEventInput<Events, keyof Events>);
        }
    }

    /**
     * Adds an event whose types are inferred, so no `Events` contract is needed. Chain calls and
     * give the client `typeof server` through an `import type`.
     *
     * With a schema, the handler gets the schema's output and the client sends its input.
     */
    public route<K extends string, TSchema extends StandardSchemaV1, TOutput>(
        event: K,
        route: {
            schema: TSchema;
            handler: (input: StandardSchemaV1.InferOutput<TSchema> & LixnetServerInjections) => TOutput;
        }
    ): LixnetServer<
        Events,
        Routes & Record<K, LixnetRoute<StandardSchemaV1.InferInput<TSchema>, Awaited<TOutput>>>,
        TSchemas,
        TDefs
    >;

    /** Without a schema, the input is the handler's parameter type minus `request`/`response`. */
    public route<K extends string, TParams, TOutput>(
        event: K,
        route: { schema?: undefined; handler: (input: TParams) => TOutput }
    ): LixnetServer<
        Events,
        Routes & Record<K, LixnetRoute<Omit<TParams, keyof LixnetServerInjections>, Awaited<TOutput>>>,
        TSchemas,
        TDefs
    >;

    public route(event: string, route: { schema?: StandardSchemaV1; handler: (input: any) => unknown }) {
        this.register({ ...route, event } as LXNServerEventInput<Events, keyof Events>);
        return this;
    }

    public on<K extends keyof Events & string>(
        input:
            | LXNServerEventInput<Events, K>
            | LXNEventEntries<
                  Events,
                  { [P in keyof Events & string]: LXNServerEventInput<Events, P> }
              >
    ) {
        this.register(input as LXNServerEventInput<Events, keyof Events>);
    }

    public async handle(request: Request) {
        const response = new LixnetResponse({ formatter: this.formatter });

        const corsResponse = this.handleCors(request, response);
        if (corsResponse) return corsResponse;

        const parsed = await this.parse(request);
        if (!parsed.ok) {
            return this.fail(response, parsed);
        }

        try {
            const data = await parsed.entry.handler({
                ...parsed.input,
                request: createLixnetRequest(request, response, parsed.body),
                response: response,
            });

            //check data isnt void/null/undefined
            if (!(data === undefined || data === null)) {
                response.data(data);
            }

            return response.format();
        } catch (error) {
            return this.fail(response, this.failureFromThrown(error, parsed.entry.event as string));
        }
    }
}
