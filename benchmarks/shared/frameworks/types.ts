import type { Item } from "../data";

export type FetchHandler = (request: Request) => Promise<Response> | Response;

/** What each benchmark needs from a framework: a Fetch handler and a typed-ish client. */
export type Framework = {
    name: string;
    /** `extraRoutes` adds `r0..rN` greet-shaped routes to measure lookup cost on big routers. */
    createHandler: (extraRoutes?: number) => FetchHandler;
    createClient: (origin: string) => BenchClient;
};

export type BenchClient = {
    ping: () => Promise<string>;
    greet: (input: { name: string }) => Promise<string>;
    echo: (input: { items: Item[] }) => Promise<{ count: number; items: Item[] }>;
    /** Calls the last extra route (`r{n-1}`). */
    extra: (index: number, input: { name: string }) => Promise<string>;
};

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
