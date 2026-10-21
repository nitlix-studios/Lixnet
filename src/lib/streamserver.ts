import { z } from "zod";
import LixnetLog from "./util/log";
import type {
    DebugLogger,
    FunctionInput,
    FunctionOutput,
    LXN_ServerClient_EventType,
    LXNEventEntries,
    LXNEventSchema,
    LXNStreamEmitter,
} from "./types";
import { LixnetResponse } from "./util/response";
import { LixnetRequest, wrapLixnetRequest } from "./util/request";

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

export default class LixnetStreamServer<Events extends LXN_ServerClient_EventType> {
    private events: Record<string, LXNStreamServerEventInput<Events, keyof Events>> = {};
    private logger: DebugLogger = LixnetLog;
    private debugLog: boolean = false;
    private defaultHeaders: Record<string, string>;

    public constructor({
        debugLog = false,
        logger,
        defaultHeaders = {},
    }: {
        debugLog?: boolean;
        logger?: DebugLogger;
        defaultHeaders?: Record<string, string>;
    }) {
        this.debugLog = debugLog;
        this.defaultHeaders = defaultHeaders;
        logger ? (this.logger = logger) : "";
    }

    public on<K extends keyof Events & string>(
        input:
            | LXNStreamServerEventInput<Events, K>
            | LXNEventEntries<
                  Events,
                  { [P in keyof Events & string]: LXNStreamServerEventInput<Events, P> }
              >
    ) {
        const entries = (Array.isArray(input) ? input : [input]) as LXNStreamServerEventInput<
            Events,
            keyof Events
        >[];
        for (const entry of entries) {
            this.events[entry.event as string] = entry;
        }
    }

    public async handle(request: Request): Promise<Response> {
        const requestClone = request.clone();

        let jsonData: any;
        try {
            jsonData = await request.json();
        } catch {
            if (this.debugLog) this.logger({ error: true, message: "Invalid JSON" });
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (jsonData === null || typeof jsonData !== "object" || Array.isArray(jsonData)) {
            return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        if (!jsonData.event) {
            return Response.json({ error: "Event not found" }, { status: 400 });
        }

        if (!("input" in jsonData)) {
            return Response.json({ error: "Input not found" }, { status: 400 });
        }

        const event = this.events[jsonData.event];
        if (!event) {
            return Response.json({ error: "Event not found" }, { status: 404 });
        }

        let validatedInput: any;
        try {
            validatedInput = event.schema
                ? event.schema.parse(jsonData.input)
                : jsonData.input;
        } catch (error) {
            if (error instanceof z.ZodError) {
                return Response.json({ error: "Invalid input" }, { status: 400 });
            }
            return Response.json({ error: "Handler error" }, { status: 500 });
        }

        const response = new LixnetResponse({ formatter: function() { return new Response(); } });

        const newRequest: LixnetRequest = wrapLixnetRequest(requestClone, {
            header: response.header.bind(response),
            deleteHeader: response.deleteHeader.bind(response),
            cookie: response.cookie.bind(response),
            deleteCookie: response.deleteCookie.bind(response),
            responseHeaders: response.responseHeaders,
            responseHeaderDeletes: response.responseHeaderDeletes,
            responseCookies: response.responseCookies,
        });

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
            } catch {
                if (this.debugLog) this.logger({ error: true, message: "Stream handler error" });
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
