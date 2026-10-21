/** Built-in error codes and their default HTTP statuses. Any other string is also a valid code. */
export const LIXNET_ERROR_STATUS = {
    BAD_REQUEST: 400,
    INVALID_INPUT: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL: 500,
} as const;

export type LixnetErrorCode = keyof typeof LIXNET_ERROR_STATUS | (string & {});

/** One validation problem, sent as `data.issues` with `INVALID_INPUT`. */
export type LixnetIssue = {
    path: (string | number)[];
    message: string;
};

const LIXNET_ERROR_BRAND = Symbol.for("lixnet.error");

/** Picks a code for a status that came without one (e.g. `response.code(403)` + `response.error(...)`). */
export function codeForStatus(status: number): LixnetErrorCode {
    // INVALID_INPUT is skipped so a bare 400 maps to the generic BAD_REQUEST.
    for (const [code, codeStatus] of Object.entries(LIXNET_ERROR_STATUS)) {
        if (codeStatus === status && code !== "INVALID_INPUT") return code;
    }
    return status >= 500 ? "INTERNAL" : "BAD_REQUEST";
}

/** Rebuilds the error a server sent (`{ error, code?, data?, detail? }`) on the client. */
export function errorFromBody(
    body: { error: string; code?: string; data?: unknown; detail?: string },
    /** Omitted for stream error frames (sent after a 200): derived from the code instead. */
    status?: number
): LixnetError {
    return new LixnetError(body.code ?? codeForStatus(status ?? 500), body.error, {
        status,
        data: body.data,
        cause: body.detail,
    });
}

/**
 * An error with a machine-readable `code`, an HTTP `status` and optional JSON `data`.
 *
 * Throw it from a handler to send it to the client as-is; `LixnetClient` throws it back on the
 * client, so `catch (e) { if (LixnetError.is(e) && e.code === "UNAUTHORIZED") ... }` works.
 */
export class LixnetError<TData = unknown> extends Error {
    public readonly code: LixnetErrorCode;
    public readonly status: number;
    public readonly data: TData | undefined;

    public constructor(
        code: LixnetErrorCode,
        message: string = code,
        options: { status?: number; data?: TData; cause?: unknown } = {}
    ) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "LixnetError";
        this.code = code;
        this.status =
            options.status ??
            LIXNET_ERROR_STATUS[code as keyof typeof LIXNET_ERROR_STATUS] ??
            400;
        this.data = options.data;
        Object.defineProperty(this, LIXNET_ERROR_BRAND, { value: true });
    }

    /** Like `instanceof`, but also works across duplicate copies of Lixnet in one bundle. */
    public static is(error: unknown): error is LixnetError {
        return typeof error === "object" && error !== null && LIXNET_ERROR_BRAND in error;
    }
}
