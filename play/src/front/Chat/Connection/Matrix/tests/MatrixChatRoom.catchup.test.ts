import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixEvent, Room } from "matrix-js-sdk";

/** The room's history, oldest first, and what the fake timeline window did with it. */
const timeline = vi.hoisted(() => ({
    events: [] as unknown[],
    /** How many of the newest events the window holds once loaded (what the first sync gave). */
    initial: 8,
    paginateCalls: [] as number[],
    running: 0,
    maxRunning: 0,
    loadError: undefined as Error | undefined,
    paginateError: undefined as { onCall: number; error: Error } | undefined,
    /** The handlers the room registered on the sdk room, by event name. */
    handlers: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock("matrix-js-sdk", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    class FakeTimelineWindow {
        private start = 0;
        private end = 0;
        load(): Promise<void> {
            if (timeline.loadError) return Promise.reject(timeline.loadError);
            this.end = timeline.events.length;
            this.start = Math.max(0, this.end - timeline.initial);
            return Promise.resolve();
        }
        canPaginate(): boolean {
            return this.start > 0;
        }
        async paginate(_direction: unknown, size: number): Promise<boolean> {
            timeline.paginateCalls.push(size);
            const call = timeline.paginateCalls.length;
            timeline.running++;
            timeline.maxRunning = Math.max(timeline.maxRunning, timeline.running);
            // A request to the server.
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 5);
            });
            timeline.running--;
            if (timeline.paginateError?.onCall === call) throw timeline.paginateError.error;
            const count = Math.min(size, this.start);
            this.start -= count;
            return count > 0;
        }
        unpaginate(delta: number): void {
            this.end -= delta;
        }
        getEvents(): unknown[] {
            return timeline.events.slice(this.start, this.end);
        }
    }
    return { ...actual, TimelineWindow: FakeTimelineWindow };
});

vi.mock("../../../Stores/ChatStore", async () => {
    const { writable } = await import("svelte/store");
    return {
        isAChatRoomIsVisible: () => true,
        navChat: writable("chat"),
        selectedChatMessageToReply: writable(null),
        botsChatIds: writable([]),
    };
});
vi.mock("../../../Stores/SelectRoomStore", async () => {
    const { writable } = await import("svelte/store");
    return { selectedRoomStore: writable(undefined) };
});
vi.mock("../../../../Phaser/Game/GameManager", () => ({ gameManager: {} }));
vi.mock("../../../../Connection/LocalUserStore", () => ({ localUserStore: {} }));
vi.mock("../../../../Notification/MessageNotification", () => ({ MessageNotification: class {} }));
vi.mock("../../../../Notification/NotificationManager", () => ({ notificationManager: {} }));
vi.mock("../MatrixMedia", () => ({
    holdMatrixMedia: vi.fn(),
    changingMatrixAvatarStore: () => ({ subscribe: () => () => {} }),
}));
vi.mock("../MatrixSecurity", () => ({
    matrixSecurity: { restoreRoomsMessages: () => Promise.resolve() },
}));
vi.mock("../MatrixChatRoomMember", () => ({ MatrixChatRoomMember: class {} }));
vi.mock("../MatrixChatMessage", () => ({
    MatrixChatMessage: class {
        readonly id: string;
        constructor(event: { getId: () => string }) {
            this.id = event.getId();
        }
    },
}));
vi.mock("../MatrixChatMessageReaction", () => ({ MatrixChatMessageReaction: class {} }));

import { MatrixChatRoom } from "../MatrixChatRoom";

let nextId = 0;
/** A message from the other person, `ageMs` old when it reaches this device. */
function message(ageMs?: number): MatrixEvent {
    const id = `$m${++nextId}`;
    return {
        getId: () => id,
        getType: () => "m.room.message",
        getSender: () => "@you:matrix.test",
        getAge: () => ageMs,
        status: null,
        isEncrypted: () => false,
        getRelation: () => undefined,
        getContent: () => ({ body: id }),
    } as unknown as MatrixEvent;
}

function fakeRoom(): Room {
    return {
        roomId: "!dm:matrix.test",
        name: "DM",
        myUserId: "@me:matrix.test",
        client: {
            getAccountData: () => undefined,
            getUserId: () => "@me:matrix.test",
            getSafeUserId: () => "@me:matrix.test",
        },
        getUnreadNotificationCount: () => 0,
        getMyMembership: () => "join",
        getDMInviter: () => "@you:matrix.test",
        getMembers: () => [],
        getLiveTimeline: () => ({ getTimelineSet: () => ({}) }),
        hasEncryptionStateEvent: () => false,
        isSpaceRoom: () => false,
        getMxcAvatarUrl: () => undefined,
        getAvatarFallbackMember: () => undefined,
        getPendingEvents: () => [],
        on: (name: string, handler: (...args: unknown[]) => void) => timeline.handlers.set(name, handler),
        off: () => {},
    } as unknown as Room;
}

