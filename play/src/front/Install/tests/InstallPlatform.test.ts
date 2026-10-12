import { describe, expect, it } from "vitest";
import type { InstallEnvironment } from "../InstallPlatform";
import { browserMenuGuideFor, installGuideFor, isInstalledApp } from "../InstallPlatform";

const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_INSTAGRAM =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0 (iPhone15,2; iOS 18_0)";
const IPHONE_WEBVIEW =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_SAFARI_AS_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC_SAFARI =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC_SAFARI_16 =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
const MAC_CHROME =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WINDOWS_FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";

function env(userAgent: string, overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
    return {
        userAgent,
        platform: "",
        maxTouchPoints: 0,
        displayModeInstalled: false,
        navigatorStandalone: false,
        ...overrides,
    };
}

describe("installGuideFor", () => {
    it("points iPhone Safari at Share behind the dots", () => {
        expect(installGuideFor(env(IPHONE_SAFARI, { platform: "iPhone", maxTouchPoints: 5 }))).toBe("iphone-safari");
    });

    it("points Chrome on iPhone at Share at the top right", () => {
        expect(installGuideFor(env(IPHONE_CHROME, { platform: "iPhone", maxTouchPoints: 5 }))).toBe("ios-chrome");
    });

    it("asks to open Safari from Instagram and other apps' own browsers", () => {
        expect(installGuideFor(env(IPHONE_INSTAGRAM, { platform: "iPhone", maxTouchPoints: 5 }))).toBe(
            "open-in-safari"
        );
        // A web view that does not even say Safari.
        expect(installGuideFor(env(IPHONE_WEBVIEW, { platform: "iPhone", maxTouchPoints: 5 }))).toBe("open-in-safari");
    });

    it("asks to open Safari from other iPhone browsers", () => {
        expect(installGuideFor(env(IPHONE_FIREFOX, { platform: "iPhone", maxTouchPoints: 5 }))).toBe("open-in-safari");
    });

    it("knows an iPad that says it is a Mac, because a Mac has no touch screen", () => {
        expect(installGuideFor(env(IPAD_SAFARI_AS_MAC, { platform: "MacIntel", maxTouchPoints: 5 }))).toBe(
            "ipad-safari"
        );
    });

    it("points Mac Safari 17 and later at File > Add to Dock", () => {
        expect(installGuideFor(env(MAC_SAFARI, { platform: "MacIntel" }))).toBe("mac-safari");
    });

    it("has no guide for Mac Safari before Add to Dock existed", () => {
        expect(installGuideFor(env(MAC_SAFARI_16, { platform: "MacIntel" }))).toBeUndefined();
    });

    it("leaves browsers that install from their own window without a guide", () => {
        expect(installGuideFor(env(MAC_CHROME, { platform: "MacIntel" }))).toBeUndefined();
        expect(installGuideFor(env(ANDROID_CHROME, { platform: "Linux armv81", maxTouchPoints: 5 }))).toBeUndefined();
    });

    it("has no way in on Firefox for a computer", () => {
        expect(installGuideFor(env(WINDOWS_FIREFOX, { platform: "Win32" }))).toBeUndefined();
    });
});

describe("browserMenuGuideFor", () => {
    it("tells Android from a computer", () => {
        expect(browserMenuGuideFor(env(ANDROID_CHROME, { platform: "Linux armv81" }))).toBe("browser-menu-android");
        expect(browserMenuGuideFor(env(MAC_CHROME, { platform: "MacIntel" }))).toBe("browser-menu-desktop");
    });
});

describe("isInstalledApp", () => {
    it("is true in a standalone window and in a home screen app", () => {
        expect(isInstalledApp(env(MAC_CHROME, { displayModeInstalled: true }))).toBe(true);
        expect(isInstalledApp(env(IPHONE_SAFARI, { navigatorStandalone: true }))).toBe(true);
    });

    it("is false in a browser tab", () => {
        expect(isInstalledApp(env(MAC_CHROME))).toBe(false);
    });
});
