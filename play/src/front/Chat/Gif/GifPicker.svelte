<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { clickOutside } from "svelte-outside";
    import LL from "../../../i18n/i18n-svelte";
    import { KLIPY_API_KEY } from "../../Enum/EnvironmentVariable";
    import { chatInputFocusStore } from "../../Stores/ChatStore";
    import { createKlipyClient } from "./KlipyClient";
    import type { GifCategory, GifItem, KlipyClient } from "./KlipyClient";
    import { fallbackCategories, shortestColumn } from "./GifLayout";
    import { IconArrowLeft, IconSearch, IconTrendingUp, IconX } from "@wa-icons";

    /** Called with the link of the GIF the player tapped. */
    export let onPick: (url: string) => void;
    /** Called when the picker should close: Escape, or a click outside it. */
    export let onClose: (event?: Event) => void = () => {};
    /** Lets the tests give another Klipy. */
    export let client: KlipyClient | undefined = undefined;

    const klipy: KlipyClient | undefined = client ?? (KLIPY_API_KEY ? createKlipyClient(KLIPY_API_KEY) : undefined);

    // The tiles of the first screen are the same every time the picker opens in a session.
    let categories: GifCategory[] = fallbackCategories();
    let query = "";
    // What the list on screen is for: the search it answers, or "" for the trending GIFs.
    let shownFor: string | undefined = undefined;
    let view: "home" | "results" = "home";
    let columns: GifItem[][] = [[], []];
    let columnHeights = [0, 0];
    let page = 1;
    let hasNext = false;
    let loading = false;
    let failed = false;
    // The page that came back with an error: "Try again" asks for it again.
    let failedPage = 1;
    let empty = false;
    let scroller: HTMLDivElement;
    let searchInput: HTMLInputElement;
    // Whether this search box is what turned the game's keys off: only then is it for the picker to turn them on.
    let searchFocused = false;
    let abort: AbortController | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    // A new request makes the one before it stale, whatever order they answer in.
    let requestCounter = 0;

    function reset() {
        columns = [[], []];
        columnHeights = [0, 0];
        page = 1;
        hasNext = false;
        failed = false;
        empty = false;
    }

    function addItems(items: GifItem[]) {
        const known = new Set(columns.flat().map((item) => item.id));
        for (const item of items) {
            if (known.has(item.id)) continue;
            known.add(item.id);
            const column = shortestColumn(columnHeights);
            columns[column] = [...columns[column], item];
            // Its height when it is as wide as the column.
            columnHeights[column] += item.previewHeight / item.previewWidth;
        }
        columns = columns;
        columnHeights = columnHeights;
    }

    async function load(forQuery: string, nextPage: number) {
        if (!klipy) return;
        abort?.abort();
        abort = new AbortController();
        const request = ++requestCounter;
        loading = true;
        failed = false;
        try {
            const result =
                forQuery === ""
                    ? await klipy.trending(nextPage, abort.signal)
                    : await klipy.search(forQuery, nextPage, abort.signal);
            if (request !== requestCounter) return;
            addItems(result.items);
            hasNext = result.hasNext;
            page = nextPage;
            empty = columns[0].length + columns[1].length === 0;
            fillIfShort().catch((error) => console.error(error));
        } catch (error) {
            if (request !== requestCounter || (error instanceof DOMException && error.name === "AbortError")) return;
            console.error("Klipy request failed", error);
            failed = true;
            failedPage = nextPage;
        } finally {
            if (request === requestCounter) loading = false;
        }
    }

    function show(forQuery: string) {
        if (!klipy) return;
        view = "results";
        shownFor = forQuery;
        reset();
        if (scroller) scroller.scrollTop = 0;
        load(forQuery, 1).catch((error) => console.error(error));
    }

    function home() {
        clearTimeout(debounce);
        abort?.abort();
        requestCounter++;
        loading = false;
        query = "";
        view = "home";
        shownFor = undefined;
        reset();
    }

    function onInput() {
        clearTimeout(debounce);
        const typed = query.trim();
        if (typed === "") {
            home();
            return;
        }
        // Not on every key: one search once the typing pauses.
        debounce = setTimeout(() => show(typed), 300);
    }

    function onSearchKey(event: KeyboardEvent) {
        if (event.key === "Enter") {
            event.preventDefault();
            clearTimeout(debounce);
            const typed = query.trim();
            if (typed !== "") show(typed);
        }
    }

    function openCategory(category: GifCategory) {
        query = category.query;
        clearTimeout(debounce);
        show(category.query);
    }

    function openTrending() {
        query = "";
        clearTimeout(debounce);
        show("");
    }

    function retry() {
        if (shownFor === undefined) return;
        load(shownFor, failedPage).catch((error) => console.error(error));
    }

    function onScroll() {
        if (view !== "results" || loading || failed || !hasNext || shownFor === undefined) return;
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 240) {
            load(shownFor, page + 1).catch((error) => console.error(error));
        }
    }

    // The first screen only has tiles, so a tall panel can show a page that doesn't fill it: keep loading.
    async function fillIfShort() {
        await tick();
        if (view === "results" && scroller && !loading && !failed && hasNext && shownFor !== undefined) {
            if (scroller.scrollHeight <= scroller.clientHeight + 40) {
                load(shownFor, page + 1).catch((error) => console.error(error));
            }
        }
    }
    function pick(item: GifItem) {
        onPick(item.url);
    }

    function close(event?: Event) {
        onClose(event);
    }

    onMount(() => {
        // A phone's keyboard would cover the list: there the search is opened by a tap.
        if (window.matchMedia("(hover: hover)").matches) searchInput?.focus();
        klipy
            ?.categories()
            .then((found) => {
                if (found.length > 0) categories = found.slice(0, 12);
            })
            .catch((error) => console.error("Klipy categories failed", error));
    });

    onDestroy(() => {
        clearTimeout(debounce);
        abort?.abort();
        // A search box that was focused when the picker closed doesn't send its blur. If the focus went to the
        // message box meanwhile (a sent GIF), that box has turned the keys off and keeps them so.
        if (searchFocused) chatInputFocusStore.set(false);
    });