/** What the sdk emits for an event of the live timeline (`liveEvent`), or one added at the start of it. */
function emitTimeline(event: MatrixEvent, options: { live?: boolean; toStart?: boolean } = {}) {
    timeline.handlers.get("Room.timeline")?.(
        event,
        { getUnreadNotificationCount: () => 0 },
        options.toStart ?? false,
        false,
        {
            liveEvent: options.live ?? true,
        }
    );
}
function emitTimelineReset() {
    timeline.handlers.get("Room.timelineReset")?.();
}

const ids = (room: MatrixChatRoom): string[] => [...room.messages].map((m) => m.id);
const settle = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 40);
    });

describe("MatrixChatRoom catching up after a reload or a sleeping tab", () => {
    let notify: ReturnType<typeof vi.fn>;
    /** Builds the room with the first `loaded` events of the history in its first window (the saved copy). */
    async function roomWithSavedCopy(history: MatrixEvent[], loaded: number) {
        timeline.events = history.slice(0, loaded);
        const room = new MatrixChatRoom(fakeRoom(), notify as never);
        await settle();
        return room;
    }

    beforeEach(() => {
        nextId = 0;
        timeline.events = [];
        timeline.initial = 8;
        timeline.paginateCalls = [];
        timeline.running = 0;
        timeline.maxRunning = 0;
        timeline.loadError = undefined;
        timeline.paginateError = undefined;
        timeline.handlers.clear();
        notify = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("adds a message that arrives minutes after it was sent, without a sound", async () => {
        const saved = [message(), message()];
        const room = await roomWithSavedCopy(saved, 2);

        const missed = message(5 * 60_000);
        emitTimeline(missed);
        await settle();

        expect(ids(room)).toEqual([...saved.map((m) => m.getId()), missed.getId()]);
        expect(notify).not.toHaveBeenCalled();
    });

    it("keeps catch-up messages in the order they came", async () => {
        const saved = [message()];
        const room = await roomWithSavedCopy(saved, 1);

        const first = message(90_000);
        const second = message(60_000);
        emitTimeline(first);
        emitTimeline(second);
        await settle();

        expect(ids(room)).toEqual([saved[0].getId(), first.getId(), second.getId()]);
    });

    it("still plays the sound for a message that arrives now", async () => {
        const room = await roomWithSavedCopy([message()], 1);

        const fresh = message(300);
        emitTimeline(fresh);
        await settle();

        expect(ids(room)).toContain(fresh.getId());
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("does not add a catch-up message the list already has, or replace it", async () => {
        const saved = [message(), message()];
        const room = await roomWithSavedCopy(saved, 2);
        const alreadyThere = [...room.messages][1];

        // The same event, delivered again as catch-up.
        const again = message(120_000);
        (again as unknown as { getId: () => string }).getId = () => saved[1].getId()!;
        emitTimeline(again);
        await settle();

        expect(ids(room)).toEqual(saved.map((m) => m.getId()));
        expect([...room.messages][1]).toBe(alreadyThere);
    });

    it("waits for the first load before adding a catch-up message, so the order holds", async () => {
        const history = [message(), message(), message(120_000)];
        timeline.events = history;
        timeline.initial = 3;
        const room = new MatrixChatRoom(fakeRoom(), notify as never);

        // Arrives while the first load is still going: it is already in the window, and must not be doubled.
        emitTimeline(history[2]);
        await settle();

        expect(ids(room)).toEqual(history.map((m) => m.getId()));
    });

    it("ignores events that are not at the live end", async () => {
        const room = await roomWithSavedCopy([message()], 1);

        emitTimeline(message(120_000), { toStart: true });
        emitTimeline(message(120_000), { live: false });
        await settle();

        expect(ids(room)).toHaveLength(1);
    });

    describe("a gap in the history", () => {
        it("builds the list again from the new end and pages the earlier messages in", async () => {
            const all = Array.from({ length: 60 }, () => message());
            // The saved copy holds the first 8; then a long time passes and the sync starts a new timeline.
            const room = await roomWithSavedCopy(all, 8);
            expect(ids(room)).toHaveLength(8);

            timeline.events = all;
            timeline.initial = 8;
            timeline.paginateCalls = [];
            emitTimelineReset();
            await settle();
            await settle();

            // The newest 8 messages and the page loaded behind them: nothing missing at the end, in order.
            const shown = ids(room);
            expect(shown[shown.length - 1]).toBe(all[59].getId());
            expect(shown).toEqual(all.slice(60 - shown.length).map((m) => m.getId()));
            expect(shown.length).toBeGreaterThanOrEqual(20);
            expect(new Set(shown).size).toBe(shown.length);
        });

        it("waits for the first load when the gap is found while it is still going", async () => {
            const all = Array.from({ length: 12 }, () => message());
            timeline.events = all;
            const room = new MatrixChatRoom(fakeRoom(), notify as never);

            emitTimelineReset();
            await settle();
            await settle();

            expect(ids(room)).toEqual(all.map((m) => m.getId()));
        });
    });
});
