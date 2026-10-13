import type { MatrixClient } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Readable } from "svelte/store";
import { readable, writable } from "svelte/store";
import type { MatrixChatRoom } from "../MatrixChatRoom";
import type { MatrixSecurity } from "../MatrixSecurity";
import { MatrixChatConnection } from "../MatrixChatConnection";

vi.mock("../MatrixChatRoom", () => ({ MatrixChatRoom: vi.fn() }));
vi.mock("../../../../Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: () => ({}) },
}));
vi.mock("../../../../Phaser/Entity/CharacterLayerManager", () => ({
    CharacterLayerManager: { wokaBase64: () => Promise.resolve("") },
}));
vi.mock("../../../../Enum/EnvironmentVariable.ts", () => ({ MATRIX_ADMIN_USER: "admin", MATRIX_DOMAIN: "domain" }));
vi.mock("../../../Stores/ChatStore.ts", () => ({ selectedRoomStore: writable(undefined) }));

const ME = "@me:matrix.test";
const ALICE = "@alice:matrix.test";

interface FakeRoomOptions {
    type?: "direct" | "multiple";
    my?: string;
    members?: Record<string, string>;
    lastMessage?: number;
    /** The room has a name of its own (a group), and not the default one of a chat. */
    named?: boolean;
    /** The person whose invite carried the direct flag. */
    dmInviter?: string;
}

