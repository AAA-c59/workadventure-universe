import type { GifCategory } from "./KlipyClient";

/** The index of the column to put the next picture in: the shortest one, the left one when they are level. */
export function shortestColumn(heights: number[]): number {
    let shortest = 0;
    for (let index = 1; index < heights.length; index++) {
        if (heights[index] < heights[shortest]) shortest = index;
    }
    return shortest;
}

const FALLBACK_TERMS = ["hello", "lol", "thanks", "yes", "no", "wow", "love", "sad", "bye", "hug"];

/** The first screen's tiles until Klipy sends its own (or when it can't). */
export function fallbackCategories(): GifCategory[] {
    return FALLBACK_TERMS.map((term) => ({ name: term, query: term }));
}
