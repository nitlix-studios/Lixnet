import type { FunctionInput, FunctionOutput, LXN_ServerClient_EventType } from "./types";
import withJsonContentType from "./util/withJsonContentType";

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type LXNStreamCallOptions<TChunk> = Prettify<{
    onStreamChunk?: (chunk: TChunk) => void;
} & Omit<RequestInit, "method" | "body">>;

export default class LixnetStreamClient<Events extends LXN_ServerClient_EventType> {
    private rpcUrl: string;

    public constructor({ rpcUrl }: { rpcUrl: string }) {
        this.rpcUrl = rpcUrl;
    }

    public async call<K extends keyof Events>(
        event: K,
        input: FunctionInput<Events[K]>,
        options: LXNStreamCallOptions<FunctionOutput<Events[K]>> = {}
    ): Promise<void> {
        const { onStreamChunk, ...fetchOptions } = options;

        const response = await fetch(this.rpcUrl, {
            ...fetchOptions,
            method: "POST",
            headers: withJsonContentType(fetchOptions.headers),
            body: JSON.stringify({ event, input }),
        });

        if (!response.body) throw new Error("Stream response has no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.stream === true && onStreamChunk) onStreamChunk(parsed.data);
                } catch { /* skip malformed line */ }
            }
        }

        if (buffer.trim()) {
            try {
                const parsed = JSON.parse(buffer.trim());
                if (parsed.stream === true && onStreamChunk) onStreamChunk(parsed.data);
            } catch { /* skip */ }
        }
    }
}
