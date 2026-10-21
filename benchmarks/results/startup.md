# Cold start

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Lower is better. Median of 15 fresh `bun` processes per cell. "import" loads the framework's adapter module (server + client + zod), "first request" is the first call after building the router.

## Total (import + build router + first request)

| framework | import | first request | total @ 25 routes | total @ 50 routes | total @ 100 routes | total @ 200 routes | total @ 500 routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lixnet | 8.33 ms | 0.78 ms | 9.21 ms | 9.45 ms | 9.94 ms | 9.71 ms | 9.90 ms |
| trpc | 11 ms | 1.65 ms | 13 ms | 13 ms | 14 ms | 14 ms | 15 ms |
| orpc | 11 ms | 1.56 ms | 13 ms | 13 ms | 13 ms | 13 ms | 13 ms |
| hono | 9.86 ms | 1.58 ms | 12 ms | 11 ms | 12 ms | 12 ms | 13 ms |
| raw fetch | 8.36 ms | 0.61 ms | 9.01 ms | 9.15 ms | 8.23 ms | 8.66 ms | 8.17 ms |

## Router build time

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet | 0.10 ms | 0.13 ms | 0.15 ms | 0.19 ms | 0.28 ms |
| trpc | 0.95 ms | 1.20 ms | 1.67 ms | 1.88 ms | 2.83 ms |
| orpc | 0.36 ms | 0.45 ms | 0.57 ms | 0.68 ms | 1.02 ms |
| hono | 0.25 ms | 0.29 ms | 0.34 ms | 0.40 ms | 0.57 ms |
| raw fetch | 0.03 ms | 0.04 ms | 0.04 ms | 0.06 ms | 0.11 ms |
