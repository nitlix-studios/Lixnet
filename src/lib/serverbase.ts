import type { StandardSchemaV1 } from "./standardschema";
import LixnetLog from "./util/log";
import type { DebugLogger } from "./types";
import type { LixnetResponse } from "./util/response";
import { LixnetError, type LixnetErrorCode, toIssues } from "./error";
import {
    type LixnetCorsOptions,
    assertCorsOptions,
    corsHeaders,
    isOriginAllowed,
    preflightHeaders,
} from "./util/cors";

export type LixnetServerBaseOptions = {
    /** Log failed requests (including the thrown error) through `logger`. */
    debugLog?: boolean;
    /**
     * Add the underlying error message to error responses as `detail`.
     * Off by default: exception messages can leak internals (SQL, connection strings).
     */
    exposeErrors?: boolean;
    logger?: DebugLogger;
    defaultHeaders?: Record<string, string>;
    /**
     * Handle CORS: answers `OPTIONS` preflights (cached for `maxAge`, default 7200s), adds CORS
     * headers to every response, and rejects requests from origins that aren't allowed.
     */
    cors?: LixnetCorsOptions;
};

type EventEntry = { event: PropertyKey; schema?: StandardSchemaV1 };

/** A failed request, before it's written to the response. */
type Failure = {
    error: string;
    status: number;
    code: LixnetErrorCode;
    data?: unknown;
    /** Logged with `debugLog`; its message becomes `detail` with `exposeErrors`. */
    cause?: unknown;
    event?: string;
};

/** `body` is the raw request body, kept so handlers can re-read it without `request.clone()`. */
type ParsedRpcRequest<TEntry> =
    | { ok: true; entry: TEntry; input: any; body: string }
    | ({ ok: false } & Failure);

function describeError(cause: unknown): string | undefined {
    if (cause === undefined) return undefined;
    if (cause instanceof Error) return cause.message;
    if (Array.isArray(cause)) return cause.map((issue) => issue?.message ?? String(issue)).join("; ");
    return String(cause);
}

/** Shared request parsing and error handling for `LixnetServer` and `LixnetStreamServer`. */
export default abstract class LixnetServerBase<TEntry extends EventEntry> {
    protected events: Record<string, TEntry> = {};
    protected logger: DebugLogger = LixnetLog;
    protected debugLog: boolean;
    protected exposeErrors: boolean;
    protected defaultHeaders: Record<string, string>;
    protected cors?: LixnetCorsOptions;

    protected constructor({
        debugLog = false,
        exposeErrors = false,
        logger,
        defaultHeaders = {},
        cors,
    }: LixnetServerBaseOptions) {
        if (cors) assertCorsOptions(cors);
        this.cors = cors;
        this.debugLog = debugLog;
        this.exposeErrors = exposeErrors;
        this.defaultHeaders = defaultHeaders;
        if (logger) this.logger = logger;
    }

    protected register(input: TEntry | TEntry[]) {
        const entries = Array.isArray(input) ? input : [input];
        for (const entry of entries) {
            this.events[entry.event as string] = entry;
        }
    }

    protected async parse(request: Request): Promise<ParsedRpcRequest<TEntry>> {
        // Read once as text: handlers get it back through LixnetRequest's body methods.
        let body: string;
        let json: any;
        try {
            body = await request.text();
            json = JSON.parse(body);
        } catch (cause) {
            return { ok: false, error: "Invalid JSON", status: 400, code: "BAD_REQUEST", cause };
        }

        if (json === null || typeof json !== "object" || Array.isArray(json)) {
            return { ok: false, error: "Invalid request body", status: 400, code: "BAD_REQUEST" };
        }

        if (typeof json.event !== "string" || !json.event) {
            return { ok: false, error: "Event not found", status: 400, code: "BAD_REQUEST" };
        }

        if (!("input" in json)) {
            return { ok: false, error: "Input not found", status: 400, code: "BAD_REQUEST" };
        }

        // hasOwn so names like "constructor" or "toString" don't resolve to prototype members.
        if (!Object.hasOwn(this.events, json.event)) {
            return {
                ok: false,
                error: "Event not found",
                status: 404,
                code: "NOT_FOUND",
                event: json.event,
            };
        }
        const entry = this.events[json.event]!;

        if (!entry.schema) {
            return { ok: true, entry, input: json.input, body };
        }

        const result = await entry.schema["~standard"].validate(json.input);
        if (result.issues) {
            return {
                ok: false,
                error: "Invalid input",
                status: 400,
                code: "INVALID_INPUT",
                // Validation messages are meant for the caller, so they're always sent.
                data: { issues: toIssues(result.issues) },
                cause: result.issues,
                event: json.event,
            };
        }

        return { ok: true, entry, input: result.value, body };
    }

    /**
     * With `cors` set: answers preflights and rejects disallowed origins (returns the Response),
     * otherwise stages CORS headers on `response` (handlers can still override them) and returns null.
     */
    protected handleCors(request: Request, response: LixnetResponse): Response | null {
        if (!this.cors) return null;

        // No Origin header: same-origin GET or a server-to-server call (e.g. SSR), not CORS.
        const origin = request.headers.get("Origin");
        if (!origin) {
            return request.method === "OPTIONS" ? new Response(null, { status: 204 }) : null;
        }

        if (!isOriginAllowed(this.cors, origin)) {
            if (request.method === "OPTIONS") return new Response(null, { status: 403 });
            return this.fail(response, {
                error: "Origin not allowed",
                status: 403,
                code: "FORBIDDEN",
                cause: origin,
            });
        }

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: preflightHeaders(
                    this.cors,
                    origin,
                    request.headers.get("Access-Control-Request-Headers")
                ),
            });
        }

        response.headers(corsHeaders(this.cors, origin));
        return null;
    }

    /** A `LixnetError` is sent as thrown; anything else becomes a generic 500 "Handler error". */
    protected failureFromThrown(error: unknown, event: string): Failure {
        if (LixnetError.is(error)) {
            return {
                error: error.message,
                status: error.status,
                code: error.code,
                data: error.data,
                cause: error.cause ?? error,
                event,
            };
        }

        return { error: "Handler error", status: 500, code: "INTERNAL", cause: error, event };
    }

    /** Logs the failure (with `debugLog`) and stages it on the response with its status. */
    protected stageFailure(
        response: LixnetResponse,
        { error, status, code, data, cause, event }: Failure
    ): void {
        if (this.debugLog) {
            this.logger({
                error: true,
                message: event ? `${error} (event "${event}")` : error,
                cause,
            });
        }

        response.code(status);
        response.error(error, {
            code,
            data,
            detail: this.exposeErrors ? describeError(cause) : undefined,
        });
    }

    protected fail(response: LixnetResponse, failure: Failure): Response {
        this.stageFailure(response, failure);
        return response.format();
    }
}
