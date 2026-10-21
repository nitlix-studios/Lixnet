<div align="center">
  <h1>Lixnet</h1>
  <h3>Lightweight, type-safe RPC over HTTP and WebSockets.<br />The tRPC and Next.js Server Actions, but for everyone.</h3>

  <a href="https://github.com/Nitlix/Lixnet">
    <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/Nitlix/Lixnet?style=social">
  </a>

  <a href="https://www.npmjs.com/package/lixnet">
    <img alt="npm version" src="https://img.shields.io/npm/v/lixnet.svg">
  </a>
  <a href="https://www.npmjs.com/package/lixnet">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dm/lixnet.svg">
  </a>
</div>

<br />

## Intro

Lixnet is a tiny yet powerful TypeScript-first RPC library for teams who want a **small, explicit RPC layer** with excellent typing, without codegen or framework lock-in.

If you like the ergonomics of **tRPC** or **Next.js Server Actions**, but want something that:

- stays close to the **Fetch** platform (`Request`/`Response`)
- works in **Bun / Next.js / Workers**
- keeps the protocol simple and inspectable

Lixnet is a good fit.

It gives you:

- **HTTP RPC** via `fetch` (`LixnetServer` + `LixnetClient`)
- **WebSocket events + callbacks** (`LixnetPeer`)
- **Zero dependencies**, with optional validation through any [Standard Schema](https://standardschema.dev) library (zod, valibot, arktype, ...)
- **Next.js-like** `request.cookies()` / `request.headers()` ergonomics inside handlers (without pulling in Next)

It’s designed to be minimal: no codegen, no schema registry, no client bundler magic.

## Table of contents

- [Quickstart (HTTP RPC)](#quickstart-http-rpc)
- [Framework adapters (server wiring)](#framework-adapters-server-wiring)
- [Inferred contract (`routes` / `server.route`)](#inferred-contract-routes--serverroute)
- [Server: `LixnetServer`](#server-lixnetserver)
- [Errors](#errors-lixneterror)
- [CORS](#cors)
- [Client: `LixnetClient`](#client-lixnetclient)
- [Handlers: `request` and `response`](#handlers-request-and-response)
- [WebSockets: `LixnetPeer`](#websockets-lixnetpeer)
- [API reference](#api-reference)
- [Contributor docs](#contributor-docs)
- [License](#license)

## Quickstart (HTTP RPC)

Install:

```sh
bun add lixnet zod # zod is optional: any Standard Schema library (zod, valibot, arktype) works
```

Other package managers:

```sh
pnpm add lixnet zod
npm i lixnet zod
```

### 1) Define an `Events` type

This is the contract shared by server and client.

```ts
type Events = {
    greet: (input: { name: string }) => Promise<string>;
};
```

### 2) Create the RPC server

Register handlers with optional schemas (any Standard Schema library), then expose an HTTP endpoint that forwards the incoming `Request` to `server.handle(...)`.

```ts
import { z } from "zod";
import { LixnetServer } from "lixnet";

type Events = {
    greet: (input: { name: string }) => Promise<string>;
};

export const server = new LixnetServer<Events>({
    debugLog: false,
});

server.on({
    event: "greet",
    schema: z.object({ name: z.string() }),
    handler: async ({ name, request, response }) => {
        // Optional: read request cookies/headers (Next-like API)
        const userAgent = request.headers().get("user-agent");
        if (userAgent) response.header("x-user-agent", userAgent);

        return `Hello, ${name}!`;
    },
});
```

### 3) Wire the HTTP endpoint

Lixnet uses the Fetch standard `Request`/`Response`, so wiring is always “forward `Request` into `server.handle(...)`”.

## Framework adapters (server wiring)

### Bun

```ts
import { server } from "./rpc/server";

Bun.serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "POST" && url.pathname === "/rpc") {
            return server.handle(req);
        }
        return new Response("Not found", { status: 404 });
    },
});
```

### Next.js Route Handler

```ts
export async function POST(req: Request) {
    return server.handle(req);
}
```

### Cloudflare Workers / standard Fetch handler

```ts
export default {
    async fetch(req: Request) {
        const url = new URL(req.url);
        if (req.method === "POST" && url.pathname === "/rpc") {
            return server.handle(req);
        }
        return new Response("Not found", { status: 404 });
    },
};
```

### 4) Create the RPC client

```ts
import { LixnetClient } from "lixnet";

type Events = {
    greet: (input: { name: string }) => Promise<string>;
};

const client = new LixnetClient<Events>({ rpcUrl: "/api/rpc" });

const message = await client.call("greet", { name: "World" });
```

If you need auth/cookies, pass `fetch` options:

```ts
await client.call(
    "greet",
    { name: "World" },
    { credentials: "include", headers: { Authorization: "Bearer ..." } },
);
```

## Inferred contract (`routes` / `server.route`)

Instead of writing an `Events` type by hand, pass your events as `routes` (or chain `.route(...)`) and let the client infer everything from `typeof server`. Experimental: `Events` + `on()` keeps working and both can be used side by side.

```ts
// cloudflare/ioServer.ts (worker only)
import { z } from "zod";
import { LixnetServer } from "lixnet";
import live from "./(functions)/live";

export default function createRpcServer(options: { defaultHeaders?: Record<string, string> } = {}) {
    return new LixnetServer({
        ...options,
        routes: {
            helloThere: {
                schema: z.object({ name: z.string() }),
                handler: ({ name }) => ({ message: `Hello ${name}` }), // name: string, from the schema
            },
            // no schema: input is the handler's parameter type minus request/response
            live: { handler: live },
        },
    });
}

export type RpcServer = ReturnType<typeof createRpcServer>;
```

`events` is an alias of `routes` (same types and behaviour) for codebases that still use the events naming; pass one or the other.

`LixnetStreamServer` takes the same `routes` option and `.route(...)`; see "HTTP streaming" in [FOR_AGENTS.md](FOR_AGENTS.md). `LixnetPeerEvents` does the same for WebSockets (see below).

`.route(name, { schema?, handler })` does the same one route at a time and can be chained after `routes`, e.g. to add events conditionally:

```ts
new LixnetServer({ routes: { helloThere: { ... } } })
    .route("live", { handler: live });
```

```ts
// cloudflare/io.ts (browser)
import type { RpcServer } from "./ioServer"; // type-only: erased at build time
import { LixnetClient } from "lixnet";

export const rpcClient = new LixnetClient<RpcServer>({ rpcUrl: "/rpc" });

await rpcClient.call("helloThere", { name: "World" }); // { message: string }
await rpcClient.call("live"); // input omitted: live takes no client input
```

- With a schema, the handler receives the schema's output and the client sends the schema's input (so `z.string().transform(Number)` means the client sends a string).
- Without a schema, annotate the handler's parameter; `request`/`response` are removed from the client input. Anything else in that parameter (e.g. an optional `db`) becomes client input, so keep server-only values out of handler params.

Keeping server code out of the client:

- Always `import type` the server type. Enable `verbatimModuleSyntax` (or the `consistent-type-imports` lint rule) so an accidental value import fails instead of bundling the worker (sharp, wasm, ...) into the browser.
- The bundle is safe either way, but type-checking still follows the import into the server files. Keep `ioServer.ts` thin (it imports handlers only) and give handlers explicit return types, so the client's tsconfig doesn't have to resolve worker-only types.
- If the client tsconfig still can't resolve worker types, emit declarations from the worker project (`tsc --emitDeclarationOnly`) and `import type` from the generated `.d.ts`.

## Server: `LixnetServer`

### Registering events

`server.on(...)` accepts either one registration object or an array.

- **`event`**: string key matching your `Events` type
- **`schema`** (optional): a Standard Schema (zod, valibot, arktype, ...) to validate `input`
- **`handler`**: receives validated input plus `{ request, response }` injections

Example registering multiple events:

```ts
server.on([
    {
        event: "greet",
        schema: z.object({ name: z.string() }),
        handler: async ({ name }) => `Hello, ${name}!`,
    },
    {
        event: "health",
        handler: async () => ({ ok: true as const }),
    },
]);
```

### Handling requests

`server.handle(request)` expects the request body to be JSON:

```json
{ "event": "someEvent", "input": { "...": "..." } }
```

Responses are JSON and shaped as either:

```json
{ "data": "..." }
```

or

```json
{ "error": "...", "code": "UNAUTHORIZED", "data": {} }
```

### Server configuration

`new LixnetServer({ ... })` supports:

- **`defaultHeaders`**: headers included on every response (unless deleted later)
- **`formatter`**: customize how `LixnetResponse` becomes a `Response`
- **`logger`** + **`debugLog`**: currently used for invalid JSON logging

Example:

```ts
const server = new LixnetServer<Events>({
    debugLog: true,
    defaultHeaders: {
        "access-control-allow-origin": "*",
    },
});
```

## Errors (`LixnetError`)

Throw a `LixnetError` from a handler to send a specific error; the client throws it back with the same `code`, `status` and `data`:

```ts
import { LixnetError } from "lixnet";

// server
throw new LixnetError("UNAUTHORIZED", "Session expired");
throw new LixnetError("TOO_MANY_REQUESTS", "Slow down", { data: { retryAfter: 30 } });
throw new LixnetError("PLAN_LIMIT", "Upgrade your plan", { status: 402 }); // custom code

// client
try {
    await client.call("me");
} catch (e) {
    if (LixnetError.is(e) && e.code === "UNAUTHORIZED") redirect("/login");
}
```

- Built-in codes and their default statuses (`LIXNET_ERROR_STATUS`): `BAD_REQUEST` 400, `INVALID_INPUT` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `TOO_MANY_REQUESTS` 429, `INTERNAL` 500. Any other string works as a code (default status 400).
- `LixnetError.is(e)` is preferred over `instanceof`: it also works when two copies of Lixnet end up in one bundle.
- Every client error is a `LixnetError` (it extends `Error`, so `e.message` is unchanged), including non-Lixnet responses such as a proxy's HTML 502.
- For errors the caller is expected to handle as part of the result, returning a typed union (`{ ok: false, ... }`) is still the better fit; `LixnetError` is for cross-cutting cases (auth, permissions, rate limits, validation).
- `response.code(403); response.error("Forbidden")` still works; the code is derived from the status (`FORBIDDEN`), or pass one: `response.error("Forbidden", { code: "NO_ACCESS" })`.

Built-in errors (both servers, same messages as before plus a `code`):

| `error` | `code` | Status |
| --- | --- | --- |
| `"Invalid JSON"` | `BAD_REQUEST` | 400 |
| `"Invalid request body"` | `BAD_REQUEST` | 400 |
| `"Event not found"` (missing `event`) | `BAD_REQUEST` | 400 |
| `"Input not found"` | `BAD_REQUEST` | 400 |
| `"Event not found"` (unknown `event`) | `NOT_FOUND` | 404 |
| `"Invalid input"` (schema failure) | `INVALID_INPUT` | 400 |
| `"Origin not allowed"` (with `cors`) | `FORBIDDEN` | 403 |
| `"Handler error"` (handler threw a non-`LixnetError`) | `INTERNAL` | 500 |

`INVALID_INPUT` always includes the validation issues, so forms can show errors per field:

```json
{
    "error": "Invalid input",
    "code": "INVALID_INPUT",
    "data": { "issues": [{ "path": ["email"], "message": "Invalid email address" }] }
}
```

Error responses always go through the formatter, so `defaultHeaders` and CORS headers are included. Keep the `error` strings stable; match on `code` in new code.

## CORS

When the RPC server is on another origin than the app (e.g. a Worker on `api.example.com`), pass `cors` instead of hand-writing CORS headers and an `OPTIONS` branch. Works on `LixnetServer` and `LixnetStreamServer`.

```ts
const server = new LixnetServer({
    cors: {
        origin: ["https://example.com", "http://localhost:3000"], // or "*", or (origin) => boolean
        credentials: true, // cookies; not allowed with origin "*"
        // maxAge: 7200,   // preflight cache in seconds (default 7200, Chrome's cap)
        // allowHeaders: ["Content-Type", "Authorization"], // default: whatever the browser asks for
        // exposeHeaders: ["X-Request-Id"],
    },
});

export default {
    async fetch(request: Request) {
        const url = new URL(request.url);
        if (url.pathname === "/rpc" && (request.method === "POST" || request.method === "OPTIONS")) {
            return server.handle(request);
        }
        return new Response("Not found", { status: 404 });
    },
};
```

- `OPTIONS` preflights get `204` with `Access-Control-Max-Age` (default 7200), so the browser preflights at most once per 2 hours per origin instead of before every call.
- Every response, errors included, gets `Access-Control-Allow-Origin` (the caller's origin, plus `Vary: Origin`) and `Access-Control-Allow-Credentials` when enabled.
- Requests whose `Origin` isn't allowed get `403 { "error": "Origin not allowed" }` without running the handler. Requests without an `Origin` header (server-to-server, SSR) are not CORS and pass through.

## Client: `LixnetClient`

`client.call(event, input, options?)`:

- sends a `POST` with `{ event, input }`
- throws a `LixnetError` (with `code`, `status`, `data`) when the response contains `{ error }`; see "Errors" below
- otherwise returns `{ data }`’s value

### Client creation

```ts
const client = new LixnetClient<Events>({
    rpcUrl: "https://api.example.com/rpc",
    // optional: any fetch-compatible function (defaults to the global fetch)
    fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
});
```

`fetch` is also how you test or SSR without a network or patching `globalThis.fetch`:

```ts
const client = new LixnetClient<typeof server>({
    rpcUrl: "http://local/rpc",
    fetch: (url, init) => server.handle(new Request(url, init)),
});
```

`LixnetStreamClient` takes the same option.

## Handlers: `request` and `response`

Handler signature is:

- your validated input fields
- plus:
    - `request`: a `Request` enhanced with `request.cookies()` and `request.headers()`
    - `response`: a `LixnetResponse` you can use to stage headers/cookies/status

Common operations:

- **Set status**: `response.code(201)`
- **Set header**: `response.header("X-Foo", "bar")`
- **Delete header**: `response.deleteHeader("x-foo")`
- **Set cookie**: `response.cookie("session", "abc", { httpOnly: true, path: "/" })`
- **Delete cookie**: `response.deleteCookie("session", { path: "/" })`

`request.cookies()` / `request.headers()` also support “read your writes” inside the handler because they merge staged response mutations.

## WebSockets: `LixnetPeer`

`LixnetPeer` is a typed event dispatcher for WebSockets with:

- **fire-and-forget events**
- **optional callbacks** (request/response style over WS)
- **optional chunking** for large payloads (see contributor docs for protocol details)

Minimal sketch:

```ts
import { LixnetPeer } from "lixnet";

type ClientToServer = {
    ping: (input: { t: number }) => Promise<{ ok: true }>;
};

type ServerToClient = {
    notify: (input: { message: string }) => void;
};

const peer = new LixnetPeer<ServerToClient, ClientToServer>();

peer.on("ping", async ({ t, socket }) => {
    return { ok: true };
});

// In your WS message handler:
// peer.handle({ data: event.data, socket: ws });
```

### Inferred events (`LixnetPeerEvents`)

Like `routes` on `LixnetServer`, each side can define the events it handles as a `LixnetPeerEvents` object and let the other side infer everything with `import type`. Each events object only describes its own side, so both sides can import each other's types without a circular type (two peers typed directly from `typeof` each other would be).

```ts
// server/events.ts
import { z } from "zod";
import { LixnetPeerEvents } from "lixnet";

export const serverEvents = new LixnetPeerEvents({
    routes: {
        hello: {
            schema: z.object({ name: z.string() }),
            handler: ({ name, socket }) => `Hello ${name}`,
        },
    },
}).route("add", { handler: ({ a, b }: { a: number; b: number }) => a + b });

// client/events.ts
export const clientEvents = new LixnetPeerEvents().route("notify", {
    handler: ({ message }: { message: string }) => console.log(message),
});

// server/socket.ts
import type { clientEvents } from "../client/events";
const peer = new LixnetPeer<typeof clientEvents>({ events: serverEvents });
peer.call("notify", { message: "hi" });

// client/socket.ts
import type { serverEvents } from "../server/events";
const peer = new LixnetPeer<typeof serverEvents>({ events: clientEvents });
peer.call("hello", { name: "World" }, { callback: (greeting) => greeting /* string */ });
```

- `events` is an alias of `routes`, and `.route(...)` chains, exactly like `LixnetServer`. Handlers get `socket` next to their input.
- With a schema, invalid input never reaches the handler; if the caller passed a `callback`, its `onError` gets a `LixnetError` with code `INVALID_INPUT`.
- A handler can't use the other side's types through its events object (that would bring the cycle back). Return a value for callbacks, or call the other side from the file that creates the peer.
- `LixnetPeer<ThisToThere, ThereToThis>` with `on(...)` keeps working.

### WebSocket setup (typical pattern)

```ts
const peer = new LixnetPeer<ServerToClient, ClientToServer>();
peer.setSocket(ws);

ws.addEventListener("message", (event) => {
    peer.handle({ data: event.data, socket: ws });
});
```

### Callbacks (request/response over WS)

```ts
await peer.call(
    "ping",
    { t: Date.now() },
    {
        callback: (result) => {
            // result is typed as Awaited<ReturnType<ClientToServer["ping"]>>
            console.log(result.ok);
        },
    },
);
```

### Large payloads (chunking)

If messages can exceed your runtime’s WS frame limits, enable chunking:

```ts
peer.setTransmissionLimit(64_000); // bytes-ish (string length)
peer.setTransmissionChunksLimit(20); // currently stored, not enforced by sender
```

## API reference

### Exports

From `src/exports.ts`:

- **`LixnetServer`**
- **`LixnetClient`**
- **`LixnetPeer`**, **`LixnetPeerEvents`**
- **`LixnetStreamServer`**, **`LixnetStreamClient`**
- **`LixnetResponse`**

Types:

- **`LXN_ServerClient_EventType`**
- **`LXNServerHandler`**
- **`FunctionInput`**
- **`LXN_ServerClient_Request`** (alias of `LixnetRequest`)
- **`LixnetRequest`**, **`LixnetCookies`**, **`LixnetHeaders`**

## Contributor docs

- **Implementation + extension guide**: [`FOR_AGENTS.md`](FOR_AGENTS.md)

## License

MIT
