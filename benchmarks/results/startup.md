# Cold start

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Lower is better. Median of 15 fresh `bun` processes per cell. "import" loads the framework's adapter module (server + client + zod), "first request" is the first call after building the router.

## Total (import + build router + first request)

| framework | import | first request | total @ 25 routes | total @ 50 routes | total @ 100 routes | total @ 200 routes | total @ 500 routes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lixnet | 8.52 ms | 0.79 ms | 9.42 ms | 9.42 ms | 9.44 ms | 9.51 ms | 9.54 ms |
| trpc | 10 ms | 1.61 ms | 13 ms | 13 ms | 13 ms | 13 ms | 15 ms |
| orpc | 11 ms | 1.54 ms | 13 ms | 13 ms | 13 ms | 13 ms | 13 ms |
| hono | 9.97 ms | 1.59 ms | 12 ms | 12 ms | 12 ms | 12 ms | 13 ms |
| raw fetch | 8.24 ms | 0.62 ms | 8.89 ms | 9.19 ms | 9.20 ms | 9.23 ms | 9.05 ms |

## Router build time

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet | 0.10 ms | 0.12 ms | 0.14 ms | 0.19 ms | 0.28 ms |
| trpc | 0.94 ms | 1.12 ms | 1.41 ms | 1.78 ms | 2.86 ms |
| orpc | 0.36 ms | 0.46 ms | 0.57 ms | 0.71 ms | 0.94 ms |
| hono | 0.24 ms | 0.29 ms | 0.34 ms | 0.40 ms | 0.57 ms |
| raw fetch | 0.03 ms | 0.03 ms | 0.04 ms | 0.07 ms | 0.11 ms |
