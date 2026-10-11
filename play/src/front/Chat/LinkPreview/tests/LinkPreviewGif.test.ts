import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { get } from "svelte/store";

vi.mock("../../../Connection/ConnectionManager", () => ({
    connectionManager: { applications: [] },
}));
vi.mock("../../../Stores/CoWebsiteStore", () => ({ coWebsites: { add: vi.fn() } }));
vi.mock("../../../WebRtc/CoWebsite/SimpleCoWebsite", () => ({ SimpleCoWebsite: class {} }));
vi.mock("../LinkPreviewFetcher", async () => {
    const { writable } = await import("svelte/store");
    return {
        fetchWebPreview: vi.fn(() => new Promise<never>(() => {})),
        fetchYoutubePreview: vi.fn(() => new Promise<never>(() => {})),
        playingChatVideoStore: writable(undefined),
    };
});
vi.mock("../../../Stores/UserInputStore", async () => {
    const { writable } = await import("svelte/store");
    return { lightboxOpenStore: writable(false) };
});
vi.mock("../../Components/Room/MessageActions/availableActions", () => ({ saveMessageFiles: vi.fn() }));
vi.mock("../../../../i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const text = (value: string) => () => value;
    return {
        default: readable({
            chat: {
                linkPreview: {
                    openHere: text("Open here"),
                    newTab: text("New tab"),
                    play: text("Play"),
                    openOn: text("Open on"),
                },
                messageActions: { save: text("Save") },
            },
        }),
    };
});

import { lightboxOpenStore } from "../../../Stores/UserInputStore";
import LinkPreview from "../LinkPreview.svelte";

const GIF = "https://static.klipy.com/ii/abc/cat.gif";

describe("a picture in a chat message", () => {
    let target: HTMLElement;
    let preview: LinkPreview | undefined;

    beforeEach(() => {
        target = document.createElement("div");
        document.body.appendChild(target);
    });

    afterEach(() => {
        preview?.$destroy();
        preview = undefined;
        target.remove();
        // A viewer still fading out lives on the page itself.
        document.querySelectorAll("[data-lightbox]").forEach((viewer) => viewer.remove());
    });

    async function show(body: string): Promise<HTMLAnchorElement> {
        preview = new LinkPreview({ target, props: { body, alone: true } });
        await tick();
        const card = target.querySelector<HTMLAnchorElement>('[data-testid="imageLinkPreview"]');
        if (!card) throw new Error("no picture card");
        return card;
    }

    function click(card: HTMLElement): MouseEvent {
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        card.dispatchEvent(event);
        return event;
    }

    it("opens a GIF in the picture viewer, not a new tab", async () => {
        const card = await show(GIF);
        expect(document.querySelector("[data-lightbox]")).toBeNull();

        const event = click(card);
        await tick();

        expect(event.defaultPrevented).toBe(true);
        const viewer = document.querySelector("[data-lightbox]");
        expect(viewer?.querySelector("img")?.getAttribute("src")).toBe(GIF);
    });

    it("closes the viewer with Escape", async () => {
        click(await show(GIF));
        await tick();
        expect(get(lightboxOpenStore)).toBe(true);

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await tick();
        // The viewer fades out; it is closed once the game takes keys again.
        expect(get(lightboxOpenStore)).toBe(false);
    });

    it("keeps the game's keys off while a GIF is open and another one arrives or leaves", async () => {
        click(await show(GIF));
        await tick();

        const other = document.createElement("div");
        document.body.appendChild(other);
        const arriving = new LinkPreview({ target: other, props: { body: GIF, alone: true } });
        await tick();
        expect(get(lightboxOpenStore)).toBe(true);

        arriving.$destroy();
        other.remove();
        expect(get(lightboxOpenStore)).toBe(true);
    });

    it("keeps opening other picture links in a new tab", async () => {
        const card = await show("https://example.com/cat.png");
        const event = click(card);
        await tick();

        expect(event.defaultPrevented).toBe(false);
        expect(card.getAttribute("target")).toBe("_blank");
        expect(document.querySelector("[data-lightbox]")).toBeNull();
    });
});
