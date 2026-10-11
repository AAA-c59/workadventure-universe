import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { get } from "svelte/store";

vi.mock("../../../Enum/EnvironmentVariable", () => ({ KLIPY_API_KEY: "test-key" }));
vi.mock("../../../Stores/ChatStore", async () => {
    const { writable } = await import("svelte/store");
    return { chatInputFocusStore: writable(false) };
});
vi.mock("../../../../i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const text = (value: string) => () => value;
    return {
        default: readable({
            chat: {
                gifPicker: {
                    title: text("GIFs"),
                    back: text("Back"),
                    clearSearch: text("Clear search"),
                    searchPlaceholder: text("Search Klipy"),
                    trending: text("Trending GIFs"),
                    loadError: text("GIFs could not be loaded."),
                    retry: text("Try again"),
                    noResults: text("No GIFs found."),
                    send: ({ title }: { title: string }) => `Send GIF ${title}`,
                },
            },
        }),
    };
});

import { chatInputFocusStore } from "../../../Stores/ChatStore";
import GifPicker from "../GifPicker.svelte";
import type { GifItem, GifPage, KlipyClient } from "../KlipyClient";

function gif(id: string, width = 220, height = 165): GifItem {
    return {
        id,
        title: `gif ${id}`,
        previewUrl: `https://static.klipy.com/${id}-sm.webp`,
        previewWidth: width,
        previewHeight: height,
        url: `https://static.klipy.com/${id}-md.gif`,
    };
}

function fakeClient(overrides: Partial<KlipyClient> = {}): KlipyClient & {
    search: ReturnType<typeof vi.fn>;
    trending: ReturnType<typeof vi.fn>;
} {
    return {
        search: vi.fn().mockResolvedValue({ items: [gif("a"), gif("b")], hasNext: false } satisfies GifPage),
        trending: vi.fn().mockResolvedValue({ items: [gif("t")], hasNext: false } satisfies GifPage),
        categories: vi.fn().mockResolvedValue([]),
        ...overrides,
    } as never;
}

async function settle() {
    // Each answer takes a few turns to reach the screen.
    await Promise.resolve();
    await tick();
    await Promise.resolve();
    await tick();
    await Promise.resolve();
    await tick();
    await Promise.resolve();
    await tick();
}

