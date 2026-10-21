import { LixnetServer } from "lixnet";
import { GreetSchema, greet } from "../../shared/data";

const server = new LixnetServer({ routes: { greet: { schema: GreetSchema, handler: greet } } });
export default { fetch: (request: Request) => server.handle(request) };
