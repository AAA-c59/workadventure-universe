import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    // The game reads its settings from window.env when it is loaded.
    (window as unknown as { env: Record<string, unknown> }).env = {
        PUSHER_URL: "http://pusher.example.com",
        PUBLIC_MAP_STORAGE_URL: "http://map-storage.example.com",
    };
    return { currentMapRoom: { href: "" } };
});

vi.mock("../../../Phaser/Game/GameManager", () => ({
    gameManager: {
        get currentMapRoom() {
            return mocks.currentMapRoom;
        },
    },
}));
vi.mock("../../../Connection/LocalUserStore", () => ({ localUserStore: { getAuthToken: () => "token" } }));

import { fetchWokaData } from "../WokaData";

const DEFAULT_WORLD = "https://play.example.com/@/default/hub/lobby";
const OTHER_UNIVERSE = "https://play.example.com/@/studio/film/stage";

// The page loads once; the picker must list the Wokas of the map the player is on, not of the first one. #844
describe("fetchWokaData", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
        vi.stubGlobal("fetch", fetchMock);
    });

    function requestedRoom(call: number): string | null {
        const url = new URL(fetchMock.mock.calls[call][0] as string);
        return url.searchParams.get("roomUrl");
    }

    it("lists the Wokas of the map the player is on and asks again after a map change", async () => {
        mocks.currentMapRoom = { href: DEFAULT_WORLD };
        await fetchWokaData();
        await fetchWokaData();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestedRoom(0)).toBe(DEFAULT_WORLD);

        // The player walks through an exit into another universe: the page is not reloaded.
        mocks.currentMapRoom = { href: OTHER_UNIVERSE };
        await fetchWokaData();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestedRoom(1)).toBe(OTHER_UNIVERSE);
    });
});
