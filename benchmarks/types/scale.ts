import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTE_COUNTS } from "../shared/data";
import { table, writeReport } from "../shared/report";
import { templates } from "./templates";

// Type-check ("build") time as the router grows: generates a project per framework and route count,
// runs `tsc --noEmit --extendedDiagnostics`, and records wall time, check time, instantiations and
// memory. Runs with TypeScript 5.9 (tsc) and TypeScript 7 (native Go port).

const root = import.meta.dir;
const generated = join(root, ".generated");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 120_000);
const counts = process.env.COUNTS?.split(",").map(Number) ?? [...ROUTE_COUNTS];

const compilers = [
    { name: "TS 5.9", bin: join(root, "..", "node_modules", "typescript", "bin", "tsc") },
    { name: "TS 7", bin: join(root, "..", "node_modules", "ts7", "bin", "tsc") },
];

const tsconfig = {
    compilerOptions: {
        target: "esnext",
        lib: ["esnext", "dom"],
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        verbatimModuleSyntax: true,
        types: [],
        paths: { lixnet: [join(root, "..", "..", "dist", "exports")] },
    },
    files: ["server.ts", "client.ts"],
};

type Result = { wall: number; check?: number; instantiations?: number; memory?: number; error?: string };

function stat(output: string, label: string) {
    const match = output.match(new RegExp(`^${label}:\\s+([\\d.,]+)`, "m"));
    return match ? Number(match[1]!.replace(/,/g, "")) : undefined;
}

async function check(dir: string, bin: string): Promise<Result> {
    const start = performance.now();
    const proc = Bun.spawn(["node", bin, "-p", dir, "--extendedDiagnostics"], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    clearTimeout(timer);
    const wall = performance.now() - start;

    if (proc.signalCode) return { wall, error: "timeout" };
    const errors = output.match(/error TS\d+: [^\n]*/g);
    return {
        wall,
        check: stat(output, "Check time"),
        instantiations: stat(output, "Instantiations"),
        memory: stat(output, "Memory used"),
        error: errors ? `${errors.length} type errors (${errors[0]!.slice(0, 80)})` : undefined,
    };
}

rmSync(generated, { recursive: true, force: true });

const results: Record<string, Record<string, Record<number, Result>>> = {};

for (const [framework, template] of Object.entries(templates)) {
    for (const n of counts) {
        const dir = join(generated, `${framework.replace(/\W+/g, "-").replace(/-$/, "")}-${n}`);
        mkdirSync(dir, { recursive: true });
        const project = template(n);
        writeFileSync(join(dir, "server.ts"), project.server);
        writeFileSync(join(dir, "client.ts"), project.client);
        writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig, null, 4));

        for (const compiler of compilers) {
            const result = await check(dir, compiler.bin);
            ((results[compiler.name] ??= {})[framework] ??= {})[n] = result;
            console.log(
                `${compiler.name.padEnd(7)} ${framework.padEnd(24)} n=${String(n).padEnd(4)} ${result.wall.toFixed(0).padStart(6)}ms` +
                    (result.instantiations !== undefined ? `  inst ${result.instantiations.toLocaleString("en-US")}` : "") +
                    (result.memory !== undefined ? `  mem ${result.memory}K` : "") +
                    (result.error ? `  ${result.error}` : "")
            );
        }
    }
}

const cell = (r: Result, value: (r: Result) => string) => (r.error ? `${value(r)} ⚠️` : value(r));

const sections = Object.entries(results).flatMap(([compiler, byFramework]) => {
    const metrics: [string, (r: Result) => string][] = [
        ["wall time", (r) => (r.error === "timeout" ? "timeout" : `${(r.wall / 1000).toFixed(2)}s`)],
        ["type instantiations", (r) => r.instantiations?.toLocaleString("en-US") ?? "n/a"],
        ["memory", (r) => (r.memory ? `${Math.round(r.memory / 1024)} MB` : "n/a")],
    ];
    return metrics.map(
        ([metric, value]) =>
            `## ${compiler} · ${metric}\n\n` +
            table(
                ["framework", ...counts.map((n) => `${n} routes`)],
                Object.entries(byFramework).map(([framework, byN]) => [
                    framework,
                    ...counts.map((n) => cell(byN[n]!, value)),
                ])
            )
    );
});

const errors = Object.entries(results).flatMap(([compiler, byFramework]) =>
    Object.entries(byFramework).flatMap(([framework, byN]) =>
        Object.entries(byN)
            .filter(([, r]) => r.error)
            .map(([n, r]) => `- ${compiler} · ${framework} · ${n} routes: ${r.error}`)
    )
);

writeReport(
    "types",
    "Type-check time vs. number of routes",
    `Lower is better. \`tsc --noEmit\` over a generated server (N routes, each with its own zod schema) and a client that calls every route and asserts its literal return type. Wall time includes compiler startup. Projects are in \`types/.generated\`.\n\n${sections.join("\n\n")}` +
        (errors.length ? `\n\n## ⚠️ Type errors\n\n${errors.join("\n")}` : "")
);
