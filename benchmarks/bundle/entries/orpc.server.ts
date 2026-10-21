import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { GreetSchema, greet } from "../../shared/data";

const handler = new RPCHandler({ greet: os.input(GreetSchema).handler(({ input }) => greet(input)) });
export default {
    fetch: async (request: Request) =>
        (await handler.handle(request, { prefix: "/rpc", context: {} })).response ?? new Response(null, { status: 404 }),
};
