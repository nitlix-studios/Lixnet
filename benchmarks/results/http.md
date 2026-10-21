# HTTP throughput (Bun.serve, real sockets)

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Higher req/s is better. 64 concurrent keep-alive connections, 5s per run after 1s warmup. Each server has 500 extra routes registered.

## greet (zod)

| framework | req/s | p50 | p99 | errors |
| --- | --- | --- | --- | --- |
| lixnet | 137,280 | 0.46 ms | 0.95 ms | 0 |
| trpc | 73,225 | 0.75 ms | 1.91 ms | 0 |
| orpc | 103,922 | 0.55 ms | 1.31 ms | 0 |
| hono | 133,821 | 0.43 ms | 1.09 ms | 0 |
| raw fetch | 130,845 | 0.52 ms | 1.11 ms | 0 |

## echo 100 items (zod)

| framework | req/s | p50 | p99 | errors |
| --- | --- | --- | --- | --- |
| lixnet | 25,657 | 2.45 ms | 4.84 ms | 0 |
| trpc | 16,466 | 3.75 ms | 7.42 ms | 0 |
| orpc | 14,126 | 4.44 ms | 8.76 ms | 0 |
| hono | 23,681 | 2.65 ms | 5.21 ms | 0 |
| raw fetch | 24,097 | 2.52 ms | 5.03 ms | 0 |
