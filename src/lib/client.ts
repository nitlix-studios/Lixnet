import type { FunctionInput, LXNCallArgs, LXN_ServerClient_EventType } from "./types";
import type { InferLixnetEvents } from "./router";
import withJsonContentType from "./util/withJsonContentType";
import { LixnetError, codeForStatus, errorFromBody } from "./error";

type ExtractRPCResponse<T> = T extends (...args: any) => infer R
    ? Awaited<R>
    : never;

/** `Contract` is either an events contract or `typeof server` for a server built with `.route(...)`. */
export default class LixnetClient<
    Contract extends LXN_ServerClient_EventType,
    Events extends LXN_ServerClient_EventType = InferLixnetEvents<Contract>
> {
    private rpcUrl: string;

    public constructor({ rpcUrl }: { rpcUrl: string }) {
        this.rpcUrl = rpcUrl;
    }

    public async call<K extends keyof Events>(
        event: K,
        ...[input, options = {}]: LXNCallArgs<FunctionInput<Events[K]>, RequestInit>
    ): Promise<ExtractRPCResponse<Events[K]>> {
        const response = await fetch(this.rpcUrl, {
            ...options,
            method: "POST",
            headers: withJsonContentType(options.headers),
            body: JSON.stringify({ event, input: input === undefined ? {} : input }),
        });

        const json = await response.json().catch(() => null);

        // Not a Lixnet response, e.g. a proxy's HTML error page.
        if (json === null || typeof json !== "object") {
            throw new LixnetError(
                response.ok ? "BAD_RESPONSE" : codeForStatus(response.status),
                `Unexpected response from ${this.rpcUrl} (status ${response.status})`,
                { status: response.status }
            );
        }

        if (typeof json.error === "string") {
            throw errorFromBody(json, response.status);
        }

        return json.data;
    }
}
