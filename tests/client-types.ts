// Type-level checks, run: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext tests/client-types.ts
import { LixnetClient } from "../src/exports";

type Events = {
    live: () => { ok: boolean };
    search: (input: { q?: string }) => string[];
    greet: (input: { name: string }) => string;
};

const client = new LixnetClient<Events>({ rpcUrl: "/rpc" });

async function check() {
    const live: { ok: boolean } = await client.call("live");
    await client.call("live", undefined, { credentials: "include" });
    await client.call("search");
    await client.call("search", { q: "x" });
    const greeting: string = await client.call("greet", { name: "a" });
    // @ts-expect-error greet requires input
    await client.call("greet");
    // @ts-expect-error wrong input type
    await client.call("greet", { name: 1 });
    return [live, greeting];
}
check;
