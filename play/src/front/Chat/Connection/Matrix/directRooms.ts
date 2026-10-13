import type { MatrixClient } from "matrix-js-sdk";
import type { ChatRoomMembership } from "../ChatConnection";

/** What is known about one of my rooms, to tell whether it is my chat with one given person. */
export interface DirectRoomCandidate<Room> {
    room: Room;
    /** My own membership of the room. */
    myMembership: ChatRoomMembership;
    /** The other person's membership; `undefined` when the room has never had them. */
    partnerMembership: ChatRoomMembership | undefined;
    /** People other than the two of us who are joined or invited. */
    othersHolding: number;
    /** The room is a direct chat: typed so, or listed under that person in `m.direct`. Never guessed from the members. */
    looksDirect: boolean;
    /** When the last message was sent (the room's creation time with none), to prefer the newest of several. */
    lastActivity: number;
}

export function holdsTheRoom(membership: ChatRoomMembership | undefined): boolean {
    return membership === "join" || membership === "invite";
}

/**
 * Whether the room is my chat with that person: a direct room with just the two of us, whichever way it is typed.
 * The other person may have left it while I still hold it; the chat is then still mine, and opening it invites them back.
 */
export function isChatWithPerson<Room>(candidate: DirectRoomCandidate<Room>): boolean {
    if (!holdsTheRoom(candidate.myMembership)) return false;
    if (candidate.othersHolding > 0) return false;
    if (!candidate.looksDirect) return false;
    const partner = candidate.partnerMembership;
    if (holdsTheRoom(partner)) return true;
    // Only a joined person can invite the other one back; an invite I hold may be about to disappear with them gone.
    return partner === "leave" && candidate.myMembership === "join";
}

/**
 * The chat to open when there are several with the same person: the one with the newest message, a joined one before
 * an invitation, a chat with the person still in it before one they have left.
 */
export function pickChatWithPerson<Room>(candidates: DirectRoomCandidate<Room>[]): Room | undefined {
    const matching = candidates.filter(isChatWithPerson);
    if (matching.length === 0) return undefined;
    const rank = (candidate: DirectRoomCandidate<Room>): number[] => [
        candidate.lastActivity,
        candidate.myMembership === "join" ? 1 : 0,
        holdsTheRoom(candidate.partnerMembership) ? 1 : 0,
    ];
    return matching.reduce((best, candidate) => {
        const a = rank(best);
        const b = rank(candidate);
        for (let index = 0; index < a.length; index++) {
            if (b[index] !== a[index]) return b[index] > a[index] ? candidate : best;
        }
        return best;
    }).room;
}

/** The account's list of direct chats: people's ids, each with the ids of the rooms. */
export type DirectMap = Record<string, string[] | undefined>;

/** Whether the list already has that room under that person. */
export function isListedAsDirect(directMap: DirectMap | undefined, userId: string, roomId: string): boolean {
    return directMap?.[userId]?.includes(roomId) ?? false;
}

/** The list with the room added under that person; `undefined` when it is there already (nothing to save). */
export function withDirectRoom(
    directMap: DirectMap | undefined,
    userId: string,
    roomId: string
): DirectMap | undefined {
    if (isListedAsDirect(directMap, userId, roomId)) return undefined;
    return { ...directMap, [userId]: [...(directMap?.[userId] ?? []), roomId] };
}

type DirectAccountDataClient = Pick<MatrixClient, "getAccountData" | "setAccountData">;

/** Saves go one after the other per client: each one replaces the whole list, so two at once would lose one. */
const pendingSaves = new WeakMap<DirectAccountDataClient, Promise<unknown>>();

/**
 * Lists the rooms under their person in the account's `m.direct`, in one save, and only the ones that are not there yet.
 * Other apps and the other chats of the account read this list to know which rooms are direct chats.
 */
export function saveDirectRooms(
    client: DirectAccountDataClient,
    rooms: { userId: string; roomId: string }[]
): Promise<void> {
    const save = async (): Promise<void> => {
        let directMap = client.getAccountData("m.direct")?.getContent<DirectMap>() ?? undefined;
        let changed = false;
        for (const { userId, roomId } of rooms) {
            const next = withDirectRoom(directMap, userId, roomId);
            if (next === undefined) continue;
            directMap = next;
            changed = true;
        }
        if (changed) await client.setAccountData("m.direct", directMap as DirectMap);
    };
    const run = (pendingSaves.get(client) ?? Promise.resolve()).then(save, save);
    pendingSaves.set(
        client,
        run.catch(() => undefined)
    );
    return run;
}

/** The parts of a room event that tell who invited me to a direct chat. */
export interface InviteEventLike {
    type?: string;
    state_key?: string;
    sender?: string;
    content?: { membership?: string; is_direct?: boolean };
}

/**
 * Who invited me to this room as a direct chat, from the start of its history: the invite of mine that carried
 * `is_direct`. Unlike the flag the sdk keeps on my member event, this does not get lost when my profile changes.
 */
export function directInviterOf(events: readonly InviteEventLike[], myUserId: string): string | undefined {
    for (const event of events) {
        if (event.type !== "m.room.member" || event.state_key !== myUserId) continue;
        if (event.content?.membership !== "invite" || event.content.is_direct !== true) continue;
        if (event.sender && event.sender !== myUserId) return event.sender;
    }
    return undefined;
}
