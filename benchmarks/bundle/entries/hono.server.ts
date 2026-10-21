import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { GreetSchema, greet } from "../../shared/data";

export default new Hono().post("/greet", sValidator("json", GreetSchema), (c) => c.json(greet(c.req.valid("json"))));
