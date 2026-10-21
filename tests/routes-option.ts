// Type + runtime checks for the `routes` constructor option.
// Types: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/routes-option.ts
// Runtime: bun tests/routes-option.ts
import { z } from "zod";
import * as v from "valibot";
import { LixnetClient, LixnetError, LixnetServer, type LixnetRequest } from "../src/exports";

const server = new LixnetServer({
    exposeErrors: true,
    routes: {
        greet: {
            schema: z.object({ name: z.string() }),
            handler: ({ name, response }) => {
                // @ts-expect-error name is a string, so this proves the handler is typed (not any)
                const n: number = name;
                response.header("x-greeted", name);
                return `Hello ${name}` as const;
            },
        },
        double: {
            schema: v.object({ n: v.pipe(v.string(), v.transform(Number)) }),
            handler: async ({ n }) => n * 2,
        },
        add: { handler: ({ a, b }: { a: number; b: number; request: LixnetRequest }) => a + b },
        ping: { handler: () => "pong" as const },
        guarded: {
            handler: (): { secret: string } => {
                throw new LixnetError("FORBIDDEN", "Nope");
            },
        },
    },
})
    // .route() still chains on top of the routes option
    .route("extra", { schema: z.object({ id: z.string() }), handler: ({ id }) => ({ id }) });

new LixnetServer({
    routes: {
        // @ts-expect-error handler annotates name as number, schema says string
        bad: { schema: z.object({ name: z.string() }), handler: ({ name }: { name: number }) => name },
    },
});

globalThis.fetch = ((url: string, init: RequestInit) => server.handle(new Request(url, init))) as typeof fetch;
const client = new LixnetClient<typeof server>({ rpcUrl: "http://localhost/rpc" });

async function run() {
    const greet: `Hello ${string}` = await client.call("greet", { name: "Nitlix" });
    const double: number = await client.call("double", { n: "21" });
    const add: number = await client.call("add", { a: 1, b: 2 });
    const ping: "pong" = await client.call("ping");
    const extra: { id: string } = await client.call("extra", { id: "x" });
    const guarded = await client.call("guarded").catch((e: LixnetError) => `${e.code}: ${e.message}`);

    // @ts-expect-error double's client input is a string (pre-transform)
    await client.call("double", { n: 2 }).catch(() => null);
    // @ts-expect-error add needs b
    await client.call("add", { a: 1 }).catch(() => null);
    // @ts-expect-error unknown event
    await client.call("nope").catch(() => null);

    console.log({ greet, double, add, ping, extra, guarded });
}
await run();

// `events` is an alias of `routes`, with the same inference.
const eventsServer = new LixnetServer({
    events: {
        greet: {
            schema: z.object({ name: z.string() }),
            handler: ({ name }) => {
                // @ts-expect-error name is a string (handler is typed, not any)
                const n: number = name;
                return `Hi ${name}`;
            },
        },
        add: { handler: ({ a, b }: { a: number; b: number }) => a + b },
    },
});

// @ts-expect-error routes and events can't both be passed
new LixnetServer({ routes: { a: { handler: () => 1 } }, events: { b: { handler: () => 2 } } });

async function runEvents() {
    globalThis.fetch = ((url: string, init: RequestInit) => eventsServer.handle(new Request(url, init))) as typeof fetch;
    const eventsClient = new LixnetClient<typeof eventsServer>({ rpcUrl: "http://localhost/rpc" });
    const greet: string = await eventsClient.call("greet", { name: "events" });
    const add: number = await eventsClient.call("add", { a: 2, b: 3 });
    // @ts-expect-error add needs b
    await eventsClient.call("add", { a: 1 }).catch(() => null);
    console.log({ greet, add });
}
await runEvents();
