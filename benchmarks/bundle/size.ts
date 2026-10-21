import { brotliCompressSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { kb, table, writeReport } from "../shared/report";

// Minified bundle size of a minimal client (one call) and a minimal server (one validated route).
// zod is marked external on the server so the numbers are the framework's own weight.

const names = ["lixnet", "trpc", "orpc", "hono"];
const entries = join(import.meta.dir, "entries");
const outdir = join(import.meta.dir, ".out");

async function measure(entry: string, target: "browser" | "bun", external: string[]) {
    const result = await Bun.build({
        entrypoints: [join(entries, entry)],
        outdir,
        target,
        minify: true,
        external,
        naming: entry.replace(/\.ts$/, ".js"),
        tsconfig: join(import.meta.dir, "..", "tsconfig.json"),
    });
    if (!result.success) throw new AggregateError(result.logs, `build failed: ${entry}`);
    const code = await result.outputs[0]!.arrayBuffer();
    const bytes = new Uint8Array(code);
    return { min: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length };
}

rmSync(outdir, { recursive: true, force: true });

const sections: string[] = [];
for (const [kind, target, external] of [
    ["client", "browser", []],
    ["server", "bun", ["zod"]],
] as const) {
    const sizes = await Promise.all(names.map(async (name) => ({ name, ...(await measure(`${name}.${kind}.ts`, target, [...external])) })));
    sizes.sort((a, b) => a.gzip - b.gzip);
    const smallest = sizes[0]!.gzip;
    const rows = sizes.map((s) => [s.name, kb(s.min), kb(s.gzip), kb(s.brotli), `${(s.gzip / smallest).toFixed(1)}x`]);
    console.log(`\n${kind}`);
    console.table(Object.fromEntries(sizes.map((s) => [s.name, { min: kb(s.min), gzip: kb(s.gzip), brotli: kb(s.brotli) }])));
    sections.push(`## ${kind}\n\n${table(["framework", "minified", "gzip", "brotli", "vs smallest"], rows)}`);
}

writeReport(
    "bundle",
    "Bundle size",
    `Smaller is better. \`Bun.build --minify\`; client targets the browser, server targets Bun with zod external. Entries live in \`bundle/entries\`.\n\n${sections.join("\n\n")}`
);
