import type { z } from "zod";
import { LixnetRequest } from "./util/request";
import { LixnetResponse } from "./util/response";

export type DebugLogger = ({
    error,
    message,
    cause,
}: {
    error?: boolean;
    message: string;
    /** The underlying exception or validation error, when there is one. */
    cause?: unknown;
}) => void;

export type FunctionInput<T> = T extends (input: infer TInput) => any
    ? TInput
    : { _TYPE_ERROR_: "Event definition must be a function type" };

export type FunctionOutput<T> = T extends (...args: any) => infer R
    ? Awaited<R>
    : { _TYPE_ERROR_: "Event definition must be a function type" };

/** `input` may be omitted when the event has no required input fields (e.g. `() => ...`). */
export type LXNCallArgs<TInput, TOptions> = {} extends TInput
    ? [input?: TInput, options?: TOptions]
    : [input: TInput, options?: TOptions];

export type LXNServerHandler<Input, Output> = (
    input: Input
) => Promise<Output> | Output;

export type LXN_ServerClient_EventType = object;

/** A schema whose parsed output must match the event's declared input type. */
export type LXNEventSchema<Events, K extends keyof Events> = z.ZodType<
    FunctionInput<Events[K]>
>;

/** One registration per event name, so arrays passed to `on()` are typed per element. */
export type LXNEventEntries<
    Events,
    TEntry extends { [K in keyof Events & string]: unknown }
> = TEntry[keyof Events & string][];

/** The inbound request passed to handlers (Next.js–style `cookies()` / `headers()`). */
export type { LixnetRequest as LXN_ServerClient_Request } from "./util/request";

export type LixnetServerInjections = {
    request: LixnetRequest;
    response: LixnetResponse;
};

/** The `stream` object injected into stream event handlers. */
export type LXNStreamEmitter<TChunk> = {
    /** Sends a chunk. The first call sends the response headers; later header/cookie changes are ignored. */
    emit: (chunk: TChunk) => void;
    /** Aborted when the client disconnects; `emit` becomes a no-op from then on. */
    signal: AbortSignal;
};
