// The `fetch` client option: no globalThis.fetch patching.
// Types: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/fetch-option.ts
// Runtime: bun tests/fetch-option.ts
import { z } from "zod";
import { LixnetClient, LixnetServer, LixnetStreamClient, LixnetStreamServer, type LixnetFetch } from "../src/exports";

const server = new LixnetServer().route("greet", {
    schema: z.object({ name: z.string() }),
    handler: ({ name }) => `Hello ${name}`,
});
const streamServer = new LixnetStreamServer().route("count", {
    handler: async function* ({ to }: { to: number }) {
        for (let i = 1; i <= to; i++) yield i;
    },
});

const calls: string[] = [];
const inProcess =
    (handle: (request: Request) => Promise<Response>): LixnetFetch =>
    (url, init) => {
        calls.push(url);
        return handle(new Request(url, init));
    };

globalThis.fetch = (() => {
    throw new Error("global fetch must not be used");
}) as unknown as typeof fetch;

const client = new LixnetClient<typeof server>({ rpcUrl: "http://local/rpc", fetch: inProcess((r) => server.handle(r)) });
const streamClient = new LixnetStreamClient<typeof streamServer>({
    rpcUrl: "http://local/stream",
    fetch: inProcess((r) => streamServer.handle(r)),
});

const greeting: string = await client.call("greet", { name: "fetch" });
const chunks: number[] = [];
await streamClient.call("count", { to: 3 }, { onStreamChunk: (n) => chunks.push(n) });

console.log({ greeting, chunks, calls });
if (greeting !== "Hello fetch" || chunks.join() !== "1,2,3" || calls.length !== 2) throw new Error("fetch option failed");
