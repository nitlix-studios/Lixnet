import lixnet from "./lixnet";
import trpc from "./trpc";
import orpc from "./orpc";
import hono from "./hono";
import raw from "./raw";
import type { FetchHandler, Framework } from "./types";

export type { BenchClient, FetchHandler, Framework } from "./types";

export const frameworks: Framework[] = [lixnet, trpc, orpc, hono, raw];

export const frameworkNames = frameworks.map((f) => f.name);

/**
 * Routes `fetch` to in-process handlers by hostname (http://lixnet/..., http://trpc/...), so clients
 * can be benchmarked without a network. Every client resolves `fetch` at call time, so patching the
 * global covers all of them, including LixnetClient which has no `fetch` option.
 */
export function installInProcessFetch(handlers: Record<string, FetchHandler>) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const handler = handlers[new URL(request.url).hostname];
        if (!handler) return original(request);
        return handler(request);
    }) as typeof fetch;
    return () => {
        globalThis.fetch = original;
    };
}

/** Hostname-safe key for a framework (used as the fake origin). */
export const hostOf = (f: Framework) => f.name.replace(/\W+/g, "");
