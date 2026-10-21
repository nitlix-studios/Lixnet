export type Captured = { url: string; method: string; headers: [string, string][]; body: string };

/** Records the exact Request a framework's client sends, so the server bench replays real traffic. */
export async function capture(call: () => Promise<unknown>): Promise<Captured> {
    const original = globalThis.fetch;
    let captured: Captured | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        captured = {
            url: request.url,
            method: request.method,
            headers: [...request.headers],
            body: await request.text(),
        };
        throw new Error("captured");
    }) as unknown as typeof fetch;
    await call().catch(() => {});
    globalThis.fetch = original;
    if (!captured) throw new Error("client sent no request");
    return captured;
}

export const replay = ({ url, method, headers, body }: Captured) =>
    new Request(url, { method, headers, body: method === "GET" ? undefined : body });
