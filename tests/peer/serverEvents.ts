// Server side of the socket: only its own events, no reference to the client's types.
import { z } from "zod";
import { LixnetPeerEvents } from "../../src/exports";

export const serverEvents = new LixnetPeerEvents({
    routes: {
        hello: {
            schema: z.object({ name: z.string().min(1) }),
            handler: ({ name }) => `Hello ${name}` as const,
        },
        add: { handler: ({ a, b }: { a: number; b: number }) => a + b },
    },
}).route("time", { handler: () => 42 });
