import type { Readable, Writable } from "svelte/store";
import { derived, get, writable } from "svelte/store";
import type { InstallEnvironment, InstallGuide } from "./InstallPlatform";
import { browserMenuGuideFor, installGuideFor, isInstalledApp } from "./InstallPlatform";

/** After this long in a room, with no conversation yet, the card may show. */
export const FIRST_MOMENT_MS = 3 * 60 * 1000;
/** How long "Universe is on your home screen" stays. */
export const INSTALLED_TOAST_MS = 4000;

/** Where the player asked to install from. "browser" is an install made from the browser's own menu. */
export type InstallSource = "card" | "menu" | "browser" | "app";

/** Chrome, Edge and the Android browsers hand the game this to open their own install window. */
export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallStorage {
    /** The card was shown (or dismissed) once: it never shows again. */
    isCardSeen(): boolean;
    markCardSeen(): void;
    /** The install was already counted on this device. */
    isInstallReported(): boolean;
    markInstallReported(): void;
    /** Forget that the app was installed (the browser offers the install again, so it is gone). */
    clearInstallReported(): void;
}

/** What navigator.getInstalledRelatedApps gives: the apps of our own manifest that are installed. */
export type InstalledAppsLookup = () => Promise<readonly unknown[]>;

export interface InstallAnalytics {
    cardShown(): void;
    cardDismissed(): void;
    installed(source: InstallSource): void;
}

export interface InstallAppOptions {
    env: InstallEnvironment;
    /**
     * True while nothing else has the player's attention: no conversation, call, chat, broadcast, map editor or open
     * menu. The card shows only then.
     */
    quiet: Readable<boolean>;
    storage: InstallStorage;
    analytics: InstallAnalytics;
}

/**
 * Installing Universe as an app, from the first moment to the home screen.
 *
 * Nothing here ever blocks the way into the room: the card is a small note that shows once, the menu row is always
 * there until the app is installed, and everything is gone inside the installed app.
 */
export class InstallApp {
    /** The guide this browser needs (iPhone, iPad, Mac Safari), if any. */
    public readonly guide: InstallGuide | undefined;
    /** The guide that is open, or undefined. */
    public readonly guideOpenStore = writable<InstallGuide | undefined>(undefined);
    /** "Universe is on your home screen" is showing. */
    public readonly installedToastStore = writable(false);
    /** The "Install app" row of the profile menu shows, and installing is possible from here. */
    public readonly canInstallStore: Readable<boolean>;
    /** The one-time card is on screen. */
    public readonly cardVisibleStore: Readable<boolean>;

