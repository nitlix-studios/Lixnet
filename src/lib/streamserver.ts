import LixnetServerBase, { type LixnetServerBaseOptions } from "./serverbase";
import type {
    FunctionInput,
    FunctionOutput,
    LXN_ServerClient_EventType,
    LXNEventEntries,
    LXNEventSchema,
    LXNStreamEmitter,
    LixnetStreamInjections,
} from "./types";
import { LixnetResponse } from "./util/response";
import { type LixnetRequest, createLixnetRequest } from "./util/request";
import getDefaultFormatter, { buildResponseHeaders, errorBody } from "./util/getDefaultFormatter";
import type { StandardSchemaV1 } from "./standardschema";
import type {
    LixnetRouteDefinitionInput,
    LixnetRouteDefinitions,
    LixnetRoute,
    LixnetRoutes,
    LixnetRoutesOption,
} from "./router";

type LXNStreamServerEventInput<
    Events extends LXN_ServerClient_EventType,
    K extends keyof Events
> = {
    event: K;
    handler: (
        input: FunctionInput<Events[K]> & {
            request: LixnetRequest;
            response: LixnetResponse;
            stream: LXNStreamEmitter<FunctionOutput<Events[K]>>;
        }
    ) => unknown;
    schema?: LXNEventSchema<Events, K>;
};

/**
 * A stream route's chunk type: what the handler yields when it's a generator, else the chunk type
 * of a `stream` it annotates (`stream: LXNStreamEmitter<T>`), else `unknown`.
 */
type StreamChunk<TResult, TParams> =
    TResult extends AsyncIterable<infer TChunk> | Generator<infer TChunk>
        ? TChunk
        : TParams extends { stream: LXNStreamEmitter<infer TChunk> }
          ? TChunk
          : unknown;

type StreamRoutesFromDefinitions<TDefs> = {
    [K in keyof TDefs]: TDefs[K] extends { handler: (input: infer TParams) => infer TResult }
        ? LixnetRoute<LixnetRouteDefinitionInput<TDefs[K], LixnetStreamInjections>, StreamChunk<TResult, TParams>>
        : never;
};

function isIterable(value: unknown): value is AsyncIterable<unknown> | Iterable<unknown> {
    if (value === null || typeof value !== "object") return false;
    // Sync iterables only when they're generators, so a returned array isn't streamed by accident.
    return (
        typeof (value as any)[Symbol.asyncIterator] === "function" ||
        (typeof (value as any)[Symbol.iterator] === "function" && typeof (value as any).next === "function")
    );
}

export default class LixnetStreamServer<
    Events extends LXN_ServerClient_EventType = LXN_ServerClient_EventType,
    Routes extends LixnetRoutes = {},
    // Inferred from the `routes` option: its schemas (to type each handler) and its definitions.
    TSchemas extends Record<string, unknown> = {},
    TDefs extends Record<string, { handler: (input: any) => unknown }> = {}
> extends LixnetServerBase<
    LXNStreamServerEventInput<Events, keyof Events>