</script>

<svelte:window
    on:keydown={(event) => {
        if (event.key === "Escape") close();
    }}
/>

<div
    class="gif-picker u-surface pointer-events-auto"
    data-testid="gifPicker"
    role="dialog"
    aria-label={$LL.chat.gifPicker.title()}
    use:clickOutside={close}
>
    <div class="search-row">
        {#if view === "results"}
            <button
                type="button"
                class="round-button"
                aria-label={$LL.chat.gifPicker.back()}
                data-testid="gifPickerBack"
                on:click={() => {
                    home();
                    searchInput?.focus();
                }}
            >
                <IconArrowLeft font-size={20} />
            </button>
        {/if}
        <label class="search">
            <IconSearch font-size={18} />
            <input
                bind:this={searchInput}
                bind:value={query}
                type="text"
                inputmode="search"
                enterkeyhint="search"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder={$LL.chat.gifPicker.searchPlaceholder()}
                aria-label={$LL.chat.gifPicker.searchPlaceholder()}
                data-testid="gifPickerSearch"
                on:input={onInput}
                on:keydown={onSearchKey}
                on:focus={() => {
                    searchFocused = true;
                    chatInputFocusStore.set(true);
                }}
                on:blur={() => {
                    searchFocused = false;
                    chatInputFocusStore.set(false);
                }}
            />
            {#if query !== ""}
                <button
                    type="button"
                    class="clear"
                    aria-label={$LL.chat.gifPicker.clearSearch()}
                    on:click={() => {
                        home();
                        searchInput?.focus();
                    }}
                >
                    <IconX font-size={12} stroke-width={3} />
                </button>
            {/if}
        </label>
    </div>

    <div class="scroller" bind:this={scroller} on:scroll={onScroll}>
        {#if view === "home"}
            <div class="tiles">
                <button type="button" class="tile trending" data-testid="gifPickerTrending" on:click={openTrending}>
                    <span class="tile-label"><IconTrendingUp font-size={18} />{$LL.chat.gifPicker.trending()}</span>
                </button>
                {#each categories as category, index (`${index}-${category.query}`)}
                    <button type="button" class="tile" on:click={() => openCategory(category)}>
                        {#if category.previewUrl}
                            <img
                                src={category.previewUrl}
                                alt=""
                                loading="lazy"
                                draggable="false"
                                referrerpolicy="no-referrer"
                            />
                        {/if}
                        <span class="tile-label">{category.name}</span>
                    </button>
                {/each}
            </div>
        {:else}
            <div class="columns">
                {#each columns as column, index (index)}
                    <div class="column">
                        {#each column as item (item.id)}
                            <button
                                type="button"
                                class="gif"
                                data-testid="gifPickerItem"
                                aria-label={$LL.chat.gifPicker.send({ title: item.title })}
                                style="aspect-ratio: {item.previewWidth} / {item.previewHeight}"
                                on:click={() => pick(item)}
                            >
                                <img
                                    src={item.previewUrl}
                                    alt={item.title}
                                    loading="lazy"
                                    draggable="false"
                                    referrerpolicy="no-referrer"
                                />
                            </button>
                        {/each}
                    </div>
                {/each}
            </div>
            {#if loading}
                <div class="state" role="status">
                    <span class="spinner" />
                </div>
            {:else if failed}
                <div class="state" role="alert" data-testid="gifPickerError">
                    <span>{$LL.chat.gifPicker.loadError()}</span>
                    <button type="button" class="u-cta-secondary retry" on:click={retry}>
                        {$LL.chat.gifPicker.retry()}
                    </button>
                </div>
            {:else if empty}
                <div class="state" data-testid="gifPickerEmpty">{$LL.chat.gifPicker.noResults()}</div>
            {/if}
        {/if}
    </div>
</div>

<style>
    /* One size for a phone and a desktop: wide enough for two columns, never taller than 42% of the screen on a
       phone (so the chat stays in view), and it sits right on the message field. */
    .gif-picker {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(360px, calc(100vw - 16px));
        height: min(420px, 42vh);
        min-height: 240px;
        padding: 10px 10px 0;
        border-radius: 20px;
        overflow: hidden;
        color: white;
    }
    /* The game's own button look (border, shadow, white fill) is not wanted on these. */
    .round-button,
    .clear,
    .tile,
    .gif {
        border: 0;
        box-shadow: none;
        cursor: pointer;
    }
    .round-button {
        background: transparent;
    }
    .search-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
    }
    .search {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 8px;
        min-width: 0;
        height: 44px;
        padding: 0 12px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.08);
        border: 2px solid transparent;
        color: rgba(255, 255, 255, 0.7);
    }
    .search:focus-within {
        border-color: #7c6cf6;
    }
    .search input {
        flex: 1;
        min-width: 0;
        height: 100%;
        margin: 0;
        padding: 0;
        border: 0;
        outline: 0;
        box-shadow: none;
        background: transparent;
        color: white;
        /* 16px, or iPhones zoom the page when the box is focused. */
        font-size: 16px;
    }
    .search input::placeholder {
        color: rgba(255, 255, 255, 0.55);
    }
    .round-button,
    .clear {
        display: grid;
        place-items: center;
        flex: none;
        padding: 0;
        margin: 0;
        color: white;
    }
    .round-button {
        width: 40px;
        height: 40px;
        border-radius: 9999px;
    }
    .round-button:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .clear {
        width: 20px;
        height: 20px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.55);
        color: #14121e;
    }
    .scroller {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding-bottom: 10px;
    }
    .tiles {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }
    .tile {
        position: relative;
        height: 84px;
        margin: 0;
        padding: 0;
        border-radius: 12px;
        overflow: hidden;
        background: linear-gradient(135deg, #8b5cf6, #4156f6);
        color: white;
    }
    .tile.trending {
        background: linear-gradient(135deg, #1d3fb0, #4156f6);
    }
    .tile img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .tile::after {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.32);
    }
    .tile-label {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 8px;
        font-size: 15px;
        font-weight: 700;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    }
    .columns {
        display: flex;
        gap: 6px;
        align-items: flex-start;
    }
    .column {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }
    .gif {
        display: block;
        width: 100%;
        margin: 0;
        padding: 0;
        border-radius: 10px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.08);
    }
    .gif img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .gif:focus-visible,
    .tile:focus-visible {
        outline: 2px solid #7c6cf6;
        outline-offset: 2px;
    }
    .state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 20px 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
    }
    .retry {
        height: 44px;
        padding: 0 16px;
    }
    .spinner {
        width: 22px;
        height: 22px;
        border-radius: 9999px;
        border: 3px solid rgba(255, 255, 255, 0.2);
        border-top-color: white;
        animation: gif-spin 0.8s linear infinite;
    }
    @keyframes gif-spin {
        to {
            transform: rotate(360deg);
        }
    }
    @media (max-width: 640px) {
        .gif-picker {
            width: calc(100vw - 16px);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .spinner {
            animation-duration: 2.4s;
        }
    }
</style>
