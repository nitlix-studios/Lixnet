import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCClient, httpLink } from "@trpc/client";
import { EchoSchema, GreetSchema, echo, greet } from "../data";
import { type Framework, range } from "./types";

const framework: Framework = {
    name: "trpc",
    createHandler(extraRoutes = 0) {
        const t = initTRPC.create();
        const extra = Object.fromEntries(
            range(extraRoutes).map((i) => [
                `r${i}`,
                t.procedure.input(GreetSchema).mutation(({ input }) => greet(input)),
            ])
        );
        const router = t.router({
            ping: t.procedure.mutation(() => "pong"),
            greet: t.procedure.input(GreetSchema).mutation(({ input }) => greet(input)),
            echo: t.procedure.input(EchoSchema).mutation(({ input }) => echo(input)),
            ...extra,
        });
        return (req) => fetchRequestHandler({ endpoint: "/trpc", req, router });
    },
    createClient(origin) {
        const client = createTRPCClient<any>({ links: [httpLink({ url: `${origin}/trpc` })] }) as any;
        return {
            ping: () => client.ping.mutate(),
            greet: (input) => client.greet.mutate(input),
            echo: (input) => client.echo.mutate(input),
            extra: (i, input) => client[`r${i}`].mutate(input),
        };
    },
};

export default framework;