> {
    /** Type-only: routes from the `routes` option and `.route(...)`, read by `InferLixnetEvents`. */
    declare readonly "~routes": Routes & StreamRoutesFromDefinitions<TDefs>;

    private errorFormatter: (this: LixnetResponse) => Response;

    public constructor({
        routes,
        events,
        ...options
    }: LixnetServerBaseOptions &
        LixnetRoutesOption<TDefs & LixnetRouteDefinitions<TSchemas, LixnetStreamInjections>> = {}) {
        super(options);
        this.errorFormatter = getDefaultFormatter(this.defaultHeaders);

        for (const [event, route] of Object.entries(routes ?? events ?? {})) {
            this.register({ ...(route as object), event } as LXNStreamServerEventInput<Events, keyof Events>);
        }
    }

    /**
     * Adds a stream event whose types are inferred. The client's chunk type is what the handler
     * yields (`async function* () { yield chunk }`), or, with `stream.emit(...)`, the type of an
     * annotated `stream: LXNStreamEmitter<T>` parameter.
     */
    public route<K extends string, TSchema extends StandardSchemaV1, TResult>(
        event: K,
        route: {
            schema: TSchema;
            handler: (input: StandardSchemaV1.InferOutput<TSchema> & LixnetStreamInjections) => TResult;
        }
    ): LixnetStreamServer<
        Events,
        Routes & Record<K, LixnetRoute<StandardSchemaV1.InferInput<TSchema>, StreamChunk<TResult, unknown>>>,
        TSchemas,
        TDefs
    >;

    /** Without a schema, the input is the handler's parameter type minus `request`/`response`/`stream`. */
    public route<K extends string, TParams, TResult>(
        event: K,
        route: { schema?: undefined; handler: (input: TParams) => TResult }
    ): LixnetStreamServer<
        Events,
        Routes & Record<K, LixnetRoute<Omit<TParams, keyof LixnetStreamInjections>, StreamChunk<TResult, TParams>>>,
        TSchemas,
        TDefs
    >;

    public route(event: string, route: { schema?: StandardSchemaV1; handler: (input: any) => unknown }) {
        this.register({ ...route, event } as LXNStreamServerEventInput<Events, keyof Events>);
        return this;
    }

    public on<K extends keyof Events & string>(
        input:
            | LXNStreamServerEventInput<Events, K>
            | LXNEventEntries<
                  Events,
                  { [P in keyof Events & string]: LXNStreamServerEventInput<Events, P> }
              >
    ) {
        this.register(input as LXNStreamServerEventInput<Events, keyof Events>);
    }

    public async handle(request: Request): Promise<Response> {
        const response = new LixnetResponse({ formatter: this.errorFormatter });

        const corsResponse = this.handleCors(request, response);
        if (corsResponse) return corsResponse;

        const parsed = await this.parse(request);
        if (!parsed.ok) {
            return this.fail(response, parsed);
        }

        const event = parsed.entry;
        const validatedInput = parsed.input;
        const newRequest: LixnetRequest = createLixnetRequest(request, response, parsed.body);

        const encoder = new TextEncoder();
        const abort = new AbortController();
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        let closed = false;

        const body = new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
            },
            cancel() {
                // Client disconnected: stop emitting and let the handler observe it via stream.signal.
                closed = true;
                abort.abort();
            },
        });

        const write = (frame: object) => {
            if (closed) return;
            controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
        };

        // The Response is only created on the first emit (or when the handler finishes), so
        // status, headers and cookies staged before that point are all sent, and an error
        // thrown before anything is streamed becomes a normal JSON error response.
        return new Promise<Response>((resolve) => {
            let started = false;

            const start = () => {
                if (started) return;
                started = true;
                resolve(
                    new Response(body, {
                        status: response.responseCode || 200,
                        headers: buildResponseHeaders(
                            response,
                            this.defaultHeaders,
                            "application/x-ndjson"
                        ),
                    })
                );
            };

            const stream: LXNStreamEmitter<any> = {
                signal: abort.signal,
                emit: (chunk: any) => {
                    start();
                    write({ stream: true, data: chunk });
                },
            };

            (async () => {
                try {
                    const result = await event.handler({ ...validatedInput, request: newRequest, response, stream });
                    // Generator handlers: each yielded value is a chunk. Stops early if the client disconnects.
                    if (isIterable(result)) {
                        for await (const chunk of result) {
                            if (closed) break;
                            stream.emit(chunk);
                        }
                    }
                    start();
                } catch (error) {
                    const failure = this.failureFromThrown(error, event.event as string);

                    if (!started) {
                        resolve(this.fail(response, failure));
                        return;
                    }

                    // Headers are already sent, so report the error as the final frame.
                    this.stageFailure(response, failure);
                    write(errorBody(response));
                } finally {
                    if (started && !closed) {
                        closed = true;
                        controller.close();
                    }
                }
            })();
        });
    }
}
