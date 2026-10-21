import type { z } from "zod";
import LixnetLog from "./util/log";
import type { DebugLogger } from "./types";
import type { LixnetResponse } from "./util/response";

type EventEntry = { event: PropertyKey; schema?: z.ZodType<any> };

type ParsedRpcRequest<TEntry> =
    | { ok: true; entry: TEntry; input: any }
    | { ok: false; error: string; status: number; cause?: unknown };

/** Shared request parsing and error handling for `LixnetServer` and `LixnetStreamServer`. */
export default abstract class LixnetServerBase<TEntry extends EventEntry> {
    protected events: Record<string, TEntry> = {};
    protected logger: DebugLogger = LixnetLog;
    protected debugLog: boolean;
    protected defaultHeaders: Record<string, string>;

    protected constructor({
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
            return { ok: false, error: "Event not found", status: 404 };
        }
        const entry = this.events[json.event]!;

        if (!entry.schema) {
            return { ok: true, entry, input: json.input };
        }

        const result = entry.schema.safeParse(json.input);
        if (!result.success) {
            return { ok: false, error: "Invalid input", status: 400, cause: result.error };
        }

        return { ok: true, entry, input: result.data };
    }

    /** Sets an error with its status on the response and formats it. */
    protected fail(response: LixnetResponse, error: string, status: number): Response {
        response.code(status);
        response.error(error);
        return response.format();
    }
}
