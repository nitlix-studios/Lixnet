import { createTRPCClient, httpBatchLink } from "@trpc/client";

// httpBatchLink is tRPC's documented default link.
const client = createTRPCClient<any>({ links: [httpBatchLink({ url: "/trpc" })] }) as any;
export const run = () => client.greet.mutate({ name: "World" });
