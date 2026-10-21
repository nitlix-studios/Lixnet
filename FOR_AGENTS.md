# Lixnet: usage guide for agents

This file is a **complete, standalone usage guide** intended for AI agents (and humans) consuming Lixnet from npm.

When Lixnet is installed, you typically see built `*.js` + `*.d.ts`, not the source `*.ts`. The goal here is that an agent can **read only this markdown** and immediately:

- implement a new RPC server + client
- add new endpoints safely
- wire Lixnet into Bun / Next.js / Workers
- use `request.cookies()` / `request.headers()` and `response.*` correctly
- use `LixnetPeer` over WebSockets (including callbacks + large payload chunking)

All examples are written for **TypeScript** and assume a Fetch-compatible runtime.

## Goals (implicit contract)

- **Fetch-first**: everything is `Request`/`Response` compatible (Bun/Node/Next/Workers).
- **Type-first**: users bring their own `Events` type; Lixnet only derives `input`/`output` from function types.
- **Stable wire shapes**:
    - HTTP request body: `{ event, input }`
    - HTTP response body: `{ data }` or `{ error }`
    - WS messages: event/callback/transmission shapes described below

## What Lixnet is

Lixnet provides two related primitives:

- **HTTP RPC**: `LixnetServer` + `LixnetClient` for request/response RPC over HTTP (JSON).
- **WebSocket RPC**: `LixnetPeer` for event-based messaging over a `WebSocket`, with optional callbacks and an optional chunking layer for large payloads.

The package entrypoint exports these primitives and a small request/response helper layer.

## Quickstart (HTTP RPC)

Install:

```sh
bun add lixnet zod # zod is optional: any Standard Schema library (zod, valibot, arktype) works
```

### 1) Define your contract (`Events`)

Define an `Events` type where each key is an RPC name and each value is a **function type** describing input and output.

```ts
export type Events = {
    greet: (input: { name: string }) => Promise<string>;
    add: (input: { a: number; b: number }) => number;
};
```

### 2) Create the RPC server (`LixnetServer`)

```ts
import { z } from "zod";
import { LixnetServer } from "lixnet";
import type { Events } from "./events";

export const server = new LixnetServer<Events>({
    debugLog: false,
    defaultHeaders: {
        // example defaults; you can remove these
        "x-powered-by": "lixnet",
    },
});

server.on([
    {
        event: "greet",
        schema: z.object({ name: z.string().min(1) }),
        handler: async ({ name, request, response }) => {
            // Read inbound headers/cookies (Next-like APIs)
            const ua = request.headers().get("user-agent");
            if (ua) response.header("x-user-agent", ua);

            // Stage cookies/headers/status
            response.cookie("lastGreeting", name, { path: "/", maxAge: 60 });

            return `Hello, ${name}!`;
        },
    },
    {
        event: "add",
        schema: z.object({ a: z.number(), b: z.number() }),
        handler: ({ a, b }) => a + b,
    },
]);
```

### 3) Wire the endpoint (Bun / Next.js / Workers)

#### Bun (`Bun.serve`)

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

#### Next.js Route Handler (`app/api/rpc/route.ts`)

```ts
import { server } from "@/rpc/server";

export async function POST(req: Request) {
    return server.handle(req);
}
```

#### Cloudflare Workers / standard Fetch handler

```ts
import { server } from "./rpc/server";

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

### 4) Create the client (`LixnetClient`)

```ts
import { LixnetClient } from "lixnet";
import type { Events } from "./events";

const client = new LixnetClient<Events>({
    rpcUrl: "http://localhost:3000/rpc",
});

