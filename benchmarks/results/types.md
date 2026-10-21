# Type-check time vs. number of routes

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Lower is better. `tsc --noEmit` over a generated server (N routes, each with its own zod schema) and a client that calls every route and asserts its literal return type. Wall time includes compiler startup. Projects are in `types/.generated`.

## TS 5.9 · wall time

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 0.36s | 0.30s | 0.31s | 0.38s | 0.64s |
| lixnet (.route chain) | 0.23s | 0.27s | 0.37s | 0.73s | 3.05s |
| lixnet (Events contract) | 0.24s | 0.28s | 0.38s | 0.66s | 2.69s |
| trpc | 0.25s | 0.29s | 0.32s | 0.40s | 0.61s |
| orpc | 0.35s | 0.37s | 0.36s | 0.45s | 0.64s |
| hono | 0.38s | 0.44s | 0.56s | 1.17s | 3.76s |

## TS 5.9 · type instantiations

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 17,485 | 34,235 | 67,735 | 134,735 | 335,735 |
| lixnet (.route chain) | 43,843 | 137,493 | 476,668 | 1,762,518 | 10,480,068 |
| lixnet (Events contract) | 12,413 | 23,813 | 46,613 | 92,213 | 229,013 |
| trpc | 24,166 | 42,641 | 79,591 | 153,491 | 375,191 |
| orpc | 23,645 | 44,470 | 86,120 | 169,420 | 419,320 |
| hono | 213,746 | 297,971 | 498,296 | 1,026,446 | 3,630,896 |

## TS 5.9 · memory

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 98 MB | 130 MB | 89 MB | 111 MB | 185 MB |
| lixnet (.route chain) | 101 MB | 97 MB | 143 MB | 122 MB | 220 MB |
| lixnet (Events contract) | 104 MB | 94 MB | 141 MB | 118 MB | 212 MB |
| trpc | 116 MB | 93 MB | 103 MB | 112 MB | 178 MB |
| orpc | 100 MB | 121 MB | 153 MB | 178 MB | 208 MB |
| hono | 142 MB | 139 MB | 199 MB | 289 MB | 701 MB |

## TS 7 · wall time

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 0.12s | 0.07s | 0.10s | 0.12s | 0.26s |
| lixnet (.route chain) | 0.07s | 0.08s | 0.15s | 0.35s | 2.03s |
| lixnet (Events contract) | 0.06s | 0.07s | 0.10s | 0.16s | 0.52s |
| trpc | 0.07s | 0.07s | 0.09s | 0.12s | 0.21s |
| orpc | 0.09s | 0.08s | 0.12s | 0.13s | 0.23s |
| hono | 0.12s | 0.17s | 0.21s | 0.51s | 1.69s |

## TS 7 · type instantiations

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 27,946 | 54,771 | 108,421 | 215,721 | 537,621 |
| lixnet (.route chain) | 56,950 | 168,725 | 561,025 | 2,020,625 | 11,799,425 |
| lixnet (Events contract) | 12,846 | 24,671 | 48,321 | 95,621 | 237,521 |
| trpc | 24,434 | 43,009 | 80,159 | 154,459 | 377,359 |
| orpc | 35,897 | 67,322 | 130,172 | 255,872 | 632,972 |
| hono | 253,871 | 386,221 | 714,671 | 1,626,571 | 6,402,271 |

## TS 7 · memory

| framework | 25 routes | 50 routes | 100 routes | 200 routes | 500 routes |
| --- | --- | --- | --- | --- | --- |
| lixnet (routes) | 39 MB | 44 MB | 52 MB | 69 MB | 122 MB |
| lixnet (.route chain) | 39 MB | 44 MB | 54 MB | 73 MB | 133 MB |
| lixnet (Events contract) | 38 MB | 41 MB | 47 MB | 60 MB | 99 MB |
| trpc | 40 MB | 43 MB | 48 MB | 59 MB | 92 MB |
| orpc | 52 MB | 56 MB | 67 MB | 87 MB | 150 MB |
| hono | 76 MB | 93 MB | 125 MB | 192 MB | 418 MB |
