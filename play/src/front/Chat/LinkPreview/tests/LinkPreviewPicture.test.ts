import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { get } from "svelte/store";
import { Marked } from "marked";

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
import { sanitizeHTML } from "../../Components/Room/Message/WA-HTML-Sanitizer";
import LinkPreview from "../LinkPreview.svelte";

const GIF = "https://static.klipy.com/ii/abc/cat.gif";
const PICTURE = "https://example.com/cat.png";

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

    async function show(body: string, alone = true): Promise<HTMLAnchorElement> {
        preview = new LinkPreview({ target, props: { body, alone } });
        await tick();
        const card = target.querySelector<HTMLAnchorElement>('[data-testid="imageLinkPreview"]');
        if (!card) throw new Error("no picture card");
        return card;
    }

    function click(element: HTMLElement): MouseEvent {
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event;
    }

    function shownInViewer(): string | null | undefined {
        return document.querySelector("[data-lightbox]")?.querySelector("img")?.getAttribute("src");
    }

    it("opens a GIF in the picture viewer, not a new tab", async () => {
        const card = await show(GIF);
        expect(document.querySelector("[data-lightbox]")).toBeNull();

        const event = click(card);
        await tick();

        expect(event.defaultPrevented).toBe(true);
        expect(shownInViewer()).toBe(GIF);
    });

    it("opens any other picture link in the picture viewer too", async () => {
        const event = click(await show(`look at this ${PICTURE}`, false));
        await tick();

        expect(event.defaultPrevented).toBe(true);
        expect(shownInViewer()).toBe(PICTURE);
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

    it("keeps the game's keys off while a picture is open and another one arrives or leaves", async () => {
        click(await show(GIF));
        await tick();

        const other = document.createElement("div");
        document.body.appendChild(other);
        const arriving = new LinkPreview({ target: other, props: { body: PICTURE, alone: true } });
        await tick();
        expect(get(lightboxOpenStore)).toBe(true);

        arriving.$destroy();
        other.remove();
        expect(get(lightboxOpenStore)).toBe(true);
    });

    it("keeps a picture that didn't load as a plain link", async () => {
        const card = await show(GIF);
        card.querySelector("img")?.dispatchEvent(new Event("error"));
        await tick();

        const fallback = target.querySelector<HTMLAnchorElement>(".link-preview-fallback");
        expect(fallback?.getAttribute("target")).toBe("_blank");
        if (!fallback) throw new Error("no fallback link");
        expect(click(fallback).defaultPrevented).toBe(false);
        await tick();
        expect(document.querySelector("[data-lightbox]")).toBeNull();
    });

    it("keeps the picture's link in the message text a link to a new tab", () => {
        // The message text is drawn by MessageText (markdown, then this cleaner), outside the card: its links are
        // plain links to a new tab, so clicking the address itself still opens it.
        const html = sanitizeHTML(new Marked().parse(`look at this ${PICTURE}`) as string);
        target.innerHTML = html;

        const link = target.querySelector<HTMLAnchorElement>("a");
        expect(link?.getAttribute("href")).toBe(PICTURE);
        expect(link?.getAttribute("target")).toBe("_blank");
        if (!link) throw new Error("no link");
        expect(click(link).defaultPrevented).toBe(false);
    });
});
