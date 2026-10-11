import { createKlipyClient } from "./KlipyClient";
import type { GifCategory, KlipyClient } from "./KlipyClient";

/**
 * What the picker keeps from one opening to the next, until the page is reloaded: it is built again each time it
 * opens, and should not show its placeholders again for what it already knew.
 */
export interface GifSession {
    /** The category tiles Klipy sent. */
    categories?: GifCategory[];
    /** The first trending GIF's picture: the Trending tile's background. */
    trendingPreview?: string;
}

const sessions = new WeakMap<KlipyClient, GifSession>();

export function gifSessionOf(client: KlipyClient): GifSession {
    let session = sessions.get(client);
    if (!session) {
        session = {};
        sessions.set(client, session);
    }
    return session;
}

let sharedClient: { apiKey: string; client: KlipyClient } | undefined;

/** One Klipy client for the page, so what is kept for the session follows it from one opening to the next. */
export function sharedKlipyClient(apiKey: string): KlipyClient {
    if (sharedClient?.apiKey !== apiKey) sharedClient = { apiKey, client: createKlipyClient(apiKey) };
    return sharedClient.client;
}
