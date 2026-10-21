import type { z } from "zod";
import LixnetLog from "./util/log";
import type { DebugLogger } from "./types";
import type { LixnetResponse } from "./util/response";
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

type EventEntry = { event: PropertyKey; schema?: z.ZodType<any> };

type ParsedRpcRequest<TEntry> =
    | { ok: true; entry: TEntry; input: any }
    | { ok: false; error: string; status: number; cause?: unknown; event?: string };

function describeError(cause: unknown): string | undefined {
    if (cause === undefined) return undefined;
    if (cause instanceof Error) return cause.message;
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
        let json: any;
        try {
            json = await request.json();
        } catch (cause) {
            return { ok: false, error: "Invalid JSON", status: 400, cause };
        }

        if (json === null || typeof json !== "object" || Array.isArray(json)) {
            return { ok: false, error: "Invalid request body", status: 400 };
        }

        if (typeof json.event !== "string" || !json.event) {
            return { ok: false, error: "Event not found", status: 400 };
        }

        if (!("input" in json)) {
            return { ok: false, error: "Input not found", status: 400 };
        }

        // hasOwn so names like "constructor" or "toString" don't resolve to prototype members.
        if (!Object.hasOwn(this.events, json.event)) {
            return { ok: false, error: "Event not found", status: 404, event: json.event };
        }
        const entry = this.events[json.event]!;

        if (!entry.schema) {
            return { ok: true, entry, input: json.input };
        }

        const result = entry.schema.safeParse(json.input);
        if (!result.success) {
            return {
                ok: false,
                error: "Invalid input",
                status: 400,
                cause: result.error,
                event: json.event,
            };
        }

        return { ok: true, entry, input: result.data };
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
            return this.fail(response, { error: "Origin not allowed", status: 403, cause: origin });
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

    /** Logs the failure (with `debugLog`) and stages it on the response with its status. */
    protected stageFailure(
        response: LixnetResponse,
        { error, status, cause, event }: { error: string; status: number; cause?: unknown; event?: string }
    ): void {
        if (this.debugLog) {
            this.logger({
                error: true,
                message: event ? `${error} (event "${event}")` : error,
                cause,
            });
        }

        response.code(status);
        response.error(error, this.exposeErrors ? describeError(cause) : undefined);
    }

    protected fail(
        response: LixnetResponse,
        failure: { error: string; status: number; cause?: unknown; event?: string }
    ): Response {
        this.stageFailure(response, failure);
        return response.format();
    }
}
