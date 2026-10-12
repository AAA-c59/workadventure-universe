import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { BeforeInstallPromptEvent, InstallAnalytics, InstallStorage } from "../InstallApp";
import { FIRST_MOMENT_MS, INSTALLED_TOAST_MS, InstallApp } from "../InstallApp";
import type { InstallEnvironment } from "../InstallPlatform";

const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";

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

function memoryStorage(seen = false, reported = false): InstallStorage & { seen: boolean; reported: boolean } {
    const storage = {
        seen,
        reported,
        isCardSeen: () => storage.seen,
        markCardSeen: () => {
            storage.seen = true;
        },
        isInstallReported: () => storage.reported,
        markInstallReported: () => {
            storage.reported = true;
        },
        clearInstallReported: () => {
            storage.reported = false;
        },
    };
    return storage;
}

function fakeAnalytics() {
    return { cardShown: vi.fn(), cardDismissed: vi.fn(), installed: vi.fn() } satisfies InstallAnalytics;
}

/** A browser window that lets the test fire the browser's events. */
function fakeWindow() {
    const handlers = new Map<string, ((event: Event) => void)[]>();
    return {
        addEventListener: (type: string, handler: (event: Event) => void) => {
            handlers.set(type, [...(handlers.get(type) ?? []), handler]);
        },
        removeEventListener: (type: string, handler: (event: Event) => void) => {
            handlers.set(
                type,
                (handlers.get(type) ?? []).filter((candidate) => candidate !== handler)
            );
        },
        fire(type: string, event: Event = new Event(type)) {
            for (const handler of handlers.get(type) ?? []) handler(event);
        },
    };
}

function installEvent(outcome: "accepted" | "dismissed") {
    const prompt = vi.fn(() => Promise.resolve());
    const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome });
    return { event, prompt };
}

