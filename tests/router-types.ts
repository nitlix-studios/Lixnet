// Type-level checks, run: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/router-types.ts
import { z } from "zod";
import { LixnetClient, LixnetServer } from "../src/exports";
import type { RpcServer } from "./router/server";

const client = new LixnetClient<RpcServer>({ rpcUrl: "/rpc" });

async function check() {
    const greeting: string = await client.call("greet", { name: "a" });
    const doubled: number = await client.call("double", { n: "2" });
    const sum: number = await client.call("add", { a: 1, b: 2 });
    const me: { ok: true; ua: string | null } = await client.call("live");
    const pong: "pong" = await client.call("ping");

    // @ts-expect-error greet needs a name
    await client.call("greet", {});
    // @ts-expect-error double's client input is a string (pre-transform)
    await client.call("double", { n: 2 });
    // @ts-expect-error unknown event
    await client.call("nope");
    // @ts-expect-error output type is string
    const wrong: number = await client.call("greet", { name: "a" });

    return [greeting, doubled, sum, me, pong, wrong];
}
check;

// @ts-expect-error handler annotates name as number, schema says string
new LixnetServer().route("x", {
    schema: z.object({ name: z.string() }),
    handler: ({ name }: { name: number }) => name,
});
