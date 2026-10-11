/** The parts of a Matrix event the chat list time needs. */
export interface TimelineEventLike {
    getType(): string;
    getTs(): number;
    getRelation(): { rel_type?: string } | null | undefined;
}

/** Event types that are a message someone sent. Encrypted ones count before they are decrypted. */
const MESSAGE_EVENT_TYPES = new Set(["m.room.message", "m.room.encrypted", "m.sticker"]);

/**
 * When the last message in a room was sent, for the chat list's time and order.
 * Only messages count: a member event (someone's new name or picture, which Matrix adds to every room they are in),
 * a reaction, an edit or any other room change does not move the chat. With no message at all, the room's creation
 * time is used; with no time at all, `Number.MIN_SAFE_INTEGER` (what Matrix reports for "never").
 */
export function lastMessageTimestamp(
    timelineEvents: readonly TimelineEventLike[],
    newestLoadedMessageTs: number | undefined,
    roomCreatedTs: number | undefined
): number {
    let newest = 0;
    for (let index = timelineEvents.length - 1; index >= 0; index--) {
        const event = timelineEvents[index];
        if (!MESSAGE_EVENT_TYPES.has(event.getType())) continue;
        if (event.getRelation()?.rel_type === "m.replace") continue;
        const ts = event.getTs();
        if (Number.isFinite(ts) && ts > 0) {
            newest = ts;
            break;
        }
    }
    if (newestLoadedMessageTs !== undefined && Number.isFinite(newestLoadedMessageTs)) {
        newest = Math.max(newest, newestLoadedMessageTs);
    }
    if (newest > 0) return newest;
    if (roomCreatedTs !== undefined && Number.isFinite(roomCreatedTs) && roomCreatedTs > 0) return roomCreatedTs;
    return Number.MIN_SAFE_INTEGER;
}
