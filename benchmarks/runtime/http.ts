import { join } from "node:path";
import { echoInput, greetInput } from "../shared/data";
import { type BenchClient, frameworks } from "../shared/frameworks";
import { type Captured, capture } from "../shared/capture";
import { table, writeReport } from "../shared/report";

// Real sockets: each framework runs in its own Bun.serve child process, and this process replays
// that framework's captured wire request with N concurrent keep-alive connections.
// The load generator shares the machine, so absolute req/s is lower than with a dedicated tool
// (oha/wrk); compare frameworks to each other and to "raw fetch", not to other machines.

const DURATION_MS = Number(process.env.DURATION_MS ?? 5000);
const WARMUP_MS = 1000;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 64);
const PORT = 4100;

const scenarios: { name: string; call: (c: BenchClient) => Promise<unknown> }[] = [
    { name: "greet (zod)", call: (c) => c.greet(greetInput) },
    { name: "echo 100 items (zod)", call: (c) => c.echo(echoInput) },
];

async function waitForReady(proc: Bun.Subprocess<"ignore", "pipe", "inherit">) {
    const reader = proc.stdout.getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    if (!new TextDecoder().decode(value).includes("ready")) throw new Error("server failed to start");
}

async function load({ url, method, headers, body }: Captured, durationMs: number) {
    const latencies: number[] = [];
    let errors = 0;
    const end = performance.now() + durationMs;
    const worker = async () => {
        while (performance.now() < end) {
            const start = performance.now();
            const response = await fetch(url, { method, headers, body });
            await response.arrayBuffer();
            if (response.ok) latencies.push(performance.now() - start);
            else errors++;
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    latencies.sort((a, b) => a - b);
    const at = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]!;
    return {
        rps: Math.round(latencies.length / (durationMs / 1000)),
        p50: at(0.5),
        p99: at(0.99),
        errors,
    };
}

const rows: Record<string, (string | number)[][]> = {};

// ONLY=lixnet,hono to run a subset (in that order).
const only = process.env.ONLY?.split(",");
const selected = only ? only.map((n) => frameworks.find((f) => f.name === n)!) : frameworks;

for (const f of selected) {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "serve.ts"), f.name, String(PORT)], {
        stdout: "pipe",
        stderr: "inherit",
    });
    await waitForReady(proc);

    for (const scenario of scenarios) {
        // The client is built inside capture: oRPC's RPCLink reads globalThis.fetch at construction.
        const request = await capture(() => scenario.call(f.createClient(`http://localhost:${PORT}`)));
        await load(request, WARMUP_MS);
        const result = await load(request, DURATION_MS);
        console.log(`${f.name.padEnd(10)} ${scenario.name.padEnd(22)} ${result.rps} req/s  p50 ${result.p50.toFixed(2)}ms  p99 ${result.p99.toFixed(2)}ms  errors ${result.errors}`);
        (rows[scenario.name] ??= []).push([
            f.name,
            result.rps.toLocaleString("en-US"),
            `${result.p50.toFixed(2)} ms`,
            `${result.p99.toFixed(2)} ms`,
            result.errors,
        ]);
    }

    proc.kill();
    await proc.exited;
}

writeReport(
    "http",
    "HTTP throughput (Bun.serve, real sockets)",
    `Higher req/s is better. ${CONCURRENCY} concurrent keep-alive connections, ${DURATION_MS / 1000}s per run after ${WARMUP_MS / 1000}s warmup. Each server has 500 extra routes registered.\n\n` +
        Object.entries(rows)
            .map(([name, r]) => `## ${name}\n\n${table(["framework", "req/s", "p50", "p99", "errors"], r)}`)
            .join("\n\n")
);
