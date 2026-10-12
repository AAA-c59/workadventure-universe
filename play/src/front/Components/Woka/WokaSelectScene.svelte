<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import type { WokaMine } from "@workadventure/messages";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { joinDesktopStore } from "../../Stores/JoinDesktopStore";
    import type { WokaCollection, WokaData, WokaTexture } from "./WokaTypes";
    import WokaImage from "./WokaImage.svelte";
    import WokaCard from "./WokaCard.svelte";
    import { fetchWokaData, fetchWokaMine, getWokaTextureUrl } from "./WokaData";
    import { IconCheck, IconHistory, IconPencil } from "@wa-icons";

    export let customize: () => void;
    export let saveAndContinue: (texturesId: string[]) => void;
    export let close: (() => void) | undefined = undefined;
    /** Why the last Continue did not save, shown above the buttons */
    export let saveError = "";

    /** At most this many Recent tiles, in one row (Orbit already caps, filters and orders them) */
    const maxRecent = 4;

    let wokaData: WokaData | null = null;
    // The pill on screen: Recent first when there is one, then the collections
    let category = 0;
    let selectedId = "";
    // A Recent tile is a whole outfit (several layers): the one picked, or null when a catalog tile is
    let recent: WokaMine["recent"] = [];
    let selectedRecent: number | null = null;
    let isLoading = true;
    let error = "";
    let direction = 0;

    $: tileSize = $joinDesktopStore ? 64 : 52;

    $: hasRecent = recent.length > 0;
    $: categoryOffset = hasRecent ? 1 : 0;
    $: collections = wokaData?.woka?.collections ?? [];
    // -1 on the Recent pill
    $: collectionIndex = category - categoryOffset;
    $: textures = collections[collectionIndex]?.textures ?? [];
    $: categories = [
        ...(hasRecent ? [{ label: $LL.woka.selectWoka.recent(), count: recent.length, icon: IconHistory }] : []),
        ...collections.map((collection) => ({ label: collection.name, count: collection.textures.length })),
    ];
    $: selectedTextures = { woka: selectedId };
    $: previewLayers =
        selectedRecent !== null ? recent[selectedRecent]?.textures.map((texture) => texture.url) ?? null : null;

    async function loadWokaData() {
        isLoading = true;
        error = "";
        try {
            // What you wore lately is asked each time the picker opens (it changes with every pick); a failure just
            // leaves Recent out
            const [data, mine] = await Promise.all([fetchWokaData(), fetchWokaMine()]);
            wokaData = data;
            recent = (mine?.recent ?? []).filter((outfit) => outfit.textures.length > 0).slice(0, maxRecent);
            loadSavedTexture();
        } catch (err) {
            console.error("Error loading Woka data:", err);
            error = $LL.woka.selectWoka.loadError();
        } finally {
            isLoading = false;
        }
        await tick();
        document
            .getElementById(selectedRecent !== null ? `woka-recent-${selectedRecent}` : `woka-${selectedId}`)
            ?.scrollIntoView({ block: "nearest" });
    }

    function findTexture(
        list: WokaCollection[],
        id: string | undefined
    ): { collectionIndex: number; texture: WokaTexture } | undefined {
        if (!id) return undefined;
        for (const [index, collection] of list.entries()) {
            const texture = collection.textures.find((t) => t.id === id);
            if (texture) return { collectionIndex: index, texture };
        }
        return undefined;
    }

    // Opens on the WOKA you have, or the first one. With a Recent row, it opens there on the one you wear now.
    function loadSavedTexture() {
        const list = wokaData?.woka?.collections ?? [];
        const now = recent.findIndex((outfit) => outfit.current);
        if (now !== -1) {
            category = 0;
            selectedRecent = now;
            selectedId = "";
            return;
        }
        const offset = recent.length > 0 ? 1 : 0;
        const saved = findTexture(list, gameManager.getCharacterTextureIds()?.[0]);
        category = (saved?.collectionIndex ?? 0) + offset;
        selectedRecent = null;
        selectedId = saved?.texture.id ?? list[0]?.textures[0]?.id ?? "";
    }

    function select(id: string) {
        selectedId = id;
        selectedRecent = null;
        document.getElementById(`woka-${id}`)?.scrollIntoView({ block: "nearest" });
    }

    function selectRecent(index: number) {
        selectedRecent = index;
        document.getElementById(`woka-recent-${index}`)?.scrollIntoView({ block: "nearest" });
    }

    // Randomize picks from every collection and shows the one it landed in
    async function randomize() {
        const all = collections.flatMap((collection, index) => collection.textures.map((t) => ({ index, t })));
        if (all.length === 0) return;
        const pick = all[Math.floor(Math.random() * all.length)];
        // Through the card, so the collection's pill scrolls into view too
        if (card) await card.selectCategory(pick.index + categoryOffset);
        else category = pick.index + categoryOffset;
        await tick();
        select(pick.t.id);
    }

    let card: WokaCard | undefined;

    function columns(): number {
        const grid = document.getElementById("woka-grid");
        if (!grid) return 1;
        return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    }

    function save() {
        // A Recent tile is a whole outfit: Continue saves exactly its texture ids
        const outfit = selectedRecent !== null ? recent[selectedRecent] : undefined;
        if (outfit) saveAndContinue(outfit.textures.map((texture) => texture.id));
        else if (selectedId) saveAndContinue([selectedId]);
    }

    let enterPressed = false;

    function onKeyDown(event: KeyboardEvent) {
        if (!wokaData || event.target instanceof HTMLInputElement) return;
        const onRecent = collectionIndex < 0;
        const count = onRecent ? recent.length : textures.length;
        const index = onRecent ? selectedRecent ?? -1 : textures.findIndex((t) => t.id === selectedId);
        let next = index;
        if (event.key === "ArrowLeft") next = Math.max(index - 1, 0);
        else if (event.key === "ArrowRight") next = Math.min(index + 1, count - 1);
        else if (event.key === "ArrowUp") next = Math.max(index - columns(), 0);
        else if (event.key === "ArrowDown") next = Math.min(index + columns(), count - 1);
        else if (event.key === "Enter") {
            // A focused button (Randomize, Build, Save…) does its own job on Enter; tiles let Enter save
            if (event.target instanceof HTMLButtonElement && event.target.getAttribute("role") !== "radio") return;
            enterPressed = true;
            return;
        } else return;
        event.preventDefault();
        if (next === index) return;
        if (onRecent) {
            if (recent[next]) selectRecent(next);
        } else if (textures[next]) select(textures[next].id);
    }

    function onKeyUp(event: KeyboardEvent) {
        // On key up, so the Enter that saves does not reach the next screen
        if (event.key === "Enter" && enterPressed) {
            enterPressed = false;
            save();
        }
    }

    onMount(() => {
        loadWokaData().catch((err) => console.error(err));
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
    });

    onDestroy(() => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
    });
