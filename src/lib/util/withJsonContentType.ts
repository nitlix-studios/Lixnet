/** Merges caller headers, defaulting `Content-Type` to JSON unless the caller set one. */
export default function (init?: HeadersInit): Headers {
    const headers = new Headers(init);
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    return headers;
}
