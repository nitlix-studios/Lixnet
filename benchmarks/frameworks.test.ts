import { afterAll, describe, expect, test } from "bun:test";
import { echoInput, greetInput } from "./shared/data";
import { frameworks, hostOf, installInProcessFetch } from "./shared/frameworks";

// Benchmarks only mean something if every framework does the same work, so check that first.

const restore = installInProcessFetch(
    Object.fromEntries(frameworks.map((f) => [hostOf(f), f.createHandler(500)]))
);
afterAll(restore);

for (const framework of frameworks) {
    describe(framework.name, () => {
        const client = framework.createClient(`http://${hostOf(framework)}`);

        test("ping", async () => {
            expect(await client.ping()).toBe("pong");
        });

        test("greet", async () => {
            expect(await client.greet(greetInput)).toBe("Hello World");
        });

        test("echo round-trips 100 items", async () => {
            expect(await client.echo(echoInput)).toEqual({ count: 100, items: echoInput.items });
        });

        test("last of 500 extra routes", async () => {
            expect(await client.extra(499, greetInput)).toBe("Hello World");
        });

        test("rejects invalid input", async () => {
            await expect(client.greet({ name: 42 } as any)).rejects.toBeDefined();
        });
    });
}
