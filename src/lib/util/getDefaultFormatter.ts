import { LixnetResponse } from "./response";

/** Defaults, then staged header sets/deletes, then staged cookies as `Set-Cookie`. */
export function buildResponseHeaders(
    response: LixnetResponse,
    defaultHeaders: Record<string, string>,
    contentType: string
): Headers {
    const headers = new Headers({
        "Content-Type": contentType,
        "X-Server": "Lixnet",
        ...defaultHeaders,
    });
    for (const [headerName, headerValue] of Object.entries(response.responseHeaders)) {
        headers.set(headerName, headerValue);
    }
    for (const headerName of response.responseHeaderDeletes) {
        headers.delete(headerName);
    }
    for (const [cookieName, cookie] of Object.entries(response.responseCookies)) {
        if (cookie.type === "value") {
            const opts = cookie.options ?? {};
            // Encoded so any value is header-safe; request.cookies() decodes it back.
            const parts: string[] = [`${cookieName}=${encodeURIComponent(cookie.value ?? "")}`];
            if (opts.domain) parts.push(`Domain=${opts.domain}`);
            if (opts.path) parts.push(`Path=${opts.path}`);
            if ("maxAge" in opts && typeof (opts as any).maxAge === "number") {
                parts.push(`Max-Age=${(opts as any).maxAge}`);
            }
            if (opts.httpOnly) parts.push("HttpOnly");
            if (opts.secure) parts.push("Secure");
            if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
            headers.append("Set-Cookie", parts.join("; "));
        }
        else if (cookie.type === "delete") {
            const opts = (cookie.options ?? {}) as any;
            const parts: string[] = [`${cookieName}=`, "Max-Age=0"];
            parts.push(`Path=${opts.path ?? "/"}`);
            if (opts.domain) parts.push(`Domain=${opts.domain}`);
            if (opts.httpOnly) parts.push("HttpOnly");
            if (opts.secure) parts.push("Secure");
            if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
            headers.append("Set-Cookie", parts.join("; "));
        }
        else {
            throw new Error(`Unknown cookie type: ${cookie.type}`);
        }
    }

    return headers;
}

export default function (defaultHeaders: Record<string, string>) {
    function formatter(this: LixnetResponse) {
        const headers = buildResponseHeaders(this, defaultHeaders, "application/json");

        if (this.responseError) {
            return Response.json({
                error: this.responseError,
                ...(this.responseErrorDetail ? { detail: this.responseErrorDetail } : {}),
            }, {
                status: this.responseCode || 500,
                headers: headers,
            });
        }

        return Response.json({
            data: this.responseData,
        }, {
            status: this.responseCode || 200,
            headers: headers,
        });


    };

    return formatter;
} 