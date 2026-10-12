<script lang="ts">
    /* eslint-disable svelte/no-at-html-tags */
    import { fly } from "svelte/transition";
    import { LL } from "../../../i18n/i18n-svelte";
    import { installApp } from "../../Install/InstallWiring";
    import { installIconSrc } from "../../Install/InstallIcon";
    import { IconArrowDown, IconCheck, IconCopy, IconDots, IconShare2, IconSquarePlus, IconX } from "@wa-icons";

    const { guideOpenStore } = installApp;
    const iconSrc = installIconSrc();

    // The three steps of the iPhone and iPad guides. What the chip on the right draws is the button to tap, as the
    // browser shows it (light, in the browser's own look): it is not ours.
    $: iosGuide =
        $guideOpenStore === "iphone-safari"
            ? { text: $LL.install.guide.iphoneSafari, firstChip: "dots" as const }
            : $guideOpenStore === "ipad-safari"
            ? { text: $LL.install.guide.ipadSafari, firstChip: "share" as const }
            : $guideOpenStore === "ios-chrome"
            ? { text: $LL.install.guide.iosChrome, firstChip: "share" as const }
            : undefined;

    let copied = false;
    let copiedTimer: ReturnType<typeof setTimeout> | undefined;
    async function copyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            copied = true;
            clearTimeout(copiedTimer);
            copiedTimer = setTimeout(() => (copied = false), 2500);
        } catch (error) {
            console.warn("The link could not be copied", error);
        }
    }
</script>

