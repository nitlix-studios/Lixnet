// Client side: imports the server's events as a type only, and the server does the same.
import { LixnetPeerEvents, LixnetPeer } from "../../src/exports";
import type { serverEvents } from "./serverEvents";

export const clientEvents = new LixnetPeerEvents().route("notify", {
    handler: ({ message }: { message: string }) => message.length,
});

export const createClientPeer = () => new LixnetPeer<typeof serverEvents>({ events: clientEvents });
