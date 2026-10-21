import LixnetServerBase, { type LixnetServerBaseOptions } from "./serverbase";
import type {
    FunctionInput,
    FunctionOutput,
    LXN_ServerClient_EventType,
    LXNEventEntries,
    LXNEventSchema,
    LXNStreamEmitter,
} from "./types";
import { LixnetResponse } from "./util/response";
import { type LixnetRequest, createLixnetRequest } from "./util/request";
import getDefaultFormatter, { buildResponseHeaders, errorBody } from "./util/getDefaultFormatter";

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
    ) => Promise<void> | void;
    schema?: LXNEventSchema<Events, K>;
};

export default class LixnetStreamServer<Events extends LXN_ServerClient_EventType> extends LixnetServerBase<
    LXNStreamServerEventInput<Events, keyof Events>
> {
    private errorFormatter: (this: LixnetResponse) => Response;

    public constructor(options: LixnetServerBaseOptions = {}) {
        super(options);
        this.errorFormatter = getDefaultFormatter(this.defaultHeaders);
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
        const requestClone = request.clone();

        const response = new LixnetResponse({ formatter: this.errorFormatter });

        const corsResponse = this.handleCors(request, response);
        if (corsResponse) return corsResponse;

        const parsed = await this.parse(request);
        if (!parsed.ok) {
            return this.fail(response, parsed);
        }

        const event = parsed.entry;
        const validatedInput = parsed.input;
        const newRequest: LixnetRequest = createLixnetRequest(requestClone, response);

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
                    await event.handler({ ...validatedInput, request: newRequest, response, stream });
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
