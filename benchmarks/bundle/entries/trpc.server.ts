import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { GreetSchema, greet } from "../../shared/data";

const t = initTRPC.create();
const router = t.router({ greet: t.procedure.input(GreetSchema).mutation(({ input }) => greet(input)) });
export default { fetch: (req: Request) => fetchRequestHandler({ endpoint: "/trpc", req, router }) };
