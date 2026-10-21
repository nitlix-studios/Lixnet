import { frameworks } from "../shared/frameworks";

// Child process for runtime/http.ts: serves one framework on one port.
const [name, port] = process.argv.slice(2);
const framework = frameworks.find((f) => f.name === name);
if (!framework || !port) {
    console.error("usage: bun runtime/serve.ts <framework> <port>");
    process.exit(1);
}

const handler = framework.createHandler(500);
Bun.serve({ port: Number(port), fetch: handler });
console.log("ready");