const msg = await client.call("greet", { name: "World" });
const sum = await client.call("add", { a: 1, b: 2 });
```

`input` can be left out when the event has no required input fields (`live: () => ...` or `search: (input: { q?: string }) => ...`); Lixnet sends `{}`:

```ts
const me = await client.call("live");
```

If you need cookies/auth, pass `RequestInit` (example):

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

## Agent playbook (how to “act”)

- **Add a new HTTP RPC** (inferred contract): add `name: { schema?, handler }` to the server's `routes` (or a `.route("name", { ... })` to the chain); the client picks it up through `typeof server`.
- **Add a new HTTP RPC** (`Events` contract):
    - Add a new key to your `Events` type.
    - Register it via `server.on({ event: "...", schema?, handler })`.
    - Call it with `client.call("...", input)`.
- **Validate inputs**: always provide `schema` for anything exposed publicly. The schema's output type is checked against the event's input type, so a schema that drifts from `Events` is a compile error.
- **Set headers/cookies/status**: use `response.header(...)`, `response.cookie(...)`, `response.code(...)`.
- **Read request headers/cookies**: use `request.headers().get(...)` and `request.cookies().get(...)`.
- **Avoid breaking changes**:
    - Do not change existing event names or input shapes without coordinating with the client.
    - Keep the HTTP endpoint stable (`POST` JSON body `{ event, input }`).

## Package surface (exports)

From the package entrypoint:

- **Classes**
    - `LixnetServer`
    - `LixnetClient`
    - `LixnetPeer`
    - `LixnetStreamServer`, `LixnetStreamClient`
    - `LixnetResponse`
- **Types**
    - `LixnetError` (class), `LIXNET_ERROR_STATUS`, `LixnetErrorCode`, `LixnetIssue`
    - `StandardSchemaV1`
    - `InferLixnetEvents`, `LixnetRoute`, `LixnetRoutes` (inferred contract)
    - `LixnetServerBaseOptions`, `LixnetCorsOptions`, `LXNCallArgs`, `LXNStreamEmitter`, `LXNStreamCallOptions`
    - `LXN_ServerClient_EventType`
    - `LXNServerHandler`
    - `FunctionInput`
    - `LXN_ServerClient_Request` (alias of `LixnetRequest`)
    - `LixnetRequest`, `LixnetCookies`, `LixnetHeaders`

## HTTP RPC: mental model

### The “events” type

Both the server and client are generic over an `Events` object type (`LXN_ServerClient_EventType` is just `object`).

Each key is an event name and each value is a **function type** describing the RPC signature:

- Input type is `FunctionInput<Events[K]>` (the function’s first parameter type).
- Output type is `Awaited<ReturnType<Events[K]>>`.

This is how Lixnet achieves end-to-end typing without codegen: you define an `Events` type in your app and use it for both server and client.

### Handler input shape (important)

Internally, the server calls the user’s handler with:

- **validated user input** (spread from `input`)
- plus injections:
    - `request: LixnetRequest` (a proxied Request)
    - `response: LixnetResponse` (the mutable accumulator)

This is encoded in `src/lib/server.ts` as:

- `FunctionInput<Events[TName]> & { request: LixnetRequest, response: LixnetResponse }`

If you ever change injection names/types, it’s a breaking change.

### Handler examples (common patterns)

#### Returning data vs “void”

If your handler returns `undefined`/`null`, Lixnet will not set `.data(...)` automatically. If you want an explicit `data`, return it.

```ts
server.on({
    event: "noOp",
    handler: async ({ response }) => {
        response.code(204);
        // return undefined; // no {data} payload
    },
});
```

#### Setting status codes

```ts
server.on({
    event: "createUser",
    schema: z.object({ email: z.string().email() }),
    handler: async ({ email, response }) => {
        response.code(201);
        return { id: "user_123", email };
    },
});
```

#### Cookies

```ts
server.on({
    event: "login",
    schema: z.object({ token: z.string() }),
    handler: async ({ token, request, response }) => {
        const existing = request.cookies().get("session")?.value;
        if (existing) response.deleteCookie("session", { path: "/" });
        response.cookie("session", token, {
            httpOnly: true,
            path: "/",
            sameSite: "lax",
        });
        return { ok: true as const };
    },
});
```

#### Headers (including append/delete)

```ts
server.on({
    event: "corsPing",
    handler: async ({ response }) => {
        response.header("access-control-allow-origin", "*");
        response.header("access-control-allow-methods", "POST, OPTIONS");
        return { ok: true as const };
    },
});
```

### Request flow

`LixnetServer.handle(request: Request)`:

1. Clones the incoming `Request` (`request.clone()`) because parsing consumes the body.
2. Creates a `LixnetResponse` instance, which accumulates:
    - `data` or `error`
    - status code
    - staged headers to set/delete
    - staged cookies to set/delete
3. Parses JSON body and validates it’s an object shaped like:
    - `event` (required)
    - `input` (required; can be any JSON)
4. Looks up the registered event handler by `event` name.
5. If a schema was provided at registration time, validates `input` through its Standard Schema interface (`schema["~standard"].validate(...)`, awaited, so async refinements work). Zod 4, valibot, arktype and Effect Schema all qualify.
6. Wraps the cloned `Request` into a `LixnetRequest` proxy via `wrapLixnetRequest(...)`:
    - `request.cookies()` gives a Next.js-like cookie API backed by the request snapshot plus staged response mutations.
    - `request.headers()` gives a Next.js-like headers API backed by the request snapshot plus staged response mutations.
7. Calls the handler with:
    - validated input fields spread into the handler input object
    - `request` (the wrapped request)
    - `response` (the same `LixnetResponse` used to build the final Response)
8. If the handler returns a non-`null`/non-`undefined` value, it is set as `data`.
9. Returns `response.format()` which produces a real `Response`.

### HTTP wire format (must stay stable)

Inbound:

```json
{ "event": "string", "input": {} }
```

Outbound:

- Success:

```json
{ "data": {} }
```

- Error:

```json
{ "error": "string", "code": "STRING", "data": {}, "detail": "string" }
```

`code` is always present; `data` only when the error carries data; `detail` only with `exposeErrors`.

### Response formatting

Formatting is intentionally pluggable:

- `LixnetServer` accepts an optional `formatter` in its constructor.
- If not provided, it uses `getDefaultFormatter(defaultHeaders)` which:
    - Ensures JSON content type.
    - Applies staged header sets and deletes.
    - Converts staged cookie operations into one or more `Set-Cookie` headers.
    - Serializes response as:
        - `{ error: string }` with status `responseCode || 500` when `.error(...)` was called.
        - `{ data: any }` with status `responseCode || 200` otherwise.

Cookie values are written with `encodeURIComponent` (and decoded again by `request.cookies()`), so any string is safe to store. Cookie names must be RFC 6265 tokens and `path`/`domain` must not contain `;`, CR or LF; `response.cookie(...)` / `response.deleteCookie(...)` throw immediately otherwise, so the failure surfaces as a handler error instead of breaking response formatting.

### Errors (`LixnetError`)

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

### Debugging errors

- `debugLog: true` logs every failed request through `logger` (default: `console.error`), including the event name and the underlying exception or validation error as `cause`.
- `exposeErrors: true` adds that error's message to the response as `{ error, detail }`. `LixnetClient` then throws a `LixnetError` with `cause: detail`. Keep it off in production: exception messages can leak internals.
- The `error` string itself never changes, so code matching on `"Handler error"` keeps working.

### CORS

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

### Default headers

`LixnetServer` accepts `defaultHeaders` which are included in every formatted response (unless deleted later by the handler).

## HTTP Client: mental model

`LixnetClient` is a minimal fetch wrapper:

- Constructed with `{ rpcUrl }`.
- `call(event, input, options?)` sends:
    - method `POST`
    - JSON body `{ event, input }`
    - header `Content-Type: application/json`
    - accepts user-provided `RequestInit` `options` (credentials, mode, signal, ...); `headers` are merged with the default `Content-Type`, and `method`/`body` are always set by Lixnet
- Expects JSON response shaped like:
    - `{ error: string }` OR `{ data: any }`
- Throws `Error(json.error)` when `error` exists, otherwise returns `data`.

Notes:

- There is no built-in retry, timeout, or streaming.
- If you add additional fields to the server response, keep `{ error }` / `{ data }` stable.

### Client examples

#### Absolute vs relative `rpcUrl`

- In browsers, `"/rpc"` targets the current origin.
- In server-side scripts, prefer a full URL like `"http://localhost:3000/rpc"`.

```ts
const browserClient = new LixnetClient<Events>({ rpcUrl: "/rpc" });
const nodeClient = new LixnetClient<Events>({
    rpcUrl: "http://localhost:3000/rpc",
});
```

#### Error handling

`client.call(...)` throws `Error(json.error)` when the server responds with `{ error }`.

```ts
try {
    await client.call("greet", { name: "" });
} catch (e) {
    // e is Error("Invalid input") (when schema fails)
    console.error(e);
}
```

## Request/Response helpers

### `LixnetResponse`

`LixnetResponse` is a mutable accumulator used during request handling:

- `.data(...)` sets the payload.
- `.error(...)` sets an error string (and toggles formatted shape to `{ error }`).
- `.code(...)` sets the status code used by the formatter.
- `.header(...)`, `.deleteHeader(...)`, `.headers(...)` stage header operations.
- `.cookie(...)`, `.deleteCookie(...)` stage cookie operations.
- `.format()` produces a `Response` (by calling the configured formatter).

### `LixnetRequest` / `wrapLixnetRequest`

`wrapLixnetRequest(...)` returns a `Proxy` over the `Request` which:

- Adds `cookies()` returning `LixnetCookies`.
- Adds `headers()` returning `LixnetHeaders`.

Both wrappers are “read from request snapshot, write into response staging”:

- Reading comes from a snapshot copy (so handler mutations do not alter the inbound request).
- Writing uses callbacks that call into `LixnetResponse` staging stores.

This emulates the ergonomic parts of Next.js’ server runtime without importing Next.js.

## HTTP streaming (`LixnetStreamServer` / `LixnetStreamClient`)

Same request shape and error handling as `LixnetServer`, but the handler gets a `stream` injection and the response is NDJSON (`application/x-ndjson`), one frame per line.

```ts
streamServer.on({
    event: "generate",
    schema: z.object({ prompt: z.string() }),
    handler: async ({ prompt, stream, response }) => {
        response.cookie("seen", "1"); // fine: nothing emitted yet
        for await (const token of llm(prompt, { signal: stream.signal })) {
            stream.emit(token);
        }
    },
});

