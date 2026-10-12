import { get, writable } from "svelte/store";
import { selectCharacterSceneVisibleStore } from "./SelectCharacterStore";

/** What the world refused: the player's WOKA or their companion. */
export type RefusedKind = "woka" | "companion";

/** Set while the "can't be worn here" popup is on screen. */
export const wokaRefusedStore = writable<RefusedKind | undefined>(undefined);

/**
 * Set while the WOKA or companion picker was opened from that popup. Its close button leads back to the popup, because
 * there is no room to go back to yet (the join was refused).
 */
export const refusedPickerStore = writable<RefusedKind | undefined>(undefined);

/** The join was refused for the WOKA or companion: ask the player what to wear instead of picking for them. */
export function showWokaRefused(kind: RefusedKind): void {
    selectCharacterSceneVisibleStore.set(false);
    refusedPickerStore.set(undefined);
    wokaRefusedStore.set(kind);
}

/** Whether the popup is waiting on the player (the join screens then stay out of its way). */
export function isWokaRefusedShown(): boolean {
    return get(wokaRefusedStore) !== undefined;
}
