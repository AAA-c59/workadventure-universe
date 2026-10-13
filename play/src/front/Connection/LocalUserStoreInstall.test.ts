import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUserStore } from "./LocalUserStore";

vi.mock("../Enum/EnvironmentVariable.ts", () => {
    return {
        PEER_SCREEN_SHARE_RECOMMENDED_BANDWIDTH: 0,
        PEER_VIDEO_RECOMMENDED_BANDWIDTH: 0,
        MAX_USERNAME_LENGTH: 10,
    };
});

describe("LocalUserStore install flags", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("remembers that the card was seen and the install counted, and forgets the install", () => {
        expect(localUserStore.isInstallCardSeen()).toBe(false);
        localUserStore.markInstallCardSeen();
        expect(localUserStore.isInstallCardSeen()).toBe(true);

        localUserStore.markInstallReported();
        expect(localUserStore.isInstallReported()).toBe(true);
        localUserStore.clearInstallReported();
        expect(localUserStore.isInstallReported()).toBe(false);
    });

    it("never throws when the browser blocks its storage", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new Error("blocked");
        });

        expect(localUserStore.isInstallCardSeen()).toBe(false);
        expect(localUserStore.isInstallReported()).toBe(false);
        expect(() => localUserStore.markInstallCardSeen()).not.toThrow();
        expect(() => localUserStore.markInstallReported()).not.toThrow();
        expect(() => localUserStore.clearInstallReported()).not.toThrow();
    });
});
