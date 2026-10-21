# Bundle size

_2026-10-21 · Apple M5 Pro, 18 cores, 48GB RAM, darwin arm64, Bun 1.4.3_

Smaller is better. `Bun.build --minify`; client targets the browser, server targets Bun with zod external. Entries live in `bundle/entries`.

## client

| framework | minified | gzip | brotli | vs smallest |
| --- | --- | --- | --- | --- |
| lixnet | 1.58 KB | 0.90 KB | 0.78 KB | 1.0x |
| hono | 4.82 KB | 2.04 KB | 1.84 KB | 2.3x |
| trpc | 17.33 KB | 6.07 KB | 5.39 KB | 6.7x |
| orpc | 21.95 KB | 8.09 KB | 7.26 KB | 9.0x |

## server

| framework | minified | gzip | brotli | vs smallest |
| --- | --- | --- | --- | --- |
| lixnet | 11.78 KB | 4.06 KB | 3.64 KB | 1.0x |
| hono | 22.19 KB | 8.95 KB | 8.21 KB | 2.2x |
| orpc | 34.52 KB | 11.36 KB | 10.20 KB | 2.8x |
| trpc | 42.63 KB | 14.00 KB | 12.48 KB | 3.5x |
