import { join } from "node:path";
import { ROUTE_COUNTS, greetInput } from "../shared/data";
import { frameworks } from "../shared/frameworks";
import { capture } from "../shared/capture";
import { ms, table, writeReport } from "../shared/report";

// Cold start, as a serverless/Workers isolate sees it: fresh process -> import the framework ->
// register N routes -> first response. Median of RUNS fresh processes per cell.

const RUNS = Number(process.env.RUNS ?? 15);
const files: Record<string, string> = { lixnet: "lixnet", trpc: "trpc", orpc: "orpc", hono: "hono", "raw fetch": "raw" };

const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

type Sample = { import: number; build: number; firstRequest: number };
const rows: (string | number)[][] = [];
const buildRows: (string | number)[][] = [];

for (const f of frameworks) {
    const request = JSON.stringify(await capture(() => f.createClient("http://cold").extra(0, greetInput)));
    const totals: string[] = [];
    let importMedian = 0;
    let firstRequestMedian = 0;
    const builds: string[] = [];

    for (const n of ROUTE_COUNTS) {
        const samples: Sample[] = [];
        for (let i = 0; i < RUNS; i++) {
            const proc = Bun.spawnSync(["bun", join(import.meta.dir, "cold.ts"), files[f.name]!, String(n), request]);
            if (!proc.success) throw new Error(proc.stderr.toString());
            samples.push(JSON.parse(proc.stdout.toString()));
        }
        const imp = median(samples.map((s) => s.import));
        const build = median(samples.map((s) => s.build));
        const first = median(samples.map((s) => s.firstRequest));
        if (n === ROUTE_COUNTS[0]) {
            importMedian = imp;
            firstRequestMedian = first;
        }
        builds.push(ms(build));
        totals.push(ms(imp + build + first));
        console.log(`${f.name.padEnd(10)} n=${String(n).padEnd(4)} import ${ms(imp)}  build ${ms(build)}  first request ${ms(first)}`);
    }

    rows.push([f.name, ms(importMedian), ms(firstRequestMedian), ...totals]);
    buildRows.push([f.name, ...builds]);
}

writeReport(
    "startup",
    "Cold start",
    `Lower is better. Median of ${RUNS} fresh \`bun\` processes per cell. "import" loads the framework's adapter module (server + client + zod), "first request" is the first call after building the router.\n\n` +
        `## Total (import + build router + first request)\n\n${table(["framework", "import", "first request", ...ROUTE_COUNTS.map((n) => `total @ ${n} routes`)], rows)}\n\n` +
        `## Router build time\n\n${table(["framework", ...ROUTE_COUNTS.map((n) => `${n} routes`)], buildRows)}`
);
