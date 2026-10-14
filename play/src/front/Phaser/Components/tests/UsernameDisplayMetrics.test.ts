import { describe, expect, it } from "vitest";
import { getDisplayScale, getShownName } from "../UsernameDisplayMetrics";

describe("getDisplayScale", () => {
    it("keeps the base size at the default zoom", () => {
        // One game pixel is 1.25 screen pixels: the name is 12.5 px, under the 13 px limit.
        expect(getDisplayScale(1, 1.25)).toBe(1);
    });

    it("stops shrinking when zoomed far out", () => {
        // Past 65% zoom the name keeps its screen size: the scale grows to cancel the zoom.
        expect(getDisplayScale(0.65, 0.8)).toBe(1);
        expect(getDisplayScale(0.5, 0.625)).toBeCloseTo(1.3);
        expect(getDisplayScale(0.25, 0.3)).toBeCloseTo(2.6);
    });

    it("stops growing at 13 px on screen when zoomed in", () => {
        const fontSizeOnScreen = (zoomModifier: number, ancestorScale: number): number =>
            10 * getDisplayScale(zoomModifier, ancestorScale) * ancestorScale;
        expect(fontSizeOnScreen(2, 2.5)).toBeCloseTo(13);
        expect(fontSizeOnScreen(3, 4)).toBeCloseTo(13);
    });

    it("never goes above 13 px on screen at any zoom", () => {
        for (const zoom of [0.1, 0.3, 0.65, 1, 1.5, 2, 4]) {
            expect(10 * getDisplayScale(zoom, zoom * 1.25) * zoom * 1.25).toBeLessThanOrEqual(13 + 1e-9);
        }
    });

    it("falls back to upstream's rule while the layer has not been measured", () => {
        expect(getDisplayScale(0.5, 0)).toBeCloseTo(1.3);
        expect(getDisplayScale(2, 0)).toBe(1);
    });
});

describe("getShownName", () => {
    it("keeps names of up to 16 letters", () => {
        expect(getShownName("Khalid", false)).toBe("Khalid");
        expect(getShownName("Abcdefghijklmnop", false)).toBe("Abcdefghijklmnop");
    });

    it("cuts longer names to 15 letters and an ellipsis", () => {
        expect(getShownName("Juanma Gaviria Restrepo", false)).toBe("Juanma Gaviria…");
        expect(getShownName("Abcdefghijklmnopq", false)).toBe("Abcdefghijklmno…");
    });

    it("shows the whole name when highlighted", () => {
        expect(getShownName("Juanma Gaviria Restrepo", true)).toBe("Juanma Gaviria Restrepo");
    });

    it("never cuts an emoji in two", () => {
        const name = "😀".repeat(20);
        expect(getShownName(name, false)).toBe("😀".repeat(15) + "…");
    });
});
