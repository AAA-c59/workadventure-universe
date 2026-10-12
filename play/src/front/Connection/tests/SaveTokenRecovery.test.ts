import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    // The game reads its settings from window.env when it is loaded.
    (window as unknown as { env: Record<string, unknown> }).env = {
        PUSHER_URL: "http://pusher.example.com",
        PUBLIC_MAP_STORAGE_URL: "http://map-storage.example.com",
    };
    return { post: vi.fn(), get: vi.fn() };
});

vi.mock("../AxiosUtils", () => ({
    axiosToPusher: { post: mocks.post, get: mocks.get },
    axiosWithRetry: {},
}));
vi.mock("../Capabilities", () => ({ hasCapability: () => true }));
vi.mock("../../Phaser/Game/GameManager", () => ({ gameManager: {} }));
vi.mock("../../Administration/AnalyticsClient", () => ({ analyticsClient: {} }));
vi.mock("../../Url/UrlManager", () => ({ GameConnexionTypes: {}, urlManager: {} }));
vi.mock("../../Network/ServiceWorker", () => ({ _ServiceWorker: class {} }));
vi.mock("../../Chat/Utils", () => ({ openChatRoom: vi.fn() }));
vi.mock("../../external-modules/admin-api/orbitAccessToken", () => ({ gameTokenToJoinWith: vi.fn() }));
vi.mock("../RoomConnection", () => ({ RoomConnection: class {} }));
vi.mock("../Room", () => ({ Room: class {} }));
vi.mock("../ConnectAttemptWatch", () => ({ watchConnectAttempt: vi.fn() }));
vi.mock("../../WebRtc/HtmlUtils", () => ({ HtmlUtils: {} }));

import { connectionManager } from "../ConnectionManager";
import { localUserStore } from "../LocalUserStore";

/** A game token as the store reads it: three parts, the middle one a JSON payload. */
function gameToken(label: string): string {
    return `header.${window.btoa(JSON.stringify({ label }))}.signature`;
}

const OLD_TOKEN = gameToken("old");
const FRESH_TOKEN = gameToken("fresh");

/** What axios throws for a response with a status. */
function httpError(status: number) {
    return Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status },
    });
}

// The name save answers true or false; the WOKA and the companion saves say what happened (saved, refused, failed).
const SAVES: [string, () => Promise<unknown>, unknown, unknown][] = [
    ["saveName", () => connectionManager.saveName("Ali"), true, false],
    ["saveTextures", () => connectionManager.saveTextures(["body"]), "saved", "failed"],
    ["saveCompanionTexture", () => connectionManager.saveCompanionTexture("dog"), "saved", "failed"],
];

describe("a save that gets a 401", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (connectionManager as unknown as { authToken: string }).authToken = OLD_TOKEN;
        localUserStore.setAuthToken(OLD_TOKEN);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    // The recovery asks /me for a new token with only an Authorization header, but /me needs the token as a query
    // parameter, so it answers 400 (and with the parameter it would check the very same game token). #833
    it.each(SAVES)("%s: gives up when /me refuses, and keeps the token it had", async (_name, save, _ok, failed) => {
        mocks.post.mockRejectedValueOnce(httpError(401));
        mocks.get.mockRejectedValueOnce(httpError(400));

        expect(await save()).toBe(failed);

        expect(mocks.get).toHaveBeenCalledTimes(1);
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect((connectionManager as unknown as { authToken: string }).authToken).toBe(OLD_TOKEN);
        expect(localUserStore.getAuthToken()).toBe(OLD_TOKEN);
    });

    // Not reachable today (above); if /me ever does hand out a token, it is kept for the next room change as well.
    it.each(SAVES)("%s: a token it recovers is stored too, not only kept in memory", async (_name, save, ok) => {
        mocks.post.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce({});
        mocks.get.mockResolvedValueOnce({
            data: {
                status: "ok",
                authToken: FRESH_TOKEN,
                userUuid: "uuid-ali",
                isCharacterTexturesValid: true,
                isCompanionTextureValid: true,
            },
        });

        expect(await save()).toBe(ok);

        expect(localUserStore.getAuthToken()).toBe(FRESH_TOKEN);
        expect((connectionManager as unknown as { authToken: string }).authToken).toBe(FRESH_TOKEN);
        expect(mocks.post).toHaveBeenLastCalledWith(expect.any(String), expect.anything(), {
            headers: { Authorization: FRESH_TOKEN },
        });
    });
});
