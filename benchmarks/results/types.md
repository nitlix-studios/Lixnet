# Type-check time vs. number of routes

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Lower is better. `tsc --noEmit` over a generated server (N routes, each with its own zod schema) and a client that calls every route and asserts its literal return type. Wall time includes compiler startup. Projects are in `types/.generated`.

## TS 5.9 · wall time

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 0.25s | 0.30s | 0.33s | 0.39s | 0.63s |
| lixnet (.route chain) | 0.24s | 0.27s | 0.38s | 0.73s | 3.61s |
| lixnet (Events contract) | 0.24s | 0.32s | 0.36s | 0.70s | 2.37s |
| trpc | 0.26s | 0.29s | 0.34s | 0.41s | 0.67s |
| orpc | 0.33s | 0.35s | 0.40s | 0.48s | 0.72s |
| hono | 0.39s | 0.45s | 0.60s | 1.15s | 3.88s |

## TS 5.9 · type instantiations

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 17,936 | 35,136 | 69,536 | 138,336 | 344,736 |
| lixnet (.route chain) | 43,842 | 137,492 | 476,667 | 1,762,517 | 10,480,067 |
| lixnet (Events contract) | 12,414 | 23,814 | 46,614 | 92,214 | 229,014 |
| trpc | 24,166 | 42,641 | 79,591 | 153,491 | 375,191 |
| orpc | 23,645 | 44,470 | 86,120 | 169,420 | 419,320 |
| hono | 213,746 | 297,971 | 498,296 | 1,026,446 | 3,630,896 |

## TS 5.9 · memory

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 97 MB | 128 MB | 134 MB | 151 MB | 173 MB |
| lixnet (.route chain) | 101 MB | 97 MB | 143 MB | 121 MB | 219 MB |
| lixnet (Events contract) | 104 MB | 92 MB | 140 MB | 114 MB | 212 MB |
| trpc | 116 MB | 93 MB | 103 MB | 113 MB | 178 MB |
| orpc | 101 MB | 132 MB | 154 MB | 128 MB | 208 MB |
| hono | 142 MB | 139 MB | 199 MB | 288 MB | 703 MB |

## TS 7 · wall time

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 0.08s | 0.07s | 0.09s | 0.12s | 0.21s |
| lixnet (.route chain) | 0.07s | 0.09s | 0.14s | 0.36s | 1.97s |
| lixnet (Events contract) | 0.07s | 0.07s | 0.09s | 0.16s | 0.53s |
| trpc | 0.07s | 0.08s | 0.09s | 0.12s | 0.24s |
| orpc | 0.08s | 0.09s | 0.10s | 0.14s | 0.25s |
| hono | 0.12s | 0.16s | 0.23s | 0.45s | 1.65s |

## TS 7 · type instantiations

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 28,320 | 55,520 | 109,920 | 218,720 | 545,120 |
| lixnet (.route chain) | 56,949 | 168,724 | 561,024 | 2,020,624 | 11,799,424 |
| lixnet (Events contract) | 12,847 | 24,672 | 48,322 | 95,622 | 237,522 |
| trpc | 24,434 | 43,009 | 80,159 | 154,459 | 377,359 |
| orpc | 35,897 | 67,322 | 130,172 | 255,872 | 632,972 |
| hono | 253,871 | 386,221 | 714,671 | 1,626,571 | 6,402,271 |

## TS 7 · memory

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 39 MB | 43 MB | 52 MB | 69 MB | 121 MB |
| lixnet (.route chain) | 39 MB | 44 MB | 54 MB | 73 MB | 132 MB |
| lixnet (Events contract) | 37 MB | 41 MB | 47 MB | 60 MB | 98 MB |
| trpc | 40 MB | 43 MB | 48 MB | 59 MB | 92 MB |
| orpc | 52 MB | 56 MB | 67 MB | 87 MB | 150 MB |
| hono | 76 MB | 93 MB | 125 MB | 192 MB | 418 MB |