    private readonly installedHere: boolean;
    /** The browser's install window was opened and cancelled: it cannot open twice, so the row points at the browser's menu. */
    private readonly promptSpentStore = writable(false);
    private readonly promptStore = writable<BeforeInstallPromptEvent | undefined>(undefined);
    private readonly installedStore: Writable<boolean>;
    private readonly firstMomentStore = writable(false);
    private readonly cardShownStore = writable(false);
    private firstMomentTimer: ReturnType<typeof setTimeout> | undefined;
    private toastTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly options: InstallAppOptions) {
        const { env, quiet, storage, analytics } = options;
        this.installedHere = isInstalledApp(env);
        this.guide = this.installedHere ? undefined : installGuideFor(env);
        // Chrome, Edge and Android remember an install made from here. Apple's browsers cannot tell (no event, and
        // the Home Screen app keeps its own storage), so for them the row stays.
        const installedBefore = this.guide === undefined && storage.isInstallReported();
        this.installedStore = writable(this.installedHere || installedBefore);

        // Chrome and Edge only say "installable" with their event; Apple's browsers are always installable by hand.
        this.canInstallStore = derived(
            [this.installedStore, this.promptStore, this.promptSpentStore],
            ([installed, prompt, spent]) => !installed && (prompt !== undefined || spent || this.guide !== undefined)
        );

        const ready = derived(
            [this.canInstallStore, this.firstMomentStore, quiet],
            ([canInstall, firstMoment, isQuiet]) => canInstall && firstMoment && isQuiet
        );
        // Shown once, ever: counted and remembered the moment it shows, so a reload never brings it back.
        // The subscription lives as long as the game does.
        // eslint-disable-next-line svelte/no-ignored-unsubscribe
        ready.subscribe((isReady) => {
            if (isReady && !get(this.cardShownStore) && !storage.isCardSeen()) {
                storage.markCardSeen();
                this.cardShownStore.set(true);
                analytics.cardShown();
            }
        });
        // It waits out a call, the chat or a menu, and comes back when they end.
        this.cardVisibleStore = derived(
            [this.cardShownStore, this.canInstallStore, quiet],
            ([shown, canInstall, isQuiet]) => shown && canInstall && isQuiet
        );

        // An app already installed and opened here is counted once, on the device that holds its own storage (iPhone).
        if (this.installedHere && !storage.isInstallReported()) {
            storage.markInstallReported();
            analytics.installed("app");
        }
    }

    /**
     * Listens for the browser's install event. Called once, as early as possible: the event comes only once.
     * Returns what stops listening.
     */
    public start(
        target: Pick<Window, "addEventListener" | "removeEventListener">,
        installedApps?: InstalledAppsLookup
    ): () => void {
        const onBeforeInstallPrompt = (event: Event) => {
            // The browser's own mini bar would come before our card: we choose the moment.
            event.preventDefault();
            this.promptStore.set(event as BeforeInstallPromptEvent);
            this.promptSpentStore.set(false);
            // The browser only offers the install when the app is not installed: if it was removed, the row is back.
            if (!this.installedHere && get(this.installedStore)) {
                this.options.storage.clearInstallReported();
                this.installedStore.set(false);
            }
        };
        const onAppInstalled = () => this.markInstalled("browser");
        target.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        target.addEventListener("appinstalled", onAppInstalled);
        // Installed earlier (from another tab, or before this device remembered it): the browser knows, if it can say.
        // Best effort: where it cannot, the row simply stays until the first install here.
        if (installedApps !== undefined && this.guide === undefined) {
            installedApps()
                .then((apps) => {
                    if (apps.length > 0 && get(this.promptStore) === undefined) this.markAlreadyInstalled();
                })
                .catch(() => undefined);
        }
        return () => {
            target.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            target.removeEventListener("appinstalled", onAppInstalled);
        };
    }

    /** The player is in a room. After a few minutes there, the card may show even with no conversation. */
    public noteInRoom(): void {
        if (get(this.firstMomentStore) || this.firstMomentTimer !== undefined) return;
        if (get(this.installedStore) || this.options.storage.isCardSeen()) return;
        this.firstMomentTimer = setTimeout(() => this.firstMomentStore.set(true), FIRST_MOMENT_MS);
    }

    /** A conversation just ended: a good moment for the card. */
    public noteConversationEnded(): void {
        clearTimeout(this.firstMomentTimer);
        this.firstMomentStore.set(true);
    }

    /** The ✕ of the card: never again. (It was remembered when it showed.) */
    public dismissCard(): void {
        if (!get(this.cardShownStore)) return;
        this.cardShownStore.set(false);
        this.options.analytics.cardDismissed();
    }

    /** Install, from the card or the menu: the browser's own window where there is one, else the guide. */
    public async install(source: Extract<InstallSource, "card" | "menu">): Promise<void> {
        if (source === "card") this.cardShownStore.set(false);
        const prompt = get(this.promptStore);
        if (prompt !== undefined) {
            // The event opens the window once; the browser sends a new one if it offers again.
            this.promptStore.set(undefined);
            try {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                if (choice.outcome === "accepted") this.markInstalled(source);
                // Cancelled: the window cannot open again, so the row stays and points at the browser's own menu.
                else this.markPromptSpent();
            } catch (error) {
                console.warn("The browser could not open its install window", error);
                this.markPromptSpent();
            }
            return;
        }
        if (this.guide !== undefined) {
            this.guideOpenStore.set(this.guide);
        } else if (get(this.promptSpentStore)) {
            this.guideOpenStore.set(browserMenuGuideFor(this.options.env));
        }
    }

    public closeGuide(): void {
        this.guideOpenStore.set(undefined);
    }

    /** The player has seen the browser's own window, so the card never offers it again either. */
    private markPromptSpent(): void {
        this.promptSpentStore.set(true);
        this.options.storage.markCardSeen();
    }

    /** The app is installed already: step aside, with no toast and no new count. */
    private markAlreadyInstalled(): void {
        this.installedStore.set(true);
        this.cardShownStore.set(false);
        this.options.storage.markInstallReported();
    }

    private markInstalled(source: InstallSource): void {
        if (get(this.installedStore)) return;
        this.installedStore.set(true);
        this.cardShownStore.set(false);
        this.guideOpenStore.set(undefined);
        this.promptSpentStore.set(false);
        this.options.storage.markInstallReported();
        this.options.analytics.installed(source);
        this.installedToastStore.set(true);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.installedToastStore.set(false), INSTALLED_TOAST_MS);
    }
}
