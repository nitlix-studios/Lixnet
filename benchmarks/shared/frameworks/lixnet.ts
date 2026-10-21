import { LixnetClient, LixnetServer } from "lixnet";
import { EchoSchema, GreetSchema, echo, greet } from "../data";
import { type Framework, range } from "./types";

const framework: Framework = {
    name: "lixnet",
    createHandler(extraRoutes = 0) {
        const server = new LixnetServer({
            routes: {
                ping: { handler: () => "pong" },
                greet: { schema: GreetSchema, handler: greet },
                echo: { schema: EchoSchema, handler: echo },
            },
        });
        for (const i of range(extraRoutes)) {
            server.route(`r${i}`, { schema: GreetSchema, handler: greet });
        }
        return (request) => server.handle(request);
    },
    createClient(origin) {
        // LixnetClient has no `fetch` option, so it goes through globalThis.fetch.
        const client = new LixnetClient<Record<string, (input: any) => any>>({ rpcUrl: `${origin}/rpc` });
        return {
            ping: () => client.call("ping"),
            greet: (input) => client.call("greet", input),
            echo: (input) => client.call("echo", input),
            extra: (i, input) => client.call(`r${i}`, input),
        };
    },
};

export default framework;
