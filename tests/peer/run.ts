// Two peers typed from each other's events, over an in-memory socket pair.
// Types: bunx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target esnext --verbatimModuleSyntax tests/peer/run.ts
// Runtime: bun tests/peer/run.ts
import { LixnetPeer, type LixnetError } from "../../src/exports";
import { serverEvents } from "./serverEvents";
import { createClientPeer, type clientEvents } from "./clientEvents";

const serverPeer = new LixnetPeer<typeof clientEvents>({ events: serverEvents });
const clientPeer = createClientPeer();

// Each socket's send delivers to the other peer.
const serverSocket = { send: (data: string) => queueMicrotask(() => clientPeer.handle({ data, socket: clientSocket })) } as unknown as WebSocket;
const clientSocket = { send: (data: string) => queueMicrotask(() => serverPeer.handle({ data, socket: serverSocket })) } as unknown as WebSocket;
serverPeer.setSocket(serverSocket);
clientPeer.setSocket(clientSocket);

const ask = <T>(fn: (resolve: (value: T) => void, reject: (error: LixnetError) => void) => void) => new Promise<T>(fn);

const hello = await ask<`Hello ${string}`>((resolve) => clientPeer.call("hello", { name: "peer" }, { callback: resolve }));
const sum = await ask<number>((resolve) => clientPeer.call("add", { a: 2, b: 3 }, { callback: resolve }));
const time = await ask<number>((resolve) => clientPeer.call("time", undefined, { callback: resolve }));
const length = await ask<number>((resolve) => serverPeer.call("notify", { message: "four" }, { callback: resolve }));
const invalid = await ask<string>((resolve) =>
    clientPeer.call("hello", { name: "" }, { callback: () => resolve("called back"), onError: (e) => resolve(e.code) })
);

// @ts-expect-error hello needs a name
clientPeer.call("hello", {});
// @ts-expect-error add's a is a number
clientPeer.call("add", { a: "2", b: 3 });
// @ts-expect-error the server can't call its own events
serverPeer.call("hello", { name: "x" });
// @ts-expect-error time's callback gets a number
clientPeer.call("time", undefined, { callback: (t: string) => t });

console.log({ hello, sum, time, length, invalid });
if (hello !== "Hello peer" || sum !== 5 || time !== 42 || length !== 4 || invalid !== "INVALID_INPUT") {
    throw new Error("peer events failed");
}
