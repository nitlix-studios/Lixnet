# HTTP throughput (Bun.serve, real sockets)

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Higher req/s is better. 64 concurrent keep-alive connections, 5s per run after 1s warmup. Each server has 500 extra routes registered.

## greet (zod)

| framework | req/s | p50 | p99 | errors |
| --- | --- | --- | --- | --- |
| lixnet | 54,435 | 1.06 ms | 2.47 ms | 0 |
| trpc | 73,023 | 0.74 ms | 2.01 ms | 0 |
| orpc | 99,671 | 0.57 ms | 1.37 ms | 0 |
| hono | 131,074 | 0.43 ms | 1.09 ms | 0 |
| raw fetch | 131,758 | 0.52 ms | 1.11 ms | 0 |

## echo 100 items (zod)

| framework | req/s | p50 | p99 | errors |
| --- | --- | --- | --- | --- |
| lixnet | 17,372 | 3.50 ms | 7.04 ms | 0 |
| trpc | 16,013 | 3.86 ms | 7.70 ms | 0 |
| orpc | 13,112 | 4.77 ms | 9.37 ms | 0 |
| hono | 22,868 | 2.72 ms | 5.41 ms | 0 |
| raw fetch | 22,690 | 2.64 ms | 5.31 ms | 0 |
