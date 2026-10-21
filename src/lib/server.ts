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
import type { z } from "zod";
import type { LixnetRoute, LixnetRoutes } from "./router";
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

export default class LixnetServer<
    Events extends LXN_ServerClient_EventType = LXN_ServerClient_EventType,
    Routes extends LixnetRoutes = {}
> extends LixnetServerBase<
    LXNServerEventInput<Events, keyof Events>
> {
    /** Type-only: the routes added with `.route(...)`, read by `InferLixnetEvents`. */
    declare readonly "~routes": Routes;

    private formatter: (this: LixnetResponse) => Response;

    public constructor({
        formatter,
        ...options
    }: LixnetServerBaseOptions & {
        formatter?: (this: LixnetResponse) => Response;
    } = {}) {
        super(options);
        this.formatter = formatter ?? getDefaultFormatter(this.defaultHeaders);
    }

    /**
     * Adds an event whose types are inferred, so no `Events` contract is needed. Chain calls and
     * give the client `typeof server` through an `import type`.
     *
     * With a schema, the handler gets the schema's output and the client sends its input.
     */
    public route<K extends string, TSchema extends z.ZodType, TOutput>(
        event: K,
        route: {
            schema: TSchema;
            handler: (input: z.output<TSchema> & LixnetServerInjections) => TOutput;
        }
    ): LixnetServer<Events, Routes & Record<K, LixnetRoute<z.input<TSchema>, Awaited<TOutput>>>>;

    /** Without a schema, the input is the handler's parameter type minus `request`/`response`. */
    public route<K extends string, TParams, TOutput>(
        event: K,
        route: { schema?: undefined; handler: (input: TParams) => TOutput }
    ): LixnetServer<
        Events,
        Routes & Record<K, LixnetRoute<Omit<TParams, keyof LixnetServerInjections>, Awaited<TOutput>>>
    >;

    public route(event: string, route: { schema?: z.ZodType; handler: (input: any) => unknown }) {
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
        const requestClone = request.clone();

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
                request: createLixnetRequest(requestClone, response),
                response: response,
            });

            //check data isnt void/null/undefined
            if (!(data === undefined || data === null)) {
                response.data(data);
            }

            return response.format();
        } catch (error) {
            return this.fail(response, {
                error: "Handler error",
                status: 500,
                cause: error,
                event: parsed.entry.event as string,
            });
        }
    }
}
