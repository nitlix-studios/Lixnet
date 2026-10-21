import { hc } from "hono/client";

const client = hc<any>("/") as any;
export const run = async () => (await client.greet.$post({ json: { name: "World" } })).json();
