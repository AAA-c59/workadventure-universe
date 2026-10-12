/**
 * Which way into "install the app" this browser has. Chrome, Edge and Android browsers install from their own
 * window, which only they can open (see InstallApp); Apple's browsers have no install button at all, so for them
 * the game shows a short guide that points at the right buttons.
 */

/** The guides, one per place the buttons are. */
export type InstallGuide =
    /** iPhone, Safari: Share is behind "⋯" since iOS 26 (and at the bottom before it). */
    | "iphone-safari"
    /** iPad, Safari: Share is at the top right. */
    | "ipad-safari"
    /** iPhone and iPad, Chrome: Share is at the top right. */
    | "ios-chrome"
    /** iPhone and iPad, inside Instagram, WhatsApp and the like, or in a browser other than Safari and Chrome: no way in, so open Safari. */
    | "open-in-safari"
    /** Mac, Safari 17 and later: File > Add to Dock. */
    | "mac-safari";

export interface InstallEnvironment {
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
    /** `(display-mode: standalone)` (or window-controls-overlay): the page runs as an installed app. Not fullscreen: F11 in a browser tab matches that too. */
    displayModeInstalled: boolean;
    /** Safari's own flag for a home screen app. */
    navigatorStandalone: boolean;
}

/** Whether the game already runs as an installed app. */
export function isInstalledApp(env: InstallEnvironment): boolean {
    return env.displayModeInstalled || env.navigatorStandalone;
}

// Browsers that wrap a page in their own window (Instagram, Facebook, WhatsApp, TikTok, Snapchat, ...).
const IN_APP_BROWSER =
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Bytedance|Twitter|LinkedInApp|Pinterest|GSA\/|Messenger|WhatsApp/i;

/** The guide to show in this browser, or undefined when it has none (the browser installs from its own window, or cannot install). */
export function installGuideFor(env: InstallEnvironment): InstallGuide | undefined {
    const ua = env.userAgent;
    // iPadOS 13 and later says it is a Mac, but a Mac has no touch screen.
    const isIpad = /iPad/.test(ua) || (env.platform === "MacIntel" && env.maxTouchPoints > 1);
    const isIphone = /iPhone|iPod/.test(ua);

    if (isIpad || isIphone) {
        if (IN_APP_BROWSER.test(ua)) return "open-in-safari";
        if (/CriOS/.test(ua)) return "ios-chrome";
        // Firefox, Edge, Opera and DuckDuckGo on iOS, and any web view that does not say it is Safari.
        if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua) || !/Safari\//.test(ua)) return "open-in-safari";
        return isIpad ? "ipad-safari" : "iphone-safari";
    }

    if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(ua)) {
        // "Add to Dock" came with Safari 17 (macOS Sonoma).
        const version = /Version\/(\d+)/.exec(ua);
        if (version !== null && Number(version[1]) >= 17) return "mac-safari";
    }

    return undefined;
}

/** The environment of the browser running the game. */
export function currentInstallEnvironment(): InstallEnvironment {
    const matches = (query: string): boolean => window.matchMedia?.(query).matches === true;
    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        displayModeInstalled:
            matches("(display-mode: standalone)") || matches("(display-mode: window-controls-overlay)"),
        navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    };
}
