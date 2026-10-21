import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const client = createORPCClient<any>(new RPCLink({ url: "/rpc" }));
export const run = () => client.greet({ name: "World" });
