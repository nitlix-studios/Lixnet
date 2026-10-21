// Generates a server + client project with N procedures for each framework/style. Every procedure
// has its own zod schema and returns a literal tag, and the client asserts that tag, so the
// type-checker has to infer each route end to end (the real cost of "type-safe RPC").

export type Project = { server: string; client: string };

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const schema = `z.object({ id: z.string(), n: z.number() })`;
const body = (i: number) => `({ id: input.id, n: input.n + ${i}, route: "r${i}" as const })`;
const assert = (i: number, expr: string) =>
    `    const r${i}: "r${i}" = (${expr}).route;`;
const clientFn = (lines: string[]) => `export async function run() {\n${lines.join("\n")}\n}\n`;

export const templates: Record<string, (n: number) => Project> = {
    "lixnet (routes)": (n) => ({
        server: `import { z } from "zod";
import { LixnetServer } from "lixnet";

export const server = new LixnetServer({
    routes: {
${range(n).map((i) => `        r${i}: { schema: ${schema}, handler: (input) => ${body(i)} },`).join("\n")}
    },
});
export type Server = typeof server;
`,
        client: `import { LixnetClient } from "lixnet";
import type { Server } from "./server";

const client = new LixnetClient<Server>({ rpcUrl: "/rpc" });
${clientFn(range(n).map((i) => assert(i, `await client.call("r${i}", { id: "a", n: 1 })`)))}`,
    }),

    "lixnet (.route chain)": (n) => ({
        server: `import { z } from "zod";
import { LixnetServer } from "lixnet";

export const server = new LixnetServer()
${range(n).map((i) => `    .route("r${i}", { schema: ${schema}, handler: (input) => ${body(i)} })`).join("\n")};
export type Server = typeof server;
`,
        client: `import { LixnetClient } from "lixnet";
import type { Server } from "./server";

const client = new LixnetClient<Server>({ rpcUrl: "/rpc" });
${clientFn(range(n).map((i) => assert(i, `await client.call("r${i}", { id: "a", n: 1 })`)))}`,
    }),

    "lixnet (Events contract)": (n) => ({
        server: `import { z } from "zod";
import { LixnetServer } from "lixnet";

export type Events = {
${range(n).map((i) => `    r${i}: (input: { id: string; n: number }) => { id: string; n: number; route: "r${i}" };`).join("\n")}
};

export const server = new LixnetServer<Events>();
${range(n).map((i) => `server.on({ event: "r${i}", schema: ${schema}, handler: (input) => ${body(i)} });`).join("\n")}
`,
        client: `import { LixnetClient } from "lixnet";
import type { Events } from "./server";

const client = new LixnetClient<Events>({ rpcUrl: "/rpc" });
${clientFn(range(n).map((i) => assert(i, `await client.call("r${i}", { id: "a", n: 1 })`)))}`,
    }),

    trpc: (n) => ({
        server: `import { z } from "zod";
import { initTRPC } from "@trpc/server";

const t = initTRPC.create();
export const router = t.router({
${range(n).map((i) => `    r${i}: t.procedure.input(${schema}).mutation(({ input }) => ${body(i)}),`).join("\n")}
});
export type Router = typeof router;
`,
        client: `import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { Router } from "./server";

const client = createTRPCClient<Router>({ links: [httpBatchLink({ url: "/trpc" })] });
${clientFn(range(n).map((i) => assert(i, `await client.r${i}.mutate({ id: "a", n: 1 })`)))}`,
    }),

    orpc: (n) => ({
        server: `import { z } from "zod";
import { os } from "@orpc/server";

export const router = {
${range(n).map((i) => `    r${i}: os.input(${schema}).handler(({ input }) => ${body(i)}),`).join("\n")}
};
export type Router = typeof router;
`,
        client: `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { Router } from "./server";

const client: RouterClient<Router> = createORPCClient(new RPCLink({ url: "/rpc" }));
${clientFn(range(n).map((i) => assert(i, `await client.r${i}({ id: "a", n: 1 })`)))}`,
    }),

    hono: (n) => ({
        server: `import { z } from "zod";
import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";

export const app = new Hono()
${range(n).map((i) => `    .post("/r${i}", sValidator("json", ${schema}), (c) => { const input = c.req.valid("json"); return c.json(${body(i)}); })`).join("\n")};
export type App = typeof app;
`,
        client: `import { hc } from "hono/client";
import type { App } from "./server";

const client = hc<App>("/");
// The response type includes the validator's 400 body, so narrow on \`ok\` like real Hono code.
${clientFn(
    range(n).map(
        (i) => `    const res${i} = await client.r${i}.$post({ json: { id: "a", n: 1 } });
    if (!res${i}.ok) throw new Error("r${i}");
${assert(i, `await res${i}.json()`)}`
    )
)}`,
    }),
};
