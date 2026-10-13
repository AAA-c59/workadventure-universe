import type { MatrixClient } from "matrix-js-sdk";

const STORAGE_PREFIX = "universe:matrix:rooms-to-forget:";
/** A room that still cannot be forgotten after this many tries is let go (it is gone, or the server keeps refusing). */
const MAX_ATTEMPTS = 5;

interface RoomToForget {
    roomId: string;
    attempts: number;
}

type ForgetClient = Pick<MatrixClient, "forget" | "getRoom">;

function isRoomToForget(value: unknown): value is RoomToForget {
    if (typeof value !== "object" || value === null) return false;
    const { roomId, attempts } = value as Partial<RoomToForget>;
    return typeof roomId === "string" && typeof attempts === "number";
}

function read(userId: string): RoomToForget[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + userId) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter(isRoomToForget) : [];
    } catch {
        return [];
    }
}

function write(userId: string, rooms: RoomToForget[]): void {
    try {
        if (rooms.length === 0) localStorage.removeItem(STORAGE_PREFIX + userId);
        else localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(rooms));
    } catch {
        // Storage can be full or blocked: the room is then forgotten only if the first try worked.
    }
}

/**
 * A chat that was left but could not be forgotten stays in other apps (Element lists it as an empty room), and the game
 * no longer lists it, so nothing would ever try again. It is written down here per account and tried again later.
 */
export function rememberRoomToForget(userId: string, roomId: string): void {
    const rooms = read(userId);
    if (rooms.some((room) => room.roomId === roomId)) return;
    write(userId, [...rooms, { roomId, attempts: 1 }]);
}

/** Runs of one account do not overlap: two at once would try the same rooms twice and count their attempts twice. */
const running = new Map<string, Promise<void>>();

/** Forgets the rooms written down for that account. A room that is joined or invited again is no longer one to forget. */
export function forgetRememberedRooms(client: ForgetClient, userId: string): Promise<void> {
    const current = running.get(userId);
    if (current) return current;
    const run = (async () => {
        const kept: RoomToForget[] = [];
        for (const entry of read(userId)) {
            const membership = client.getRoom(entry.roomId)?.getMyMembership();
            if (membership === "join" || membership === "invite") continue;
            try {
                // One room at a time, so a bad network does not send them all at once.
                // eslint-disable-next-line no-await-in-loop
                await client.forget(entry.roomId);
            } catch (error) {
                console.warn("Could not forget a room that was left", error);
                if (entry.attempts + 1 < MAX_ATTEMPTS) kept.push({ ...entry, attempts: entry.attempts + 1 });
            }
        }
        write(userId, kept);
    })().finally(() => {
        running.delete(userId);
    });
    running.set(userId, run);
    return run;
}
