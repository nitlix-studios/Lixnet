import type { FunctionInput, LXNCallArgs, LXN_ServerClient_EventType } from "./types";
import type { InferLixnetEvents } from "./router";
import withJsonContentType from "./util/withJsonContentType";

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

        const json = await response.json();

        if (json.error) {
            throw new Error(json.error, json.detail ? { cause: json.detail } : undefined);
        }

        return json.data;
    }
}