</script>

<WokaCard
    bind:this={card}
    eyebrow={$LL.woka.selectWoka.eyebrow()}
    title={$LL.woka.selectWoka.heading()}
    {selectedTextures}
    {previewLayers}
    {saveError}
    {wokaData}
    {isLoading}
    {error}
    retry={loadWokaData}
    {randomize}
    {close}
    {categories}
    bind:category
    swipeHint={$LL.woka.selectWoka.swipeHint()}
    bind:direction
>
    <svelte:fragment slot="hint">
        <span class="u-join-kbd">←</span>
        <span class="u-join-kbd">→</span>
        {$LL.woka.selectWoka.browse()} ·
        <span class="u-join-kbd">Enter</span>
        {$LL.woka.selectWoka.save()}
    </svelte:fragment>

    <!-- The card also draws the collections on either side, ready to slide in: only the one on screen has the ids -->
    <div
        slot="tiles"
        let:index
        let:active
        id={active ? "woka-grid" : undefined}
        class="grid grid-cols-4 md:grid-cols-6 gap-2 p-1"
        role="radiogroup"
        aria-label={$LL.woka.selectWoka.heading()}
    >
        {#if hasRecent && index === 0}
            <p class="woka-recent-label">{$LL.woka.selectWoka.recentLabel()}</p>
            {#each recent as outfit, outfitIndex (outfitIndex)}
                <button
                    type="button"
                    role="radio"
                    id={active ? `woka-recent-${outfitIndex}` : undefined}
                    class="u-join-tile"
                    aria-checked={selectedRecent === outfitIndex}
                    aria-label={outfit.name ?? $LL.woka.refused.yourWoka()}
                    on:click={() => selectRecent(outfitIndex)}
                >
                    <WokaImage
                        selectedTextures={{}}
                        layers={outfit.textures.map((texture) => texture.url)}
                        getTextureUrl={getWokaTextureUrl}
                        canvasSize={tileSize}
                        {direction}
                    />
                    {#if outfit.current}
                        <span class="woka-now">{$LL.woka.selectWoka.now()}</span>
                    {/if}
                    {#if selectedRecent === outfitIndex}
                        <span class="u-join-tile-check"><IconCheck font-size="12" /></span>
                    {/if}
                </button>
            {/each}
        {:else}
            {#each collections[index - categoryOffset]?.textures ?? [] as texture (texture.id)}
                <button
                    type="button"
                    role="radio"
                    id={active ? `woka-${texture.id}` : undefined}
                    class="u-join-tile"
                    aria-checked={selectedRecent === null && selectedId === texture.id}
                    aria-label={texture.name}
                    on:click={() => select(texture.id)}
                >
                    <WokaImage
                        selectedTextures={{ woka: texture.id }}
                        {wokaData}
                        getTextureUrl={getWokaTextureUrl}
                        canvasSize={tileSize}
                        {direction}
                    />
                    {#if selectedRecent === null && selectedId === texture.id}
                        <span class="u-join-tile-check"><IconCheck font-size="12" /></span>
                    {/if}
                </button>
            {/each}
        {/if}
    </div>

    <svelte:fragment slot="footer">
        <button type="button" class="u-join-btn u-cta-secondary wokaBuildButton !px-3 md:!px-5" on:click={customize}>
            <IconPencil font-size="16" />
            <span class="md:hidden">{$LL.woka.selectWoka.build()}</span>
            <span class="hidden md:inline">{$LL.woka.selectWoka.customize()}</span>
        </button>
        <button
            type="button"
            class="u-join-btn u-cta md:min-w-[180px] selectCharacterSceneFormSubmit"
            disabled={!selectedId && selectedRecent === null}
            on:click={save}
        >
            {$LL.woka.selectWoka.continue()}
        </button>
    </svelte:fragment>
</WokaCard>

<style>
    .woka-recent-label {
        grid-column: 1 / -1;
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.5);
    }
    /* "Now": marks the WOKA you wear at the bottom of its tile */
    .woka-now {
        position: absolute;
        left: 50%;
        bottom: 4px;
        transform: translateX(-50%);
        padding: 0 7px;
        border-radius: 9999px;
        background: rgba(10, 8, 20, 0.8);
        font-size: 10px;
        font-weight: 700;
        color: #c4b5fd;
    }
</style>
