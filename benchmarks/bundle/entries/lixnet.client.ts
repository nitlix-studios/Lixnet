import { LixnetClient } from "lixnet";

const client = new LixnetClient<{ greet: (input: { name: string }) => string }>({ rpcUrl: "/rpc" });
export const run = () => client.call("greet", { name: "World" });
