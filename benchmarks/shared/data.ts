import { z } from "zod";

// The same three procedures are implemented in every framework:
// - ping:  no input, no validation. Pure framework overhead.
// - greet: small validated input. The typical RPC call.
// - echo:  100-item validated payload. Parsing, validation and serialization cost.

export const GreetSchema = z.object({ name: z.string() });

export const ItemSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    tags: z.array(z.string()),
    active: z.boolean(),
});

export const EchoSchema = z.object({ items: z.array(ItemSchema) });

export type Item = z.infer<typeof ItemSchema>;

export const greetInput = { name: "World" };

export const echoInput = {
    items: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        tags: ["alpha", "beta", "gamma"],
        active: i % 2 === 0,
    })),
};

export const greet = ({ name }: { name: string }) => `Hello ${name}`;
export const echo = ({ items }: { items: Item[] }) => ({ count: items.length, items });

/** Route counts for the "large router" scenarios. */
export const ROUTE_COUNTS = [25, 50, 100, 200, 500] as const;