describe("GifPicker", () => {
    let target: HTMLElement;
    let picker: GifPicker | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
        target = document.createElement("div");
        document.body.appendChild(target);
    });

    afterEach(() => {
        picker?.$destroy();
        picker = undefined;
        target.remove();
        vi.useRealTimers();
    });

    function mount(client: KlipyClient, onPick = vi.fn()) {
        picker = new GifPicker({ target, props: { client, onPick, onClose: vi.fn() } });
        return onPick;
    }

    function input(): HTMLInputElement {
        const found = target.querySelector<HTMLInputElement>('[data-testid="gifPickerSearch"]');
        if (!found) throw new Error("no search box");
        return found;
    }

    function type(text: string) {
        input().value = text;
        input().dispatchEvent(new Event("input", { bubbles: true }));
    }

    it("starts on tiles, with the search box saying Klipy", () => {
        mount(fakeClient());
        expect(input().placeholder).toBe("Search Klipy");
        expect(target.querySelector('[data-testid="gifPickerTrending"]')).not.toBeNull();
        expect(target.querySelectorAll('[data-testid="gifPickerItem"]')).toHaveLength(0);
        expect(target.querySelector('[data-testid="gifPickerBack"]')).toBeNull();
    });

    it("searches once typing pauses, and shows the results in two columns", async () => {
        const client = fakeClient();
        mount(client);
        type("h");
        type("hello");
        expect(client.search).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(350);
        await settle();
        expect(client.search).toHaveBeenCalledTimes(1);
        expect(client.search.mock.calls[0][0]).toBe("hello");
        expect(client.search.mock.calls[0][1]).toBe(1);
        expect(target.querySelectorAll(".column")).toHaveLength(2);
        expect(target.querySelectorAll('[data-testid="gifPickerItem"]')).toHaveLength(2);
        expect(target.querySelector('[data-testid="gifPickerBack"]')).not.toBeNull();
    });

    it("sends the link of the GIF that is tapped", async () => {
        const client = fakeClient();
        const onPick = mount(client);
        type("hello");
        await vi.advanceTimersByTimeAsync(350);
        await settle();
        target.querySelectorAll<HTMLButtonElement>('[data-testid="gifPickerItem"]')[1].click();
        expect(onPick).toHaveBeenCalledWith("https://static.klipy.com/b-md.gif");
    });

    it("shows the trending GIFs from its tile and goes back to the tiles", async () => {
        const client = fakeClient();
        mount(client);
        target.querySelector<HTMLButtonElement>('[data-testid="gifPickerTrending"]')?.click();
        await settle();
        expect(client.trending).toHaveBeenCalledTimes(1);
        expect(target.querySelectorAll('[data-testid="gifPickerItem"]')).toHaveLength(1);
        target.querySelector<HTMLButtonElement>('[data-testid="gifPickerBack"]')?.click();
        await settle();
        expect(target.querySelector('[data-testid="gifPickerTrending"]')).not.toBeNull();
        expect(input().value).toBe("");
    });

    it("says so when nothing is found", async () => {
        const client = fakeClient({ search: vi.fn().mockResolvedValue({ items: [], hasNext: false }) });
        mount(client);
        type("zzzz");
        await vi.advanceTimersByTimeAsync(350);
        await settle();
        expect(target.querySelector('[data-testid="gifPickerEmpty"]')?.textContent).toContain("No GIFs found.");
    });

    it("shows an error with a way to try again", async () => {
        const search = vi
            .fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValue({ items: [gif("a")], hasNext: false });
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        mount(fakeClient({ search }));
        type("hello");
        await vi.advanceTimersByTimeAsync(350);
        await settle();
        expect(target.querySelector('[data-testid="gifPickerError"]')).not.toBeNull();
        target.querySelector<HTMLButtonElement>('[data-testid="gifPickerError"] button')?.click();
        await settle();
        expect(search).toHaveBeenCalledTimes(2);
        expect(target.querySelectorAll('[data-testid="gifPickerItem"]')).toHaveLength(1);
        expect(target.querySelector('[data-testid="gifPickerError"]')).toBeNull();
    });

    it("keeps only the answer to the latest search", async () => {
        let resolveFirst: (page: GifPage) => void = () => undefined;
        const search = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<GifPage>((resolve) => {
                        resolveFirst = resolve;
                    })
            )
            .mockResolvedValue({ items: [gif("new")], hasNext: false });
        mount(fakeClient({ search }));
        type("one");
        await vi.advanceTimersByTimeAsync(350);
        type("two");
        await vi.advanceTimersByTimeAsync(350);
        await settle();
        resolveFirst({ items: [gif("old")], hasNext: false });
        await settle();
        const labels = [...target.querySelectorAll('[data-testid="gifPickerItem"]')].map((item) =>
            item.getAttribute("aria-label")
        );
        expect(labels).toEqual(["Send GIF gif new"]);
    });

    it("turns the game's keys off while its search box is focused, and back on when it closes", () => {
        mount(fakeClient());
        input().dispatchEvent(new FocusEvent("focus"));
        expect(get(chatInputFocusStore)).toBe(true);
        picker?.$destroy();
        picker = undefined;
        expect(get(chatInputFocusStore)).toBe(false);
    });

    it("leaves the keys as they are when the message box took the focus (a sent GIF)", () => {
        mount(fakeClient());
        input().dispatchEvent(new FocusEvent("focus"));
        input().dispatchEvent(new FocusEvent("blur"));
        // The message box is focused next, and turns the keys off.
        chatInputFocusStore.set(true);
        picker?.$destroy();
        picker = undefined;
        expect(get(chatInputFocusStore)).toBe(true);
    });
});
