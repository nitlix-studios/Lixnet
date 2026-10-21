export type LixnetCorsOptions = {
    /** Allowed origins: exact origins (`"https://app.example.com"`), `"*"` for any, or a predicate. */
    origin: string | string[] | ((origin: string) => boolean);
    /** Send `Access-Control-Allow-Credentials: true` (cookies). Not allowed with `origin: "*"`. */
    credentials?: boolean;
    /** Seconds a browser may cache a preflight. Defaults to 7200 (Chrome's cap; Firefox allows 86400). */
    maxAge?: number;
    /** Request headers the client may send. Defaults to whatever the preflight asks for. */
    allowHeaders?: string[];
    /** Response headers the client may read besides the CORS-safelisted ones. */
    exposeHeaders?: string[];
};

export const DEFAULT_CORS_MAX_AGE = 7200;

export function assertCorsOptions(cors: LixnetCorsOptions): void {
    if (cors.origin === "*" && cors.credentials) {
        throw new Error('LIXNET - cors.origin "*" cannot be combined with credentials: true');
    }
}

export function isOriginAllowed(cors: LixnetCorsOptions, origin: string): boolean {
    if (cors.origin === "*") return true;
    if (typeof cors.origin === "function") return cors.origin(origin);
    if (Array.isArray(cors.origin)) return cors.origin.includes(origin);
    return cors.origin === origin;
}

/** Headers for an actual (non-preflight) response to an allowed origin. */
export function corsHeaders(cors: LixnetCorsOptions, origin: string): Record<string, string> {
    if (cors.origin === "*") {
        return {
            "Access-Control-Allow-Origin": "*",
            ...(cors.exposeHeaders?.length
                ? { "Access-Control-Expose-Headers": cors.exposeHeaders.join(", ") }
                : {}),
        };
    }

    return {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        ...(cors.credentials ? { "Access-Control-Allow-Credentials": "true" } : {}),
        ...(cors.exposeHeaders?.length
            ? { "Access-Control-Expose-Headers": cors.exposeHeaders.join(", ") }
            : {}),
    };
}

/** Headers for a preflight (`OPTIONS`) response to an allowed origin. */
export function preflightHeaders(
    cors: LixnetCorsOptions,
    origin: string,
    requestedHeaders: string | null
): Record<string, string> {
    const allowHeaders = cors.allowHeaders?.join(", ") ?? requestedHeaders;

    return {
        ...corsHeaders(cors, origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        ...(allowHeaders ? { "Access-Control-Allow-Headers": allowHeaders } : {}),
        "Access-Control-Max-Age": String(cors.maxAge ?? DEFAULT_CORS_MAX_AGE),
    };
}
