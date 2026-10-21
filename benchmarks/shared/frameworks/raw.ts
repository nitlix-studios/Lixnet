import { EchoSchema, GreetSchema, echo, greet } from "../data";
import { type Framework, range } from "./types";

/** Hand-written handler: JSON in, switch, JSON out. The floor every framework is measured against. */
const framework: Framework = {
    name: "raw fetch",
    createHandler(extraRoutes = 0) {
        const routes: Record<string, (input: any) => unknown> = {
            ping: () => "pong",
            greet: (input) => greet(GreetSchema.parse(input)),
            echo: (input) => echo(EchoSchema.parse(input)),
        };
        for (const i of range(extraRoutes)) routes[`r${i}`] = routes.greet!;
        return async (request) => {
            const { event, input } = await request.json();
            const route = routes[event];
            if (!route) return Response.json({ error: "Not found" }, { status: 404 });
            try {
                return Response.json({ data: route(input) });
            } catch {
                return Response.json({ error: "Invalid input" }, { status: 400 });
            }
        };
    },
    createClient(origin) {
        const call = async (event: string, input?: unknown) => {
            const res = await fetch(`${origin}/raw`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ event, input }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            return json.data;
        };
        return {
            ping: () => call("ping"),
            greet: (input) => call("greet", input),
            echo: (input) => call("echo", input),
            extra: (i, input) => call(`r${i}`, input),
        };
    },
};

export default framework;
