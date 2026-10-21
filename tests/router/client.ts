// Browser-side entry: only a type import of the router. Bundling this must not pull in zod or handlers.
import { LixnetClient } from "../../src/exports";
import type { RpcServer } from "./server";

export const rpcClient = new LixnetClient<RpcServer>({ rpcUrl: "/rpc" });
