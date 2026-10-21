// Runtime check, run: bun tests/router/run.ts
import { LixnetClient } from "../../src/exports";
import createRpcServer, { type RpcServer } from "./server";

const server = createRpcServer();
globalThis.fetch = ((url: string, init: RequestInit) =>
    server.handle(new Request(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), "user-agent": "test" } }))) as typeof fetch;

const client = new LixnetClient<RpcServer>({ rpcUrl: "http://localhost/rpc" });

console.log({
    greet: await client.call("greet", { name: "Nitlix" }),
    double: await client.call("double", { n: "21" }),
    add: await client.call("add", { a: 1, b: 2 }),
    live: await client.call("live"),
    ping: await client.call("ping"),
    invalid: await client.call("greet", { name: "" }).catch((e: Error) => e.message),
});
