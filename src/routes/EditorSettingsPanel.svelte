<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { cubicOut } from "svelte/easing";
    import type { TransitionConfig } from "svelte/transition";
    import { mdiClose, mdiCog } from "@mdi/js";
    import Card from "$lib/components/common/Card.svelte";
    import Heading2 from "$lib/components/common/Heading2.svelte";
    import IconEx from "$lib/components/common/IconEx.svelte";
    import QueryForm from "./QueryForm.svelte";
    import ViewForm from "./ViewForm.svelte";
    import type { AppParameters } from "./app";
    import type { QueryParameters } from "./sparql-gen";
    import type { GraphLayout, ShortcutStatus, VisParameters } from "$lib/force-graph/types";

    export let appParameters: AppParameters;
    export let visParameters: VisParameters;
    export let shortcutStatus: ShortcutStatus;

    let expanded = false;

    // A pure scale+fade "morph" anchored to the top-left corner, deliberately
    // with no translate component (unlike svelte/transition's crossfade, which
    // derives its translate from measured element rects and can visibly dip
    // when the two rects don't line up exactly during a layout reflow).
    const morphIn = (
        node: Element,
        { duration = 220, startScale = 0.55 }: { duration?: number; startScale?: number } = {},
    ): TransitionConfig => ({
        duration,
        easing: cubicOut,
        css: (t) => `
            opacity: ${t};
            transform-origin: top left;
            transform: scale(${startScale + ((1 - startScale) * t)});
        `,
    });

    const morphOut = (
        node: Element,
        { duration = 160, endScale = 0.55 }: { duration?: number; endScale?: number } = {},
    ): TransitionConfig => ({
        duration,
        easing: cubicOut,
        css: (t) => `
            opacity: ${t};
            transform-origin: top left;
            transform: scale(${endScale + ((1 - endScale) * t)});
        `,
    });

    const dispatch = createEventDispatcher();

    const onQuerySubmit = (event: CustomEvent<{queryParameters: QueryParameters; graphDirection: GraphLayout}>) => {
        expanded = false;
        dispatch("querysubmit", event.detail);
    };

    const onVisSubmit = (event: CustomEvent<VisParameters>) => {
        dispatch("vissubmit", event.detail);
    };

    const onComputeShortcuts = () => {
        dispatch("computeshortcuts");
    };
</script>

<!--
    Both branches below occupy the same grid cell ([grid-area:1/1]) instead of being plain flex
    siblings. With the previous plain-flow markup, the moment `expanded` flips, Svelte mounts the
    incoming element before the outgoing one's out-transition has removed it from the DOM — so for
    that brief overlap the flex-col container held both at once, and the taller incoming box could
    render below the still-present outgoing one until it was removed, producing a visible jump.
    Stacking them in one shared grid cell means both are always anchored at the exact same
    top-left position, so there's nothing for the removal to shift.
-->
<div class="grid items-start justify-items-start">
    {#if expanded}
        <div in:morphIn out:morphOut class="[grid-area:1/1] origin-top-left">
            <Card
                class="w-80 max-w-[calc(100vw_-_2rem)] max-h-[calc(100vh_-_14rem)] overflow-y-auto p-4 origin-top-left"
            >
                <div class="flex items-start justify-between">
                    <Heading2 class="mt-0 text-2xl font-semibold">Data settings</Heading2>
                    <button
                        type="button"
                        on:click={() => (expanded = false)}
                        aria-label="Collapse settings"
                        class="flex-none flex items-center justify-center w-8 h-8 -mr-1 -mt-1 rounded-md
                        text-brand-500 hover:bg-brand-100 dark:text-brand-400 dark:hover:bg-brand-800"
                    >
                        <IconEx path={mdiClose} class="w-5 h-5 fill-current" />
                    </button>
                </div>

                <div class="mt-6">
                    <QueryForm {appParameters} on:submit={onQuerySubmit} />
                </div>

                <Heading2 class="text-2xl font-semibold mt-8">Visualization settings</Heading2>
                <div class="mt-6">
                    <ViewForm
                        {visParameters}
                        {shortcutStatus}
                        on:submit={onVisSubmit}
                        on:computeshortcuts={onComputeShortcuts}
                    />
                </div>
            </Card>
        </div>
    {:else}
        <button
            type="button"
            in:morphIn
            out:morphOut
            on:click={() => (expanded = true)}
            class="[grid-area:1/1] flex items-center gap-2 rounded-md border border-brand-300 bg-white px-3 h-10
            text-brand-800 shadow-sm hover:bg-brand-100 transition-colors origin-top-left
            dark:border-brand-700 dark:bg-brand-900 dark:text-brand-200 dark:hover:bg-brand-800"
        >
            <IconEx path={mdiCog} class="w-5 h-5 fill-current" />
            Settings
        </button>
    {/if}
</div>