await streamClient.call("generate", { prompt: "hi" }, { onStreamChunk: (t) => print(t) });
```

- The response (status, headers, cookies) is sent on the first `stream.emit(...)`, or when the handler returns. Header/cookie changes after the first emit are ignored.
- A handler that throws before emitting gets a normal JSON error response (500), same as `LixnetServer`.
- A handler that throws after emitting ends the stream with an `{ "error": "Handler error" }` frame (plus `detail` with `exposeErrors`).
- `stream.signal` aborts when the client disconnects; `emit` is a no-op from then on.
- `LixnetStreamClient.call(...)` resolves when the stream ends and throws on non-2xx responses or error frames.

Frames:

```json
{ "stream": true, "data": {} }
{ "error": "string", "detail": "string?" }
```

## WebSocket peer: mental model

`LixnetPeer<ThisToThereEvents, ThereToThisEvents, SocketType>` provides:

- **Outgoing calls**: `peer.call(event, input, { callback? })`
    - Sends `{ event, data, rf? }` over the socket (JSON string).
    - If `callback` is provided, it stores it in `rb` keyed by a generated id (`rf`), and expects the remote to reply with `{ rb: <id>, data: <result> }`.
- **Incoming handlers**: `peer.on(event, handler)`
    - Stores handler functions in `eventHandlers`.
- **Inbound dispatch**: `peer.handle({ data, socket })`
    - Accepts incoming `data` (typically `event.data` from a WS message).
    - Supports:
        - Normal events: JSON string → `{ event, data, rf? }`
        - Callback responses: `{ rb, data }`
        - Chunked transmissions (see below)

### WebSocket wire formats (must stay stable)

Normal outbound event (no callback):

```json
{ "event": "name", "data": {} }
```

Normal outbound event (with callback id):

```json
{ "event": "name", "data": {}, "rf": "LXN-..." }
```

Callback response:

```json
{ "rb": "LXN-...", "data": {} }
```

## WebSockets: complete example (`LixnetPeer`)

Define two contracts:

- `ThisToThereEvents`: what _this_ side can send
- `ThereToThisEvents`: what _this_ side can receive/handle

### Server-side example (Bun WebSocket)

```ts
import { LixnetPeer } from "lixnet";

