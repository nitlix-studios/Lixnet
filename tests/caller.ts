// `client.caller`: every event as a typed function.
// Types: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/caller.ts
// Runtime: bun tests/caller.ts
import { z } from "zod";
import { LixnetClient, LixnetError, LixnetServer, LixnetStreamClient, LixnetStreamServer } from "../src/exports";

const server = new LixnetServer({
    routes: {
        greet: { schema: z.object({ message: z.string() }), handler: ({ message }) => ({ reply: `${message} back` }) },
        ping: { handler: () => "pong" as const },
    },
}).route("add", { handler: ({ a, b }: { a: number; b: number }) => a + b });

const client = new LixnetClient<typeof server>({
    rpcUrl: "http://local/rpc",
    fetch: (url, init) => server.handle(new Request(url, init)),
});
const caller = client.caller;

const greet: { reply: string } = await caller.greet({ message: "Hi" });
const ping: "pong" = await caller.ping();
const { add } = caller; // destructured functions keep working
const sum: number = await add({ a: 1, b: 2 }, { headers: { "x-test": "1" } });
const sameFn = caller.greet === caller.greet;
const invalid = await caller.greet({ message: 1 as unknown as string }).catch((e: LixnetError) => e.code);
// Awaiting the caller itself must not hang (it isn't a thenable).
const awaited = (await Promise.resolve(caller)) === caller;

// @ts-expect-error greet needs a message
await caller.greet({}).catch(() => null);
// @ts-expect-error add's a is a number
await caller.add({ a: "1", b: 2 }).catch(() => null);
// @ts-expect-error unknown event
await caller.nope().catch(() => null);
// @ts-expect-error greet's output has no `message`
(await caller.greet({ message: "x" })).message;

// Hand-written contracts work the same.
type Events = { live: () => { ok: boolean }; search: (input: { q?: string }) => string[] };
const contractCaller = new LixnetClient<Events>({ rpcUrl: "/rpc" }).caller;
async function contractTypes() {
    const live: { ok: boolean } = await contractCaller.live();
    const results: string[] = await contractCaller.search();
    return [live, results];
}
contractTypes;

const streamServer = new LixnetStreamServer().route("count", {
    handler: async function* ({ to }: { to: number }) {
        for (let i = 1; i <= to; i++) yield i;
    },
});
const streamCaller = new LixnetStreamClient<typeof streamServer>({
    rpcUrl: "http://local/stream",
    fetch: (url, init) => streamServer.handle(new Request(url, init)),
}).caller;
const counted: number[] = [];
await streamCaller.count({ to: 3 }, { onStreamChunk: (n) => counted.push(n) });

console.log({ greet, ping, sum, sameFn, invalid, awaited, counted });
if (greet.reply !== "Hi back" || ping !== "pong" || sum !== 3 || !sameFn || invalid !== "INVALID_INPUT" || !awaited || counted.join() !== "1,2,3") {
    throw new Error("caller failed");
}
