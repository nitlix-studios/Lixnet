// Type-level checks, run: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext tests/schema-types.ts
import { z } from "zod";
import { LixnetServer } from "../src/exports";

type Events = {
    greet: (input: { name: string }) => string;
    add: (input: { a: number; b: number; note?: string }) => number;
};

const server = new LixnetServer<Events>({});

server.on({ event: "greet", schema: z.object({ name: z.string().min(1) }), handler: ({ name }) => name });

server.on({
    event: "greet",
    // @ts-expect-error schema output doesn't match { name: string }
    schema: z.object({ name: z.number() }),
    handler: ({ name }) => name,
});

server.on([
    { event: "greet", schema: z.object({ name: z.string() }), handler: ({ name }) => name.toUpperCase() },
    {
        event: "add",
        schema: z.object({ a: z.number(), b: z.number(), note: z.string().optional() }),
        handler: ({ a, b }) => a + b,
    },
    {
        event: "add",
        // @ts-expect-error missing b
        schema: z.object({ a: z.number() }),
        handler: ({ a, b }) => a + b,
    },
]);
