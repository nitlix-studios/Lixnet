// Inferred stream routes (`routes` option and `.route(...)`).
// Types: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/stream-routes.ts
// Runtime: bun tests/stream-routes.ts
import { z } from "zod";
import { LixnetStreamClient, LixnetStreamServer, type LXNStreamEmitter } from "../src/exports";

const server = new LixnetStreamServer({
    routes: {
        // generator: chunk type is what it yields
        tokens: {
            schema: z.object({ prompt: z.string() }),
            handler: async function* ({ prompt }) {
                // @ts-expect-error prompt is a string (handler is typed, not any)
                const n: number = prompt;
                for (const word of prompt.split(" ")) yield { word };
            },
        },
        // emit style: chunk type from the annotated stream
        ticks: {
            handler: async ({ count, stream }: { count: number; stream: LXNStreamEmitter<number> }) => {
                for (let i = 0; i < count; i++) stream.emit(i);
            },
        },
    },
})
    .route("letters", {
        schema: z.object({ text: z.string() }),
        handler: function* ({ text }) {
            yield* text.split("");
        },
    })
    .route("early", {
        handler: async function* ({ stream }: { stream: LXNStreamEmitter<unknown> }) {
            yield "a";
            yield "b";
            stream; // injected alongside input
        },
    });

const client = new LixnetStreamClient<typeof server>({
    rpcUrl: "http://local/stream",
    fetch: (url, init) => server.handle(new Request(url, init)),
});

const words: string[] = [];
await client.call("tokens", { prompt: "hello stream world" }, { onStreamChunk: (c) => words.push(c.word) });

const ticks: number[] = [];
await client.call("ticks", { count: 3 }, { onStreamChunk: (n) => ticks.push(n) });

const letters: string[] = [];
await client.call("letters", { text: "abc" }, { onStreamChunk: (l) => letters.push(l) });

const early: string[] = [];
await client.call("early", undefined, { onStreamChunk: (c) => early.push(c) });

// @ts-expect-error tokens needs a prompt
await client.call("tokens", {}).catch(() => null);
// @ts-expect-error ticks' count is a number
await client.call("ticks", { count: "3" }).catch(() => null);
// @ts-expect-error unknown event
await client.call("nope").catch(() => null);
await client.call("ticks", { count: 1 }, {
    // @ts-expect-error chunks are numbers
    onStreamChunk: (n: string) => n,
});

const invalid = await client.call("tokens", { prompt: 1 as unknown as string }).catch((e: Error) => e.message);

console.log({ words, ticks, letters, early, invalid });
if (words.join() !== "hello,stream,world" || ticks.join() !== "0,1,2" || letters.join() !== "a,b,c" || invalid !== "Invalid input") {
    throw new Error("stream routes failed");
}
