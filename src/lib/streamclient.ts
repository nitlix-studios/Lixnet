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

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type LXNStreamCallOptions<TChunk> = Prettify<{
    onStreamChunk?: (chunk: TChunk) => void;
} & Omit<RequestInit, "method" | "body">>;

/** One function per stream event: `caller.generate(input, { onStreamChunk })` is `client.call("generate", ...)`. */
export type LixnetStreamCaller<Events> = {
    [K in keyof Events]: (
        ...args: LXNCallArgs<FunctionInput<Events[K]>, LXNStreamCallOptions<FunctionOutput<Events[K]>>>
    ) => Promise<void>;
};

export default class LixnetStreamClient<
    Contract extends LXN_ServerClient_EventType,
    Events extends LXN_ServerClient_EventType = InferLixnetEvents<Contract>
> {
    private rpcUrl: string;
    private fetcher?: LixnetFetch;

    /** Every stream event as a typed function, like `LixnetClient.caller`. */
    public readonly caller: LixnetStreamCaller<Events>;

    public constructor({ rpcUrl, fetch }: LixnetClientOptions) {
        this.rpcUrl = rpcUrl;
        this.fetcher = fetch;
        this.caller = createCaller((event, ...args) => this.call(event as keyof Events, ...(args as any)));
    }

    /** Resolves when the stream ends; throws if the server returns or streams an error. */
    public async call<K extends keyof Events>(
        event: K,
        ...[input, options = {}]: LXNCallArgs<
            FunctionInput<Events[K]>,
            LXNStreamCallOptions<FunctionOutput<Events[K]>>
        >
    ): Promise<void> {
        const { onStreamChunk, ...fetchOptions } = options;

        // Called unbound: a native fetch invoked as a method of this client throws "Illegal invocation".
        const send = this.fetcher ?? fetch;
        const response = await send(this.rpcUrl, {
            ...fetchOptions,
            method: "POST",
            headers: withJsonContentType(fetchOptions.headers),
            body: JSON.stringify({ event, input: input === undefined ? {} : input }),
        });

        if (!response.ok) {
            const json = await response.json().catch(() => null);
            if (json && typeof json.error === "string") throw errorFromBody(json, response.status);
            throw new LixnetError(
                codeForStatus(response.status),
                `Stream request failed with status ${response.status}`,
                { status: response.status }
            );
        }

        if (!response.body) throw new Error("Stream response has no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            let parsed: any;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                return; // skip malformed line
            }

            if (typeof parsed?.error === "string") throw errorFromBody(parsed);
            if (parsed?.stream === true) onStreamChunk?.(parsed.data);
        };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop()!;
                lines.forEach(handleLine);
            }

            handleLine(buffer + decoder.decode());
        } catch (error) {
            await reader.cancel().catch(() => {});
            throw error;
        }
    }
}
