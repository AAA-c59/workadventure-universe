import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The tests run Svelte's server build, where onMount does nothing; the screens need the browser one
// eslint-disable-next-line svelte/no-svelte-internal
vi.mock("svelte", async () => await import("svelte/internal"));

const mocks = vi.hoisted(() => ({ fetchWokaMine: vi.fn() }));

vi.mock("../../../Phaser/Game/GameManager", () => ({
    gameManager: {
        currentMapRoom: { href: "http://play.test/@/u/w/r", backgroundColor: "#000000" },
        getCharacterTextureIds: () => ["teal"],
    },
}));
vi.mock("../../../Stores/JoinDesktopStore", async () => ({
    joinDesktopStore: (await import("svelte/store")).readable(false),
}));
vi.mock("../WokaData", () => ({
    wokaBodyPartOrder: ["body", "eyes", "hair", "clothes", "hat", "accessory", "woka"],
    fetchWokaData: () =>
        Promise.resolve({
            woka: {
                collections: [
                    {
                        name: "Everyday",
                        position: 0,
                        textures: [
                            { id: "teal", name: "Teal", url: "/teal.png", position: 0 },
                            { id: "plum", name: "Plum", url: "/plum.png", position: 1 },
                        ],
                    },
                ],
            },
        }),
    fetchWokaMine: mocks.fetchWokaMine,
    getWokaTextureUrl: (url: string) => url,
}));
vi.mock("../../../../i18n/i18n-svelte", async () => (await import("./i18nStub")).i18nStub);

import WokaSelectScene from "../WokaSelectScene.svelte";
import { settle, stubBrowser } from "./i18nStub";

/** A whole outfit: a body and a costume on top, as Orbit draws them. */
function outfit(id: string, current = false) {
    return {
        textures: [
            { id: `${id}-body`, url: `/${id}-body.png` },
            { id: `${id}-costume`, url: `/${id}-costume.png` },
        ],
        name: id,
        ...(current ? { current: true } : {}),
    };
}

describe("the Recent row in the WOKA picker", () => {
    let component: WokaSelectScene | undefined;
    let target: HTMLElement;
    const saveAndContinue = vi.fn();

    beforeEach(() => {
        stubBrowser();
        vi.clearAllMocks();
        target = document.createElement("div");
        document.body.appendChild(target);
    });

    afterEach(() => {
        component?.$destroy();
        component = undefined;
        target.remove();
    });

    async function open(recent: ReturnType<typeof outfit>[] | undefined) {
        mocks.fetchWokaMine.mockResolvedValue(recent === undefined ? undefined : { recent });
        component = new WokaSelectScene({ target, props: { customize: vi.fn(), saveAndContinue } });
        await settle();
    }

    const pills = () => Array.from(target.querySelectorAll<HTMLElement>("[role=tab]"));
    const recentTiles = () => Array.from(target.querySelectorAll<HTMLElement>("[id^=woka-recent-]"));

    it("is not there for a guest, or when the request failed: the picker is as it was", async () => {
        await open(undefined);

        expect(pills().some((pill) => pill.textContent?.includes("woka.selectWoka.recent"))).toBe(false);
        expect(recentTiles()).toHaveLength(0);
        // It opens on the WOKA you have
        expect(target.querySelector("#woka-teal")?.getAttribute("aria-checked")).toBe("true");
    });

    it("is not there when nothing was worn lately", async () => {
        await open([]);
        expect(pills().some((pill) => pill.textContent?.includes("woka.selectWoka.recent"))).toBe(false);
    });

    it("is the first pill, with its count, and opens on the WOKA you wear now", async () => {
        await open([outfit("teal", true), outfit("plum"), outfit("sky")]);

        expect(pills()[0].textContent).toContain("woka.selectWoka.recent");
        expect(pills()[0].textContent).toContain("3");
        expect(pills()[0].getAttribute("aria-selected")).toBe("true");
        expect(target.textContent).toContain("woka.selectWoka.recentLabel");
        expect(recentTiles().map((tile) => tile.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
        // "Now" is on the one you wear, and only on it
        expect(recentTiles()[0].textContent).toContain("woka.selectWoka.now");
        expect(recentTiles()[1].textContent).not.toContain("woka.selectWoka.now");
    });

    it("shows at most 4 tiles", async () => {
        await open([outfit("a", true), outfit("b"), outfit("c"), outfit("d"), outfit("e"), outfit("f")]);

        expect(recentTiles()).toHaveLength(4);
        expect(pills()[0].textContent).toContain("4");
    });

    it("Continue on a Recent tile saves the whole outfit, every layer", async () => {
        await open([outfit("teal", true), outfit("plum")]);

        recentTiles()[1].click();
        await settle();
        expect(recentTiles().map((tile) => tile.getAttribute("aria-checked"))).toEqual(["false", "true"]);
        target.querySelector<HTMLElement>(".selectCharacterSceneFormSubmit")?.click();

        expect(saveAndContinue).toHaveBeenCalledWith(["plum-body", "plum-costume"]);
    });

    it("Continue on the current Recent tile saves its ids too", async () => {
        await open([outfit("teal", true), outfit("plum")]);

        target.querySelector<HTMLElement>(".selectCharacterSceneFormSubmit")?.click();

        expect(saveAndContinue).toHaveBeenCalledWith(["teal-body", "teal-costume"]);
    });

    it("picking a tile of a collection afterwards saves just that tile", async () => {
        await open([outfit("teal", true)]);

        pills()[1].click();
        await settle();
        target.querySelector<HTMLElement>("#woka-plum")?.click();
        await settle();
        target.querySelector<HTMLElement>(".selectCharacterSceneFormSubmit")?.click();

        expect(saveAndContinue).toHaveBeenCalledWith(["plum"]);
    });
});