describe("InstallApp", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    function setup(
        options: {
            env?: InstallEnvironment;
            storage?: ReturnType<typeof memoryStorage>;
            installedApps?: () => Promise<readonly unknown[]>;
        } = {}
    ) {
        const quiet = writable(true);
        const storage = options.storage ?? memoryStorage();
        const analytics = fakeAnalytics();
        const win = fakeWindow();
        const app = new InstallApp({ env: options.env ?? env(IPHONE_SAFARI), quiet, storage, analytics });
        app.start(win, options.installedApps);
        return { app, quiet, storage, analytics, win };
    }

    describe("where it is possible", () => {
        it("is possible on iPhone Safari at once, by the guide", () => {
            const { app } = setup();
            expect(get(app.canInstallStore)).toBe(true);
            expect(app.guide).toBe("iphone-safari");
        });

        it("is possible on Chrome only once the browser sends its install event", () => {
            const { app, win } = setup({ env: env(CHROME) });
            expect(get(app.canInstallStore)).toBe(false);
            win.fire("beforeinstallprompt", installEvent("accepted").event);
            expect(get(app.canInstallStore)).toBe(true);
        });

        it("is not possible on Firefox for a computer", () => {
            const { app } = setup({ env: env(FIREFOX) });
            expect(get(app.canInstallStore)).toBe(false);
        });

        it("is not possible, and never shows, inside the native Universe app", () => {
            const webView =
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
            const { app, storage } = setup({ env: env(webView, { nativeShell: true }) });
            expect(get(app.canInstallStore)).toBe(false);
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(false);
            expect(storage.seen).toBe(false);
        });

        it("is not possible, and never shows, inside the installed app", () => {
            const { app, storage } = setup({ env: env(IPHONE_SAFARI, { navigatorStandalone: true }) });
            expect(get(app.canInstallStore)).toBe(false);
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(false);
            expect(storage.seen).toBe(false);
        });

        it("keeps the browser's own mini bar away, so the card picks the moment", () => {
            const { win } = setup({ env: env(CHROME) });
            const { event } = installEvent("accepted");
            win.fire("beforeinstallprompt", event);
            expect(event.defaultPrevented).toBe(true);
        });
    });

    describe("the card", () => {
        it("does not show on arrival", () => {
            const { app } = setup();
            app.noteInRoom();
            expect(get(app.cardVisibleStore)).toBe(false);
        });

        it("shows after the first conversation ends", () => {
            const { app, analytics } = setup();
            app.noteInRoom();
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(true);
            expect(analytics.cardShown).toHaveBeenCalledTimes(1);
        });

        it("shows after three minutes in a room when there was no conversation", () => {
            const { app } = setup();
            app.noteInRoom();
            vi.advanceTimersByTime(FIRST_MOMENT_MS - 1);
            expect(get(app.cardVisibleStore)).toBe(false);
            vi.advanceTimersByTime(1);
            expect(get(app.cardVisibleStore)).toBe(true);
        });

        it("waits out a call, the chat or a menu, and comes back when they end", () => {
            const { app, quiet, analytics } = setup();
            quiet.set(false);
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(false);
            expect(analytics.cardShown).not.toHaveBeenCalled();
            quiet.set(true);
            expect(get(app.cardVisibleStore)).toBe(true);
            quiet.set(false);
            expect(get(app.cardVisibleStore)).toBe(false);
            quiet.set(true);
            expect(get(app.cardVisibleStore)).toBe(true);
            // Counted once, however often it came and went.
            expect(analytics.cardShown).toHaveBeenCalledTimes(1);
        });

        it("shows once ever: remembered the moment it shows, so another visit never brings it back", () => {
            const first = setup();
            first.app.noteConversationEnded();
            expect(first.storage.seen).toBe(true);
            const second = setup({ storage: first.storage });
            second.app.noteInRoom();
            second.app.noteConversationEnded();
            expect(get(second.app.cardVisibleStore)).toBe(false);
            expect(second.analytics.cardShown).not.toHaveBeenCalled();
        });

        it("goes for good with the ✕ and is counted as dismissed", () => {
            const { app, analytics, storage } = setup();
            app.noteConversationEnded();
            app.dismissCard();
            expect(get(app.cardVisibleStore)).toBe(false);
            expect(analytics.cardDismissed).toHaveBeenCalledTimes(1);
            expect(storage.seen).toBe(true);
        });

        it("waits for the browser's install event on Chrome before it shows", () => {
            const { app, win } = setup({ env: env(CHROME) });
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(false);
            win.fire("beforeinstallprompt", installEvent("accepted").event);
            expect(get(app.cardVisibleStore)).toBe(true);
        });
    });

    describe("installing", () => {
        it("opens the iPhone guide from the menu", async () => {
            const { app } = setup();
            await app.install("menu");
            expect(get(app.guideOpenStore)).toBe("iphone-safari");
            app.closeGuide();
            expect(get(app.guideOpenStore)).toBeUndefined();
        });

        it("closes the card when Install is tapped on it, and opens the guide", async () => {
            const { app } = setup();
            app.noteConversationEnded();
            await app.install("card");
            expect(get(app.cardVisibleStore)).toBe(false);
            expect(get(app.guideOpenStore)).toBe("iphone-safari");
        });

        it("opens the browser's own window on Chrome, and says so when the app was added", async () => {
            const { app, win, analytics, storage } = setup({ env: env(CHROME) });
            const { event, prompt } = installEvent("accepted");
            win.fire("beforeinstallprompt", event);
            await app.install("menu");
            expect(prompt).toHaveBeenCalledTimes(1);
            expect(get(app.installedToastStore)).toBe(true);
            expect(get(app.canInstallStore)).toBe(false);
            expect(analytics.installed).toHaveBeenCalledWith("menu");
            expect(storage.reported).toBe(true);
            vi.advanceTimersByTime(INSTALLED_TOAST_MS);
            expect(get(app.installedToastStore)).toBe(false);
        });

        it("counts an install once when the browser then says the app was installed", async () => {
            const { app, win, analytics } = setup({ env: env(CHROME) });
            win.fire("beforeinstallprompt", installEvent("accepted").event);
            await app.install("card");
            win.fire("appinstalled");
            expect(analytics.installed).toHaveBeenCalledTimes(1);
        });

        it("says nothing when the player cancels the browser's window", async () => {
            const { app, win, analytics } = setup({ env: env(CHROME) });
            win.fire("beforeinstallprompt", installEvent("dismissed").event);
            await app.install("menu");
            expect(get(app.installedToastStore)).toBe(false);
            expect(analytics.installed).not.toHaveBeenCalled();
        });

        it("keeps the row after a cancel and points at the browser's own menu, since its window cannot open twice", async () => {
            const { app, win } = setup({ env: env(CHROME) });
            const { event, prompt } = installEvent("dismissed");
            win.fire("beforeinstallprompt", event);
            await app.install("menu");
            expect(get(app.canInstallStore)).toBe(true);
            await app.install("menu");
            expect(prompt).toHaveBeenCalledTimes(1);
            expect(get(app.guideOpenStore)).toBe("browser-chrome-android");
            app.closeGuide();
            expect(get(app.guideOpenStore)).toBeUndefined();
        });

        it("points a computer at the browser's menu too", async () => {
            const { app, win } = setup({ env: env(DESKTOP_CHROME) });
            win.fire("beforeinstallprompt", installEvent("dismissed").event);
            await app.install("menu");
            await app.install("menu");
            expect(get(app.guideOpenStore)).toBe("browser-chrome-desktop");
        });

        it("keeps the row when the browser's window fails to open", async () => {
            const { app, win } = setup({ env: env(CHROME) });
            const { event } = installEvent("accepted");
            event.prompt = vi.fn(() => Promise.reject(new Error("used already")));
            vi.spyOn(console, "warn").mockImplementation(() => undefined);
            win.fire("beforeinstallprompt", event);
            await app.install("menu");
            expect(get(app.canInstallStore)).toBe(true);
        });

        it("never shows the card after the player cancelled the browser's window", async () => {
            const { app, win, storage } = setup({ env: env(CHROME) });
            win.fire("beforeinstallprompt", installEvent("dismissed").event);
            await app.install("menu");
            expect(storage.seen).toBe(true);
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(false);
        });

        it("does not bring the card back after a cancel from the menu when the card was waiting", async () => {
            const { app, win, quiet } = setup({ env: env(CHROME) });
            win.fire("beforeinstallprompt", installEvent("dismissed").event);
            app.noteConversationEnded();
            expect(get(app.cardVisibleStore)).toBe(true);
            // the player opens the menu instead of using the card
            quiet.set(false);
            await app.install("menu");
            quiet.set(true);
            expect(get(app.cardVisibleStore)).toBe(false);
        });

        it("uses the browser's window again when it offers a new one after a cancel", async () => {
            const { app, win } = setup({ env: env(CHROME) });
            win.fire("beforeinstallprompt", installEvent("dismissed").event);
            await app.install("menu");
            const second = installEvent("accepted");
            win.fire("beforeinstallprompt", second.event);
            await app.install("menu");
            expect(second.prompt).toHaveBeenCalledTimes(1);
            expect(get(app.guideOpenStore)).toBeUndefined();
            expect(get(app.installedToastStore)).toBe(true);
        });

        it("counts an app installed from the browser's own menu", () => {
            const { app, win, analytics } = setup({ env: env(CHROME) });
            win.fire("appinstalled");
            expect(analytics.installed).toHaveBeenCalledWith("browser");
            expect(get(app.canInstallStore)).toBe(false);
        });
    });

    describe("an app installed earlier in this browser", () => {
        it("brings the row back when the browser offers the install again (the app was removed)", () => {
            const { app, win } = setup({ env: env(CHROME), storage: memoryStorage(false, true) });
            win.fire("beforeinstallprompt", installEvent("accepted").event);
            // the browser offers the install again: the app was removed, so the row is back
            expect(get(app.canInstallStore)).toBe(true);
        });

        it("keeps the row hidden when the browser sends no install offer", () => {
            const { app } = setup({ env: env(CHROME), storage: memoryStorage(false, true) });
            expect(get(app.canInstallStore)).toBe(false);
        });

        it("forgets the old install when the browser offers it again, so a new one counts", () => {
            const storage = memoryStorage(false, true);
            const { win } = setup({ env: env(CHROME), storage });
            win.fire("beforeinstallprompt", installEvent("accepted").event);
            expect(storage.reported).toBe(false);
        });

        it("steps aside when the browser says the app is installed, with no toast and no count", async () => {
            const { app, analytics } = setup({ env: env(CHROME), installedApps: () => Promise.resolve([{}]) });
            await vi.advanceTimersByTimeAsync(0);
            expect(get(app.canInstallStore)).toBe(false);
            expect(get(app.installedToastStore)).toBe(false);
            expect(analytics.installed).not.toHaveBeenCalled();
        });

        it("stays when the browser lists no installed app, or cannot say", async () => {
            const none = setup({ env: env(CHROME), installedApps: () => Promise.resolve([]) });
            none.win.fire("beforeinstallprompt", installEvent("accepted").event);
            await vi.advanceTimersByTimeAsync(0);
            expect(get(none.app.canInstallStore)).toBe(true);
            const broken = setup({ env: env(CHROME), installedApps: () => Promise.reject(new Error("no")) });
            broken.win.fire("beforeinstallprompt", installEvent("accepted").event);
            await vi.advanceTimersByTimeAsync(0);
            expect(get(broken.app.canInstallStore)).toBe(true);
        });

        it("ignores a lookup that comes after the browser's own install offer", async () => {
            let answer: (apps: readonly unknown[]) => void = () => undefined;
            const { app, win } = setup({
                env: env(CHROME),
                installedApps: () =>
                    new Promise((resolve) => {
                        answer = resolve;
                    }),
            });
            win.fire("beforeinstallprompt", installEvent("accepted").event);
            answer([{}]);
            await vi.advanceTimersByTimeAsync(0);
            expect(get(app.canInstallStore)).toBe(true);
        });

        it("keeps the row on iPhone Safari, which cannot tell", () => {
            const { app } = setup({ storage: memoryStorage(false, true) });
            expect(get(app.canInstallStore)).toBe(true);
        });
    });

    describe("an app already installed", () => {
        it("counts a first launch, once, on the device that holds its own storage", () => {
            const storage = memoryStorage();
            const first = setup({ env: env(IPHONE_SAFARI, { navigatorStandalone: true }), storage });
            expect(first.analytics.installed).toHaveBeenCalledWith("app");
            const second = setup({ env: env(IPHONE_SAFARI, { navigatorStandalone: true }), storage });
            expect(second.analytics.installed).not.toHaveBeenCalled();
        });
    });
});
