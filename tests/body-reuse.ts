// Handlers can re-read the body without the server cloning the request.
// Types: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/body-reuse.ts
// Runtime: bun tests/body-reuse.ts
import { LixnetClient, LixnetServer } from "../src/exports";

const server = new LixnetServer().route("reread", {
    handler: async ({ request }: { request: import("../src/exports").LixnetRequest }) => {
        const json = await request.json();
        const text = await request.text();
        const cloned = await request.clone().json();
        const streamed = await new Response(request.body).text();
        return {
            json: json.input,
            sameText: text === streamed,
            cloned: cloned.event,
            bodyUsed: request.bodyUsed,
            ua: request.headers().get("user-agent"),
            sameHeaders: request.headers() === request.headers(),
        };
    },
});

// A real socket, so the body is a stream like in production.
const http = Bun.serve({ port: 0, fetch: (req) => server.handle(req) });
const client = new LixnetClient<typeof server>({ rpcUrl: `http://localhost:${http.port}/rpc` });

const result = await client.call("reread", undefined, { headers: { "user-agent": "body-test" } });
console.log(result);
if (!result.sameText || result.cloned !== "reread" || result.bodyUsed || result.ua !== "body-test" || !result.sameHeaders) {
    throw new Error("body reuse failed");
}
http.stop();
