# Lixnet benchmarks

Lixnet against **tRPC 11**, **oRPC 1.16** and **Hono RPC 4** (`hc`), plus a hand-written **raw fetch** handler as the floor. Every framework implements the same procedures (`shared/frameworks/*`) and `frameworks.test.ts` checks they behave identically before anything is measured.

Benchmarks run against Lixnet's built `dist/` (what users install), not `src/`.

```sh
cd benchmarks
bun install
bun run bench            # everything, sequentially; writes results/*.md
bun run bench types      # one suite (matches a step name in run-all.ts)
```

## What's measured

| Suite | File | Question it answers |
| --- | --- | --- |
| Bundle size | `bundle/size.ts` | What does the browser download for one typed call? How heavy is the Worker? |
| Type-check scaling | `types/scale.ts` | How does `tsc` time grow with 25 → 500 routes (TS 5.9 and TS 7)? |
| Cold start | `runtime/startup.ts` | Fresh process → import → register N routes → first response (serverless/Workers). |
| In-process runtime | `runtime/server.ts` | Framework overhead per call: server only, and full client round-trip, no sockets. |
| HTTP throughput | `runtime/http.ts` | req/s and p50/p99 over real sockets (`Bun.serve`, 64 connections). |

Scenarios: `ping` (no input), `greet` (small zod input), `echo` (100-item zod payload), and `greet` on a router with 500 extra routes.

Knobs: `DURATION_MS`, `CONCURRENCY`, `ONLY=lixnet,hono` (http), `COUNTS=25,500`, `TIMEOUT_MS` (types), `RUNS` (startup).

## Headline results

Apple M5 Pro, Bun 1.4.3, 2026-10-21. Full tables in `results/`.

| | lixnet | trpc | orpc | hono | raw |
| --- | --- | --- | --- | --- | --- |
| Client bundle (gzip) | **0.79 KB** | 6.07 KB | 8.09 KB | 2.04 KB | – |
| Server bundle (gzip, zod external) | **3.93 KB** | 14.00 KB | 11.36 KB | 8.95 KB | – |
| Round-trip `greet`, in-process | **1.69 µs** | 13.11 µs | 6.06 µs | 2.26 µs | 0.97 µs |
| Cold start @ 500 routes | **9.5 ms** | 15 ms | 13 ms | 13 ms | 9.1 ms |
| `tsc` @ 500 routes (TS 5.9, `routes` option) | **0.63 s** | 0.67 s | 0.72 s | 3.88 s | – |
| HTTP `greet` req/s | 54k ⚠️ | 73k | 100k | 131k | 132k |
| HTTP `echo` req/s | 17k | 16k | 13k | 23k | 23k |

## Known issues these benchmarks surfaced

1. ~~**HTTP throughput: `request.clone()` in `LixnetServer.handle`.**~~ Fixed: the body is read once and handlers re-read it from memory. `greet` went from ~54k to ~106–126k req/s (above Hono in the same runs); the headline table above predates the fix.
2. **Type-check: `.route(...)` chains are quadratic.** 500 chained routes cost 10.5M instantiations (30x the `routes` option) and 3.6 s. Each call re-instantiates `LixnetServer<…, Routes & Record<K, …>>`.
3. **Type-check: `Events` contract + `on()` slows past ~200 routes.** Few instantiations, but 2.4 s at 500 routes (TS 5.9): each `on()` call is checked against the union of every event's entry type.
4. ~~`LixnetClient` has no `fetch` option.~~ Fixed: `LixnetClient` and `LixnetStreamClient` take `fetch`.

## Caveats

- The HTTP load generator runs on the same machine as the server, so absolute req/s is lower than oha/wrk would report. Compare rows, not machines.
- tRPC is measured with mutations over `httpLink` at runtime (one request per call, like the others); the bundle uses `httpBatchLink`, its documented default.
- Cold-start "import" includes each adapter's client library and zod. zod is the same for everyone.
