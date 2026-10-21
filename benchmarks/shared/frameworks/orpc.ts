import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { EchoSchema, GreetSchema, echo, greet } from "../data";
import { type Framework, range } from "./types";

const framework: Framework = {
    name: "orpc",
    createHandler(extraRoutes = 0) {
        const extra = Object.fromEntries(
            range(extraRoutes).map((i) => [
                `r${i}`,
                os.input(GreetSchema).handler(({ input }) => greet(input)),
            ])
        );
        const handler = new RPCHandler({
            ping: os.handler(() => "pong"),
            greet: os.input(GreetSchema).handler(({ input }) => greet(input)),
            echo: os.input(EchoSchema).handler(({ input }) => echo(input)),
            ...extra,
        });
        return async (request) => {
            const { response } = await handler.handle(request, { prefix: "/rpc", context: {} });
            return response ?? new Response("Not found", { status: 404 });
        };
    },
    createClient(origin) {
        const client = createORPCClient<any>(new RPCLink({ url: `${origin}/rpc` }));
        return {
            ping: () => client.ping(),
            greet: (input) => client.greet(input),
            echo: (input) => client.echo(input),
            extra: (i, input) => client[`r${i}`](input),
        };
    },
};

export default framework;
