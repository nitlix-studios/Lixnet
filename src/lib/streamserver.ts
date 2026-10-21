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
import { LixnetRequest, createLixnetRequest } from "./util/request";
import getDefaultFormatter from "./util/getDefaultFormatter";

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

    public constructor(options: LixnetServerBaseOptions) {
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

        const parsed = await this.parse(request);
        if (!parsed.ok) {
            return this.fail(response, parsed);
        }

        const event = parsed.entry;
        const validatedInput = parsed.input;
        const newRequest: LixnetRequest = createLixnetRequest(requestClone, response);

        const encoder = new TextEncoder();
        let streamController!: ReadableStreamDefaultController<Uint8Array>;

        const body = new ReadableStream<Uint8Array>({
            start(controller) { streamController = controller; },
        });

        const stream: LXNStreamEmitter<any> = {
            emit: (chunk: any) => {
                streamController.enqueue(
                    encoder.encode(JSON.stringify({ stream: true, data: chunk }) + "\n")
                );
            },
        };

        (async () => {
            try {
                await event.handler({ ...validatedInput, request: newRequest, response, stream });
            } catch (error) {
                if (this.debugLog) this.logger({ error: true, message: "Stream handler error", cause: error });
            } finally {
                streamController.close();
            }
        })();

        const headers = new Headers({
            "Content-Type": "application/x-ndjson",
            "X-Server": "Lixnet",
            ...this.defaultHeaders,
        });
        for (const [name, value] of Object.entries(response.responseHeaders)) {
            headers.set(name, value);
        }
        for (const name of response.responseHeaderDeletes) {
            headers.delete(name);
        }

        return new Response(body, { status: 200, headers });
    }
}
