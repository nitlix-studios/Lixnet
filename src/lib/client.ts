import type { FunctionInput, LXN_ServerClient_EventType } from "./types";
import withJsonContentType from "./util/withJsonContentType";

type ExtractRPCResponse<T> = T extends (...args: any) => infer R
    ? Awaited<R>
    : never;

export default class LixnetClient<Events extends LXN_ServerClient_EventType> {
    private rpcUrl: string;

    public constructor({ rpcUrl }: { rpcUrl: string }) {
        this.rpcUrl = rpcUrl;
    }

    public async call<K extends keyof Events>(
        event: K,
        input: FunctionInput<Events[K]>,
        options: RequestInit = {}
    ): Promise<ExtractRPCResponse<Events[K]>> {
        const response = await fetch(this.rpcUrl, {
            ...options,
            method: "POST",
            headers: withJsonContentType(options.headers),
            body: JSON.stringify({ event, input }),
        });

        const json = await response.json();

        if (json.error) {
            throw new Error(json.error);
        }

        return json.data;
    }
}
