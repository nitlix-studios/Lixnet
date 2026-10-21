import { bench, do_not_optimize, group, run, summary } from "mitata";
import { echoInput, greetInput } from "../shared/data";
import {
    type BenchClient,
    type FetchHandler,
    frameworks,
    hostOf,
    installInProcessFetch,
} from "../shared/frameworks";
import { writeReport } from "../shared/report";
import { type Captured, capture, replay } from "../shared/capture";

// Two in-process benchmarks, no sockets involved:
// 1. server: a Request in the framework's own wire format -> handler -> Response body read.
// 2. round-trip: the framework's real client -> in-process fetch -> handler -> client result.

type Scenario = { name: string; extraRoutes?: number; call: (client: BenchClient) => Promise<unknown> };

const scenarios: Scenario[] = [
    { name: "ping", call: (c) => c.ping() },
    { name: "greet (zod)", call: (c) => c.greet(greetInput) },
    { name: "echo 100 items (zod)", call: (c) => c.echo(echoInput) },
    { name: "greet on a 500-route router", extraRoutes: 500, call: (c) => c.extra(499, greetInput) },
];

const handlers = new Map<string, FetchHandler>();
const handlerFor = (name: string, extraRoutes = 0) => {
    const key = `${name}:${extraRoutes}`;
    if (!handlers.has(key)) {
        handlers.set(key, frameworks.find((f) => f.name === name)!.createHandler(extraRoutes));
    }
    return handlers.get(key)!;
};

for (const scenario of scenarios) {
    const requests = new Map<string, Captured>();
    for (const f of frameworks) {
        requests.set(f.name, await capture(() => scenario.call(f.createClient(`http://${hostOf(f)}`))));
    }

    summary(() => {
        group(`server · ${scenario.name}`, () => {
            for (const f of frameworks) {
                const handler = handlerFor(f.name, scenario.extraRoutes);
                const captured = requests.get(f.name)!;
                bench(f.name, async () => {
                    const response = await handler(replay(captured));
                    do_not_optimize(await response.text());
                });
            }
        });
    });
}

// Installed before any client is built: oRPC's RPCLink reads globalThis.fetch at construction.
installInProcessFetch(
    Object.fromEntries(
        scenarios.flatMap((s) =>
            frameworks.map((f) => [`${hostOf(f)}${s.extraRoutes ?? 0}`, handlerFor(f.name, s.extraRoutes)])
        )
    )
);

for (const scenario of scenarios) {
    summary(() => {
        group(`round-trip · ${scenario.name}`, () => {
            for (const f of frameworks) {
                // Each framework gets its own fake host, so one patched fetch serves all of them.
                const host = `${hostOf(f)}${scenario.extraRoutes ?? 0}`;
                const client = f.createClient(`http://${host}`);
                bench(f.name, async () => do_not_optimize(await scenario.call(client)));
            }
        });
    });
}

let markdown = "";
await run({
    format: "markdown",
    print: (line) => {
        console.log(line);
        markdown += line + "\n";
    },
});

writeReport(
    "runtime",
    "Runtime: in-process handler and client round-trip",
    `Lower is better. "server" replays each client's real wire request into the Fetch handler; "round-trip" goes through the real client with fetch routed in-process (no sockets).\n\n${markdown}`
);
