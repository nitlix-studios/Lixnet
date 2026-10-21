import os from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const resultsDir = join(import.meta.dir, "..", "results");

export function machineInfo() {
    const cpu = os.cpus()[0]?.model ?? "unknown cpu";
    return `${cpu}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 1024 ** 3)}GB RAM, ${os.platform()} ${os.arch()}, Bun ${Bun.version}`;
}

/** Writes `results/<name>.md` with a header so results stay comparable across machines and runs. */
export function writeReport(name: string, title: string, body: string) {
    mkdirSync(resultsDir, { recursive: true });
    const header = `# ${title}\n\n_${new Date().toISOString().slice(0, 10)} · ${machineInfo()}_\n\n`;
    const path = join(resultsDir, `${name}.md`);
    writeFileSync(path, header + body.trim() + "\n");
    console.log(`\nwrote ${path}`);
}

export function table(headers: string[], rows: (string | number)[][]) {
    const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
    return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;
export const ms = (n: number) => `${n.toFixed(n < 10 ? 2 : 0)} ms`;
