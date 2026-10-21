// Runtime check that any Standard Schema library works, run: bun tests/schemas.ts
import { z } from "zod";
import * as v from "valibot";
import { LixnetClient, LixnetServer } from "../src/exports";

export const server = new LixnetServer({ exposeErrors: true })
    .route("zod", {
        schema: z.object({ n: z.string().transform(Number) }),
        handler: ({ n }) => n + 1,
    })
    .route("valibot", {
        schema: v.object({ email: v.pipe(v.string(), v.email()) }),
        handler: ({ email }) => email.toUpperCase(),
    })
    .route("async", {
        schema: z.object({ id: z.string() }).refine(async ({ id }) => id !== "taken", "taken"),
        handler: ({ id }) => id,
    });

globalThis.fetch = ((url: string, init: RequestInit) => server.handle(new Request(url, init))) as typeof fetch;
const client = new LixnetClient<typeof server>({ rpcUrl: "http://localhost/rpc" });
const fail = (e: Error) => `${e.message} (${e.cause})`;

console.log({
    zod: await client.call("zod", { n: "41" }),
    valibot: await client.call("valibot", { email: "a@b.co" }),
    valibotInvalid: await client.call("valibot", { email: "nope" }).catch(fail),
    asyncOk: await client.call("async", { id: "free" }),
    asyncInvalid: await client.call("async", { id: "taken" }).catch(fail),
});
