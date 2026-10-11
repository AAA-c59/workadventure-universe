import { get } from "svelte/store";
import { gameManager } from "../../Phaser/Game/GameManager";
import type { UserProviderMerger } from "../UserProviderMerger/UserProviderMerger";
import type { ChatPeople } from "./ChatPeopleStore";
import { chatPeopleOf, worldKnowsWoka } from "./ChatPeopleStore";

/** Where the chat finds out about people: the current map's connection and user lists. */
function currentScene() {
    try {
        return gameManager.getCurrentGameScene();
    } catch {
        // No map yet (the chat opened before it loaded): there is no one to ask for.
        return undefined;
    }
}

/** The people the current map's connection has asked Orbit about, for the Woka and name stores to read. */
export function currentChatPeople(): ChatPeople | undefined {
    return chatPeopleOf(currentScene()?.connection);
}

/**
 * A direct chat with someone the world does not cover (not in it now, and no saved Woka in its member list): asks
 * Orbit, once, what they look like and are called. Their picture and name then reach the header, the chat list and the
 * Profile page through the same stores as everyone else's. Does nothing for anyone the world already covers.
 */
export function requestChatPerson(chatId: string | undefined): void {
    if (!chatId) return;
    const scene = currentScene();
    const people = chatPeopleOf(scene?.connection);
    if (!scene || !people) return;
    scene.userProviderMerger
        .then((merger: UserProviderMerger) => {
            if (!worldKnowsWoka(get(merger.usersByRoomStore), chatId)) people.request(chatId);
        })
        .catch((error: unknown) => console.warn("Could not look up a chat partner", error));
}
