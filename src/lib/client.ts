import type {
    FunctionInput,
    FunctionOutput,
    LXNCallArgs,
    LXN_ServerClient_EventType,
    LixnetClientOptions,
    LixnetFetch,
} from "./types";
import type { InferLixnetEvents } from "./router";
import withJsonContentType from "./util/withJsonContentType";
import createCaller from "./util/createCaller";
import { LixnetError, codeForStatus, errorFromBody } from "./error";

type ExtractRPCResponse<T> = T extends (...args: any) => infer R
    ? Awaited<R>
    : never;

/** One function per event: `caller.greet({ name })` is `client.call("greet", { name })`. */
export type LixnetCaller<Events> = {
    [K in keyof Events]: (
        ...args: LXNCallArgs<FunctionInput<Events[K]>, RequestInit>
    ) => Promise<FunctionOutput<Events[K]>>;
};

/** `Contract` is either an events contract or `typeof server` for a server built with `.route(...)`. */
export default class LixnetClient<
    Contract extends LXN_ServerClient_EventType,
    Events extends LXN_ServerClient_EventType = InferLixnetEvents<Contract>
> {
    private rpcUrl: string;
    private fetcher?: LixnetFetch;

    /**
     * Every event as a typed function: `await client.caller.greet({ name: "World" })`.
     * Destructuring works too (`const { greet } = client.caller`). An event named `then` can only
     * be called through `call(...)`.
     */
    public readonly caller: LixnetCaller<Events>;

    public constructor({ rpcUrl, fetch }: LixnetClientOptions) {
        this.rpcUrl = rpcUrl;
        this.fetcher = fetch;
        this.caller = createCaller((event, ...args) => this.call(event as keyof Events, ...(args as any)));
    }

    public async call<K extends keyof Events>(
        event: K,
        ...[input, options = {}]: LXNCallArgs<FunctionInput<Events[K]>, RequestInit>
    ): Promise<ExtractRPCResponse<Events[K]>> {
        // Called unbound: a native fetch invoked as a method of this client throws "Illegal invocation".
        const send = this.fetcher ?? fetch;
        const response = await send(this.rpcUrl, {
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