type ServerToClient = {
    notify: (input: { message: string }) => void;
};

type ClientToServer = {
    ping: (input: { t: number }) => Promise<{ ok: true }>;
};

const peer = new LixnetPeer<ServerToClient, ClientToServer>();

peer.on("ping", async ({ t, socket }) => {
    // socket is whatever you pass into peer.handle(...)
    return { ok: true };
});

// Example wiring: you must set the socket and forward messages into peer.handle(...)
peer.setSocket(ws);
ws.addEventListener("message", (event) => {
    peer.handle({ data: event.data, socket: ws });
});
```

### Client-side example (browser WebSocket)

```ts
import { LixnetPeer } from "lixnet";

type ClientToServer = {
    ping: (input: { t: number }) => Promise<{ ok: true }>;
};

type ServerToClient = {
    notify: (input: { message: string }) => void;
};

const ws = new WebSocket("ws://localhost:3000/ws");
const peer = new LixnetPeer<ClientToServer, ServerToClient>();

peer.setSocket(ws);
ws.addEventListener("message", (event) => {
    peer.handle({ data: event.data, socket: ws });
});

peer.on("notify", ({ message }) => {
    console.log("notify:", message);
});

await peer.call(
    "ping",
    { t: Date.now() },
    {
        callback: (result) => {
            console.log("pong:", result.ok);
        },
    },
);
```

### Chunking / large payload transmissions

If `transmissionLimit !== -1` and the outgoing JSON would exceed the limit, `call(...)` switches to a chunked protocol:

1. Sender emits a “starter” message `{ tId, event, chunkCount, rf? }`.
2. Receiver stores an entry in `transmissions[tId]` and replies `{ launch: true, tId }`.
3. Sender then sends chunk messages as strings shaped like:
    - `"${tId}.${chunkIndex}.${chunkPayload}"`
4. Receiver collects chunks, assembles them in order, parses JSON, then dispatches to the registered handler.

There is a basic “abandoned transmission” / “slow transmission abuse” cleanup mechanism via `transmissionSecurityCheck`.

If you touch this protocol, keep it backwards compatible or bump major version (it’s wire-level behavior).

### Chunking protocol details

- **Starter** (JSON string):
    - `{ tId: "LXN-...", event: "name", chunkCount: number, rf?: "LXN-..." }`
- **Launch** (JSON string):
    - `{ launch: true, tId: "LXN-..." }`
- **Chunk** (raw string, not JSON; ids are prefixed `LXN-`, see `src/lib/vars.ts`):
    - `"LXN-....<dot><chunkIndex>.<chunkData>"`

Security/cleanup notes:

- Receiver schedules `transmissionSecurityCheck` after 30s on starter receipt.
- Starters with `chunkCount` above `transmissionChunksLimit` (default 20) or chunks with an out-of-range index are ignored; the sender throws if its payload needs more chunks than its own limit.
- The check prunes:
    - abandoned transmissions (no chunks or last chunk > 30s ago)
    - very slow transmissions (estimated completion > 5 minutes)

## How to extend safely

- **Adding new features**:
    - Prefer additive changes (new fields) over changing existing shapes/strings.
    - Keep `LixnetServer.handle(...)` accepting `{ event, input }` unchanged.
    - Keep `LixnetClient.call(...)` returning `data` and throwing on `error`.
- **Changing cookie/header behavior**:
    - Be careful: `wrapLixnetRequest` merges staged response headers/cookies into the read APIs; this is relied upon for “read your writes” inside a handler.
    - Ensure header delete semantics remain case-insensitive (uses `toLowerCase()`).
- **Changing formatter**:
    - Default formatter must remain usable in any Fetch-compatible runtime (Node/Next/Bun/Workers).
    - Preserve multiple `Set-Cookie` support (uses `headers.append`).
- **Versioning**:
    - Wire protocol changes (HTTP response shape, WS messages/chunking) should be treated as breaking.

## Where to look first

- `src/lib/server.ts`: HTTP RPC, `.route(...)`, request/response injection.
- `src/lib/serverbase.ts`: shared parsing, Standard Schema validation, CORS, error staging.
- `src/lib/util/request.ts`: request wrappers (cookies/headers), and the `wrapLixnetRequest` proxy.
- `src/lib/util/response.ts`: response accumulator.
- `src/lib/util/getDefaultFormatter.ts`: default serialization, headers/cookies.
- `src/lib/client.ts`: HTTP client.
- `src/lib/peer.ts`: WebSocket peer + chunking protocol.
