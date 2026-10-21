import { Hono } from "hono";
import { hc } from "hono/client";
import { sValidator } from "@hono/standard-validator";
import { EchoSchema, GreetSchema, echo, greet } from "../data";
import { type Framework, range } from "./types";

const framework: Framework = {
    name: "hono",
    createHandler(extraRoutes = 0) {
        const app = new Hono()
            .post("/ping", (c) => c.json("pong"))
            .post("/greet", sValidator("json", GreetSchema), (c) => c.json(greet(c.req.valid("json"))))
            .post("/echo", sValidator("json", EchoSchema), (c) => c.json(echo(c.req.valid("json"))));
        for (const i of range(extraRoutes)) {
            app.post(`/r${i}`, sValidator("json", GreetSchema), (c) => c.json(greet(c.req.valid("json"))));
        }
        return (request) => app.fetch(request);
    },
    createClient(origin) {
        const client = hc<any>(origin) as any;
        // hc resolves on error statuses, so check `ok` like an app would.
        const post = async (route: string, json?: unknown) => {
            const res = await client[route].$post({ json });
            if (!res.ok) throw new Error(`hono: ${res.status}`);
            return res.json();
        };
        return {
            ping: () => post("ping"),
            greet: (input) => post("greet", input),
            echo: (input) => post("echo", input),
            extra: (i, input) => post(`r${i}`, input),
        };
    },
};

export default framework;