describe("MatrixChatConnection: the chat with one person", () => {
    /** What the server has been asked to do. */
    let createRoom: ReturnType<typeof vi.fn>;
    let invite: ReturnType<typeof vi.fn>;
    let setAccountData: ReturnType<typeof vi.fn>;
    let directMap: Record<string, string[]> | undefined;
    let sdkRooms: Map<string, unknown>;
    let connection: MatrixChatConnection;
    let rooms: Map<string, { id: string; membership: Record<string, ReturnType<typeof writable<string>>> }>;

    /** Puts a chat in the room list as the connection would hold it. */
    function addRoom(id: string, options: FakeRoomOptions = {}): MatrixChatRoom {
        const memberships: Record<string, ReturnType<typeof writable<string>>> = {};
        for (const [userId, membership] of Object.entries(options.members ?? { [ME]: "join", [ALICE]: "join" })) {
            memberships[userId] = writable(membership);
        }
        const room = {
            id,
            type: options.type ?? "direct",
            myMembership: writable(options.my ?? "join"),
            members: readable(
                Object.entries(memberships).map(([userId, membership]) => ({
                    id: userId,
                    membership: membership as Readable<string>,
                }))
            ),
            lastMessageTimestamp: options.lastMessage ?? 100,
            destroy: vi.fn(),
            hasOutdatedType: () => false,
        } as unknown as MatrixChatRoom;
        sdkRooms.set(id, {
            getDMInviter: () => options.dmInviter,
            currentState: {
                getStateEvents: () => (options.named ? { getContent: () => ({ name: "Project room" }) } : null),
            },
        });
        connection["roomList"].set(id, room);
        rooms.set(id, { id, membership: memberships });
        return room;
    }

    beforeEach(async () => {
        createRoom = vi.fn().mockResolvedValue({ room_id: "!new:matrix.test" });
        invite = vi.fn().mockResolvedValue({});
        setAccountData = vi.fn().mockImplementation((_type: string, next: Record<string, string[]>) => {
            directMap = next;
            return Promise.resolve({});
        });
        directMap = undefined;
        sdkRooms = new Map();
        rooms = new Map();
        const client = {
            isGuest: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
            once: vi.fn(),
            store: { startup: vi.fn() },
            initRustCrypto: vi.fn(),
            startClient: vi.fn(),
            getUserId: () => ME,
            getRoom: (id: string) => sdkRooms.get(id) ?? null,
            getAccountData: () => (directMap ? { getContent: () => directMap } : undefined),
            setAccountData,
            createRoom,
            invite,
        } as unknown as MatrixClient;
        connection = new MatrixChatConnection(Promise.resolve(client), { subscribe: vi.fn() }, {
            isEncryptionRequiredAndNotSet: false,
        } as unknown as MatrixSecurity);
        await connection.init();
        Object.assign(connection, { isClientReady: true });
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    describe("finding it", () => {
        it("finds a direct chat with just the two of us", () => {
            const room = addRoom("!chat");

            expect(connection.getDirectRoomFor(ALICE)).toBe(room);
        });

        it("finds nothing for someone you have no chat with", () => {
            addRoom("!chat");

            expect(connection.getDirectRoomFor("@bob:matrix.test")).toBeUndefined();
        });

        it("finds a chat that lost its direct type once the account lists it (the flag was lost on a profile change)", () => {
            const room = addRoom("!chat", { type: "multiple", named: true });
            directMap = { [ALICE]: ["!chat"] };

            expect(connection.getDirectRoomFor(ALICE)).toBe(room);
        });

        it("finds a chat that is not typed or listed as direct when it is just the two of us and has no name", () => {
            const room = addRoom("!chat", { type: "multiple" });

            expect(connection.getDirectRoomFor(ALICE)).toBe(room);
        });

        it("does not take a named group of two for the chat", () => {
            addRoom("!group", { type: "multiple", named: true });

            expect(connection.getDirectRoomFor(ALICE)).toBeUndefined();
        });

        it("does not take a room with a third person in it for the chat", () => {
            addRoom("!trio", { members: { [ME]: "join", [ALICE]: "join", "@bob:matrix.test": "invite" } });

            expect(connection.getDirectRoomFor(ALICE)).toBeUndefined();
        });

        it("opens the one with the newest message when there are two", () => {
            addRoom("!old", { lastMessage: 10 });
            const newer = addRoom("!new", { lastMessage: 500 });
            addRoom("!middle", { lastMessage: 200 });

            expect(connection.getDirectRoomFor(ALICE)).toBe(newer);
        });

        it("finds the chat the other person deleted while I still have it", () => {
            const room = addRoom("!chat", { members: { [ME]: "join", [ALICE]: "leave" } });

            expect(connection.getDirectRoomFor(ALICE)).toBe(room);
        });

        it("finds an invitation from the person even when the room's members are not loaded", () => {
            const room = addRoom("!invite", { my: "invite", members: { [ME]: "invite" }, dmInviter: ALICE });

            expect(connection.getDirectRoomFor(ALICE)).toBe(room);
        });

        it("never finds a chat with yourself", () => {
            addRoom("!chat");

            expect(connection.getDirectRoomFor(ME)).toBeUndefined();
        });
    });

    describe("opening it", () => {
        it("opens the chat that exists and makes no new room", async () => {
            const room = addRoom("!chat");
            directMap = { [ALICE]: ["!chat"] };

            await expect(connection.createDirectRoom(ALICE)).resolves.toBe(room);

            expect(createRoom).not.toHaveBeenCalled();
            expect(invite).not.toHaveBeenCalled();
            expect(setAccountData).not.toHaveBeenCalled();
        });

        it("makes a room when there is no chat yet, and lists it", async () => {
            vi.spyOn(
                connection as unknown as { waitForNextSync: () => Promise<void> },
                "waitForNextSync"
            ).mockResolvedValue();
            vi.spyOn(
                connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                "createAndAddNewRootRoom"
            ).mockReturnValue("the new chat");
            sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

            await expect(connection.createDirectRoom(ALICE)).resolves.toBe("the new chat");

            expect(createRoom).toHaveBeenCalledOnce();
            expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ is_direct: true, invite: [ALICE] }));
            expect(directMap).toEqual({ [ALICE]: ["!new:matrix.test"] });
        });

        it("invites the person back into the same room when they deleted the chat, and makes no new room", async () => {
            const room = addRoom("!chat", { members: { [ME]: "join", [ALICE]: "leave" } });
            directMap = { [ALICE]: ["!chat"] };

            await expect(connection.createDirectRoom(ALICE)).resolves.toBe(room);

            expect(invite).toHaveBeenCalledExactlyOnceWith("!chat", ALICE);
            expect(createRoom).not.toHaveBeenCalled();
        });

        it("does not invite someone who is still in the chat, or only invited", async () => {
            addRoom("!joined");
            await connection.createDirectRoom(ALICE);
            connection["roomList"].delete("!joined");
            addRoom("!invited", { members: { [ME]: "join", [ALICE]: "invite" } });
            await connection.createDirectRoom(ALICE);

            expect(invite).not.toHaveBeenCalled();
        });

        it("shows the error when the invite back fails, and does not make a room instead", async () => {
            addRoom("!chat", { members: { [ME]: "join", [ALICE]: "leave" } });
            invite.mockRejectedValue(new Error("forbidden"));

            await expect(connection.createDirectRoom(ALICE)).rejects.toBeDefined();

            expect(createRoom).not.toHaveBeenCalled();
        });

        it("lists a found chat that the account does not list yet", async () => {
            addRoom("!chat", { type: "multiple" });

            await connection.createDirectRoom(ALICE);
            await vi.waitFor(() => expect(directMap).toEqual({ [ALICE]: ["!chat"] }));
        });

        it("makes one room when Message is pressed twice for the same person at once", async () => {
            vi.spyOn(
                connection as unknown as { waitForNextSync: () => Promise<void> },
                "waitForNextSync"
            ).mockResolvedValue();
            vi.spyOn(
                connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                "createAndAddNewRootRoom"
            ).mockReturnValue("the new chat");
            sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

            const [first, second] = await Promise.all([
                connection.createDirectRoom(ALICE),
                connection.createDirectRoom(ALICE),
            ]);

            expect(createRoom).toHaveBeenCalledOnce();
            expect(first).toBe(second);
        });

        it("makes a room for each person when Message is pressed for two people at once", async () => {
            vi.spyOn(
                connection as unknown as { waitForNextSync: () => Promise<void> },
                "waitForNextSync"
            ).mockResolvedValue();
            vi.spyOn(
                connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                "createAndAddNewRootRoom"
            ).mockReturnValue("a chat");
            sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

            await Promise.all([connection.createDirectRoom(ALICE), connection.createDirectRoom("@bob:matrix.test")]);

            expect(createRoom).toHaveBeenCalledTimes(2);
        });

        it("makes another room after the first request is over (the chat was deleted meanwhile)", async () => {
            vi.spyOn(
                connection as unknown as { waitForNextSync: () => Promise<void> },
                "waitForNextSync"
            ).mockResolvedValue();
            vi.spyOn(
                connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                "createAndAddNewRootRoom"
            ).mockReturnValue("a chat");
            sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

            await connection.createDirectRoom(ALICE);
            await connection.createDirectRoom(ALICE);

            expect(createRoom).toHaveBeenCalledTimes(2);
        });

        it("lets the next try through when a request fails", async () => {
            createRoom.mockRejectedValueOnce(new Error("offline"));
            vi.spyOn(
                connection as unknown as { waitForNextSync: () => Promise<void> },
                "waitForNextSync"
            ).mockResolvedValue();
            vi.spyOn(
                connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                "createAndAddNewRootRoom"
            ).mockReturnValue("a chat");
            sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

            await expect(connection.createDirectRoom(ALICE)).rejects.toBeDefined();
            await expect(connection.createDirectRoom(ALICE)).resolves.toBe("a chat");
        });

        it("is busy while a room is made and free afterwards", async () => {
            const states: boolean[] = [];
            const stopWatching = connection.roomCreationInProgress.subscribe((busy) => states.push(busy));
            vi.spyOn(
                connection as unknown as { waitForNextSync: () => Promise<void> },
                "waitForNextSync"
            ).mockResolvedValue();
            vi.spyOn(
                connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                "createAndAddNewRootRoom"
            ).mockReturnValue("a chat");
            sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

            await Promise.all([connection.createDirectRoom(ALICE), connection.createDirectRoom("@bob:matrix.test")]);

            stopWatching();
            expect(states).toEqual([false, true, false]);
        });

        describe("before the first sync is over", () => {
            beforeEach(() => {
                connection["isClientReady"] = false;
                connection.connectionStatus.set("CONNECTING");
            });

            it("waits for the chats to load and then opens the one that is there, not a new room", async () => {
                const opening = connection.createDirectRoom(ALICE);
                await Promise.resolve();
                expect(createRoom).not.toHaveBeenCalled();

                const room = addRoom("!chat");
                connection.connectionStatus.set("ONLINE");

                await expect(opening).resolves.toBe(room);
                expect(createRoom).not.toHaveBeenCalled();
            });

            it("stops waiting after a few seconds when the sync does not finish", async () => {
                vi.useFakeTimers();
                try {
                    vi.spyOn(
                        connection as unknown as { waitForNextSync: () => Promise<void> },
                        "waitForNextSync"
                    ).mockResolvedValue();
                    vi.spyOn(
                        connection as unknown as { createAndAddNewRootRoom: (room: unknown) => unknown },
                        "createAndAddNewRootRoom"
                    ).mockReturnValue("a chat");
                    sdkRooms.set("!new:matrix.test", { roomId: "!new:matrix.test" });

                    const opening = connection.createDirectRoom(ALICE);
                    await vi.advanceTimersByTimeAsync(8000);

                    await expect(opening).resolves.toBe("a chat");
                    expect(createRoom).toHaveBeenCalledOnce();
                } finally {
                    vi.useRealTimers();
                }
            });

            it("does not wait when the connection is down: the error comes at once", async () => {
                connection.connectionStatus.set("ON_ERROR");
                createRoom.mockRejectedValue(new Error("offline"));

                await expect(connection.createDirectRoom(ALICE)).rejects.toBeDefined();
            });
        });
    });

    describe("repairing the account's list of direct chats", () => {
        it("lists a joined chat that still carries the direct flag of the invite and is not listed", async () => {
            addRoom("!chat", { type: "multiple", dmInviter: ALICE });

            connection["repairDirectAccountData"]();
            await vi.waitFor(() => expect(directMap).toEqual({ [ALICE]: ["!chat"] }));
            expect(setAccountData).toHaveBeenCalledOnce();
        });

        it("saves all the missing ones in one write", async () => {
            addRoom("!one", { dmInviter: ALICE });
            addRoom("!two", { dmInviter: "@bob:matrix.test" });

            connection["repairDirectAccountData"]();
            await vi.waitFor(() => expect(setAccountData).toHaveBeenCalledOnce());

            expect(directMap).toEqual({ [ALICE]: ["!one"], "@bob:matrix.test": ["!two"] });
        });

        it("saves nothing when the chats are listed already", () => {
            addRoom("!chat", { dmInviter: ALICE });
            directMap = { [ALICE]: ["!chat"] };

            connection["repairDirectAccountData"]();

            expect(setAccountData).not.toHaveBeenCalled();
        });

        it("leaves alone a chat I started (no flag), an invitation not accepted yet, and a group", () => {
            addRoom("!mine");
            addRoom("!pending", { my: "invite", dmInviter: ALICE });
            addRoom("!group", { type: "multiple", named: true });

            connection["repairDirectAccountData"]();

            expect(setAccountData).not.toHaveBeenCalled();
        });

        it("runs when the account's list arrives, and does not run again for the list it saved", async () => {
            addRoom("!chat", { dmInviter: ALICE });
            const event = { getType: () => EventType.Direct } as never;

            connection["onAccountDataEvent"](event);
            await vi.waitFor(() => expect(setAccountData).toHaveBeenCalledOnce());
            connection["onAccountDataEvent"](event);

            expect(setAccountData).toHaveBeenCalledOnce();
        });
    });
});