{#if iosGuide !== undefined}
    <!-- iPhone and iPad: a sheet above the browser's bar, and an arrow bouncing over the button to tap first. Safari
         on iPhone has Share behind ⋯ in its bottom bar (iOS 26); Chrome and Safari on iPad have it at the top right. -->
    <div
        class="u-surface pointer-events-auto absolute inset-x-2 z-[1100] mx-auto flex max-w-[440px] flex-col gap-3 rounded-3xl px-4 pb-4 pt-2.5 text-white {$guideOpenStore ===
        'iphone-safari'
            ? 'bottom-[86px]'
            : 'bottom-6'}"
        role="dialog"
        aria-label={iosGuide.text.title()}
        data-testid="install-guide"
        transition:fly={{ y: 80, duration: 300 }}
    >
        <div class="mx-auto h-[5px] w-10 rounded-full bg-white/25" aria-hidden="true" />
        <div class="flex items-center gap-3">
            {#if iconSrc}
                <img class="h-12 w-12 flex-none rounded-[22%]" src={iconSrc} alt="" />
            {/if}
            <b class="flex-1 text-[19px] font-extrabold leading-tight">{iosGuide.text.title()}</b>
            <button
                type="button"
                class="u-close"
                aria-label={$LL.install.guide.close()}
                data-testid="install-guide-close"
                on:click={() => installApp.closeGuide()}
            >
                <IconX font-size="18" aria-hidden="true" />
            </button>
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-gradient-to-r from-[#8629fc] to-[#4156f6] text-[13px] font-bold"
                >1</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug">{@html iosGuide.text.step1()}</span>
            <span class="chip" aria-hidden="true">
                {#if iosGuide.firstChip === "dots"}<IconDots font-size="18" />{:else}<IconShare2 font-size="18" />{/if}
            </span>
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-white/10 text-[13px] font-bold"
                >2</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug">{@html iosGuide.text.step2()}</span>
            <span class="chip" aria-hidden="true"
                ><IconSquarePlus font-size="18" />{$LL.install.guide.addToHomeScreen()}</span
            >
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-white/10 text-[13px] font-bold"
                >3</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug">{@html iosGuide.text.step3()}</span>
            <span class="chip" aria-hidden="true"><span class="toggle" /></span>
        </div>
        <p
            class="m-0 border-t border-white/10 pt-3 text-center text-[13px] text-white/60"
            data-testid="install-guide-already"
        >
            {$LL.install.guide.alreadyAdded()}
        </p>
    </div>
    {#if $guideOpenStore === "iphone-safari"}
        <div class="hint pointer-events-none absolute bottom-[70px] right-[18px] z-[1101]" aria-hidden="true">
            <IconArrowDown font-size="34" />
        </div>
    {:else}
        <div
            class="hint hint-up pointer-events-none absolute right-[58px] top-[98px] z-[1101] md:right-[72px] md:top-14"
            aria-hidden="true"
        >
            <IconArrowDown font-size="34" />
        </div>
    {/if}
{:else if $guideOpenStore === "open-in-safari"}
    <!-- Inside Instagram, WhatsApp and the like: their own browsers cannot add to the Home Screen, so say so. -->
    <div
        class="u-surface pointer-events-auto absolute inset-x-2 top-[110px] z-[1100] mx-auto flex max-w-[440px] flex-col gap-3 rounded-[20px] p-[18px] text-white"
        role="dialog"
        aria-label={$LL.install.guide.openInSafari.title()}
        data-testid="install-guide"
        transition:fly={{ y: -50, duration: 300 }}
    >
        <div class="flex items-center gap-3">
            {#if iconSrc}
                <img class="h-12 w-12 flex-none rounded-[22%]" src={iconSrc} alt="" />
            {/if}
            <b class="text-[19px] leading-tight">{$LL.install.guide.openInSafari.title()}</b>
        </div>
        <p class="m-0 text-sm text-white/70">{$LL.install.guide.openInSafari.text()}</p>
        <div class="flex gap-2">
            <button
                type="button"
                class="u-cta flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold"
                data-testid="install-guide-copy"
                on:click={() => void copyLink()}
            >
                {#if copied}<IconCheck
                        font-size="18"
                        aria-hidden="true"
                    />{$LL.install.guide.openInSafari.copied()}{:else}<IconCopy
                        font-size="18"
                        aria-hidden="true"
                    />{$LL.install.guide.openInSafari.copy()}{/if}
            </button>
            <button
                type="button"
                class="u-cta-secondary flex min-h-[44px] min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-bold"
                data-testid="install-guide-close"
                on:click={() => installApp.closeGuide()}
            >
                {$LL.install.guide.openInSafari.notNow()}
            </button>
        </div>
    </div>
{:else if $guideOpenStore === "browser-menu-android" || $guideOpenStore === "browser-menu-desktop"}
    <!-- The browser's own install window was cancelled and cannot open twice: point at the browser's menu. -->
    <div
        class="u-surface pointer-events-auto absolute left-1/2 top-[110px] z-[1100] flex w-[440px] max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col gap-3 rounded-[20px] p-5 text-white"
        role="dialog"
        aria-label={$LL.install.guide.browserMenu.title()}
        data-testid="install-guide"
        transition:fly={{ y: -50, duration: 300 }}
    >
        <div class="flex items-center gap-3">
            {#if iconSrc}
                <img class="h-12 w-12 flex-none rounded-[22%]" src={iconSrc} alt="" />
            {/if}
            <b class="flex-1 text-lg leading-tight">{$LL.install.guide.browserMenu.title()}</b>
            <button
                type="button"
                class="u-close"
                aria-label={$LL.install.guide.close()}
                on:click={() => installApp.closeGuide()}
            >
                <IconX font-size="18" aria-hidden="true" />
            </button>
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-gradient-to-r from-[#8629fc] to-[#4156f6] text-[13px] font-bold"
                >1</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug"
                >{@html $guideOpenStore === "browser-menu-android"
                    ? $LL.install.guide.browserMenu.androidStep1()
                    : $LL.install.guide.browserMenu.desktopStep1()}</span
            >
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-white/10 text-[13px] font-bold"
                >2</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug"
                >{@html $guideOpenStore === "browser-menu-android"
                    ? $LL.install.guide.browserMenu.androidStep2()
                    : $LL.install.guide.browserMenu.desktopStep2()}</span
            >
        </div>
        <div class="flex">
            <button
                type="button"
                class="u-cta-secondary flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-bold"
                data-testid="install-guide-close"
                on:click={() => installApp.closeGuide()}
            >
                {$LL.install.guide.browserMenu.gotIt()}
            </button>
        </div>
    </div>
{:else if $guideOpenStore === "mac-safari"}
    <!-- Mac Safari has no install button either: File, then Add to Dock. -->
    <div
        class="u-surface pointer-events-auto absolute left-1/2 top-[110px] z-[1100] flex w-[440px] max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col gap-3 rounded-[20px] p-5 text-white"
        role="dialog"
        aria-label={$LL.install.guide.macSafari.title()}
        data-testid="install-guide"
        transition:fly={{ y: -50, duration: 300 }}
    >
        <div class="flex items-center gap-3">
            {#if iconSrc}
                <img class="h-12 w-12 flex-none rounded-[22%]" src={iconSrc} alt="" />
            {/if}
            <b class="flex-1 text-lg leading-tight">{$LL.install.guide.macSafari.title()}</b>
            <button
                type="button"
                class="u-close"
                aria-label={$LL.install.guide.close()}
                on:click={() => installApp.closeGuide()}
            >
                <IconX font-size="18" aria-hidden="true" />
            </button>
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-gradient-to-r from-[#8629fc] to-[#4156f6] text-[13px] font-bold"
                >1</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug">{@html $LL.install.guide.macSafari.step1()}</span>
        </div>
        <div class="flex min-h-12 items-center gap-3">
            <span
                class="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-white/10 text-[13px] font-bold"
                >2</span
            >
            <span class="min-w-0 flex-1 text-sm leading-snug">{@html $LL.install.guide.macSafari.step2()}</span>
        </div>
        <div class="flex">
            <button
                type="button"
                class="u-cta-secondary flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-bold"
                data-testid="install-guide-close"
                on:click={() => installApp.closeGuide()}
            >
                {$LL.install.guide.macSafari.gotIt()}
            </button>
        </div>
    </div>
{/if}

<style>
    /* What the browser draws (a button in its bar, a switch): light and in its own look, so it reads as the thing to
       find there, not as part of the game. */
    .chip {
        display: inline-flex;
        flex: none;
        align-items: center;
        gap: 6px;
        height: 34px;
        padding: 0 10px;
        border-radius: 10px;
        background: rgba(240, 240, 245, 0.92);
        color: #1c1c1e;
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
    }
    .toggle {
        position: relative;
        width: 30px;
        height: 18px;
        border-radius: 999px;
        background: #34c759;
    }
    .toggle::after {
        content: "";
        position: absolute;
        top: 2px;
        right: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
    }
    /* The arrow over the button to tap: yellow, bouncing (still for people who asked for less motion). */
    .hint {
        display: grid;
        place-items: center;
        color: #fde047;
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
    }
    .hint-up {
        rotate: 180deg;
    }
    @media (prefers-reduced-motion: no-preference) {
        .hint {
            animation: install-hint-bob-down 1.1s ease-in-out infinite;
        }
        .hint-up {
            animation-name: install-hint-bob-up;
        }
    }
    @keyframes install-hint-bob-down {
        0%,
        100% {
            translate: 0 0;
        }
        50% {
            translate: 0 6px;
        }
    }
    @keyframes install-hint-bob-up {
        0%,
        100% {
            translate: 0 0;
        }
        50% {
            translate: 0 -6px;
        }
    }
</style>
