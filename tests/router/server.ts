// Server side: imports runtime code (zod, handlers). The client only ever does `import type`.
import { z } from "zod";
import { LixnetServer, type LixnetRequest } from "../../src/exports";

async function live({ request }: { request: LixnetRequest }): Promise<{ ok: true; ua: string | null }> {
    return { ok: true, ua: request.headers().get("user-agent") };
}

export default function createRpcServer() {
    return new LixnetServer({ debugLog: true })
        .route("greet", {
            schema: z.object({ name: z.string().min(1) }),
            handler: async ({ name, response }) => {
                response.header("x-greeted", name);
                return `Hello ${name}`;
            },
        })
        // client sends a string, handler receives a number
        .route("double", {
            schema: z.object({ n: z.string().transform(Number) }),
            handler: ({ n }) => n * 2,
        })
        // no schema: input comes from the annotated parameter minus request/response
        .route("add", { handler: ({ a, b }: { a: number; b: number }) => a + b })
        .route("live", { handler: live })
        .route("ping", { handler: () => "pong" as const });
}

export type RpcServer = ReturnType<typeof createRpcServer>;
