import { join } from "node:path";

// Builds lixnet's dist (benchmarks run against the published shape), checks that every adapter
// behaves the same, then runs each suite in its own process, one at a time so they don't compete
// for CPU.

const root = import.meta.dir;
const steps: [string, string[], string][] = [
    ["build lixnet", ["bunx", "tsc"], join(root, "..")],
    ["parity tests", ["bun", "test"], root],
    ["bundle size", ["bun", "bundle/size.ts"], root],
    ["type-check scaling", ["bun", "types/scale.ts"], root],
    ["cold start", ["bun", "runtime/startup.ts"], root],
    ["in-process runtime", ["bun", "runtime/server.ts"], root],
    ["http throughput", ["bun", "runtime/http.ts"], root],
];

const only = process.argv[2];
for (const [name, cmd, cwd] of steps) {
    if (only && !name.includes(only)) continue;
    console.log(`\n━━ ${name} ━━`);
    const proc = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
    if (!proc.success) {
        console.error(`${name} failed`);
        process.exit(1);
    }
}

console.log(`\nResults in ${join(root, "results")}`);
