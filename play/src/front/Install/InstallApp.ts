import type { Readable, Writable } from "svelte/store";
import { derived, get, writable } from "svelte/store";
import type { InstallEnvironment, InstallGuide } from "./InstallPlatform";
import { installGuideFor, isInstalledApp } from "./InstallPlatform";

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
}

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

    private readonly promptStore = writable<BeforeInstallPromptEvent | undefined>(undefined);
    private readonly installedStore: Writable<boolean>;
    private readonly firstMomentStore = writable(false);
    private readonly cardShownStore = writable(false);
    private firstMomentTimer: ReturnType<typeof setTimeout> | undefined;
    private toastTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly options: InstallAppOptions) {
        const { env, quiet, storage, analytics } = options;
        const installedHere = isInstalledApp(env);
        this.installedStore = writable(installedHere);
        this.guide = installedHere ? undefined : installGuideFor(env);

        // Chrome and Edge only say "installable" with their event; Apple's browsers are always installable by hand.
        this.canInstallStore = derived(
            [this.installedStore, this.promptStore],
            ([installed, prompt]) => !installed && (prompt !== undefined || this.guide !== undefined)
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
        if (installedHere && !storage.isInstallReported()) {
            storage.markInstallReported();
            analytics.installed("app");
        }
    }

    /**
     * Listens for the browser's install event. Called once, as early as possible: the event comes only once.
     * Returns what stops listening.
     */
    public start(target: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
        const onBeforeInstallPrompt = (event: Event) => {
            // The browser's own mini bar would come before our card: we choose the moment.
            event.preventDefault();
            this.promptStore.set(event as BeforeInstallPromptEvent);
        };
        const onAppInstalled = () => this.markInstalled("browser");
        target.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        target.addEventListener("appinstalled", onAppInstalled);
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
            } catch (error) {
                console.warn("The browser could not open its install window", error);
            }
            return;
        }
        if (this.guide !== undefined) {
            this.guideOpenStore.set(this.guide);
        }
    }

    public closeGuide(): void {
        this.guideOpenStore.set(undefined);
    }

    private markInstalled(source: InstallSource): void {
        if (get(this.installedStore)) return;
        this.installedStore.set(true);
        this.cardShownStore.set(false);
        this.guideOpenStore.set(undefined);
        this.options.storage.markInstallReported();
        this.options.analytics.installed(source);
        this.installedToastStore.set(true);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.installedToastStore.set(false), INSTALLED_TOAST_MS);
    }
}
