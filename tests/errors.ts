// Runtime check for structured errors, run: bun tests/errors.ts
import { z } from "zod";
import { LixnetClient, LixnetError, LixnetServer, LixnetStreamClient, LixnetStreamServer } from "../src/exports";

const server = new LixnetServer()
    .route("signup", {
        schema: z.object({ email: z.email(), age: z.number().min(18), tags: z.array(z.string()) }),
        handler: () => ({ ok: true }),
    })
    .route("me", {
        handler: (): { id: string } => {
            throw new LixnetError("UNAUTHORIZED", "Session expired");
        },
    })
    .route("limited", {
        handler: (): null => {
            throw new LixnetError("TOO_MANY_REQUESTS", "Slow down", { data: { retryAfter: 30 } });
        },
    })
    .route("custom", {
        handler: (): null => {
            throw new LixnetError("PLAN_LIMIT", "Upgrade your plan", { status: 402 });
        },
    })
    .route("legacy", {
        handler: ({ response }) => {
            response.code(403);
            response.error("Forbidden");
            return null;
        },
    })
    .route("crash", {
        handler: (): null => {
            throw new Error("db down");
        },
    });

const streams = new LixnetStreamServer<{ s: () => number; s2: () => number }>();
streams.on([
    { event: "s", handler: () => { throw new LixnetError("FORBIDDEN", "No streaming for you"); } },
    { event: "s2", handler: ({ stream }) => { stream.emit(1); throw new LixnetError("CONFLICT", "Changed mid-stream"); } },
]);

let target: { handle: (r: Request) => Promise<Response> } = server;
globalThis.fetch = ((url: string, init: RequestInit) => target.handle(new Request(url, init))) as typeof fetch;
const client = new LixnetClient<typeof server>({ rpcUrl: "http://localhost/rpc" });
const show = (e: unknown) =>
    LixnetError.is(e) ? { is: true, code: e.code, status: e.status, message: e.message, data: e.data } : { is: false, e };

console.log("signup", JSON.stringify(show(await client.call("signup", { email: "x", age: 3, tags: [1 as any] }).catch((e) => e))));
for (const event of ["me", "limited", "custom", "legacy", "crash"] as const) {
    console.log(event, JSON.stringify(show(await client.call(event).catch((e) => e))));
}
console.log("unknown", JSON.stringify(show(await (client as any).call("nope", {}).catch((e: unknown) => e))));

target = streams;
const sc = new LixnetStreamClient<{ s: () => number; s2: () => number }>({ rpcUrl: "http://localhost/rpc" });
console.log("stream before emit", JSON.stringify(show(await sc.call("s").catch((e) => e))));
console.log("stream mid", JSON.stringify(show(await sc.call("s2").catch((e) => e))));

globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch;
console.log("html 502", JSON.stringify(show(await client.call("me").catch((e) => e))));
