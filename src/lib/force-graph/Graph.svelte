<script lang="ts">
    import { Graph } from "./graph";
    import { onDestroy, onMount } from "svelte";
    import { writable } from "svelte/store";
    import { mdiAlert, mdiClose, mdiInformationOutline } from "@mdi/js";
    import IconEx from "$lib/components/common/IconEx.svelte";
    import Spinner from "$lib/components/common/Spinner.svelte";
    import type {
        GraphState,
        NodeContextMenuInfo,
        ShortcutStatus,
        VisParameters,
    } from "./types";
    import { theme } from "$lib/theme";
    import {
        buildGraphSvg,
        downloadGraphPdf,
        downloadGraphSvg,
    } from "./graph-export";

    export let query: string;
    export let rootNode: string | undefined;
    export let visParameters: VisParameters;
    export let shortcutStatus = writable<ShortcutStatus>({ skipped: false });

    export const exportGraph = async (format: "svg" | "pdf") => {
        const payload = await graph.requestExportData();
        const svg = buildGraphSvg(payload);

        if (format === "svg") {
            downloadGraphSvg(svg, "factgrid-graph.svg");
        } else {
            await downloadGraphPdf(svg, payload.bounds, "factgrid-graph.pdf");
        }
    };

    export const computeShortcuts = () => {
        graph?.computeShortcuts();
    };

    let canvas: HTMLCanvasElement;
    let graph: Graph;

    $: graph?.load(query, rootNode);
    $: graph?.setVisParameters(visParameters);
    $: graph?.setTheme($theme);

    let pointerPos = writable({ x: -1e12, y: -1e12 });
    let tooltip = writable<string | undefined>();
    let isHover = writable<boolean>(false);
    let isDragging = writable<boolean>(false);
    let state = writable<GraphState>("ok");
    let error = writable<string | undefined>();
    let contextMenu = writable<NodeContextMenuInfo | undefined>();
    let pinnedNodeId = writable<string | undefined>();
    let isolatedConnectionsLabel = writable<string | undefined>();
    let bannerDismissed = false;

    $: if ($state === "loading") {
        bannerDismissed = false;
    }

    onMount(async () => {
        graph = await Graph.create(canvas, visParameters);
        ({
            pointerPos,
            tooltip,
            isHover,
            isDragging,
            state,
            error,
            shortcutStatus,
            contextMenu,
            pinnedNodeId,
            isolatedConnectionsLabel,
        } = graph);
        graph.setTheme($theme);
    });

    const onOpenInFactGrid = (url: string) => {
        graph?.onNodeClicked(url);
        contextMenu.set(undefined);
    };

    const onToggleHighlight = (nodeId: string) => {
        graph?.setPinnedNode($pinnedNodeId === nodeId ? undefined : nodeId);
        contextMenu.set(undefined);
    };

    const onIsolateConnections = (nodeId: string) => {
        graph?.setIsolatedConnections(nodeId);
        contextMenu.set(undefined);
    };

    const onShowFullGraph = () => {
        graph?.setIsolatedConnections(undefined);
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            contextMenu.set(undefined);
        }
    };

    onDestroy(() => {
        graph.destroy();
    });

    let width: number;
    let height: number;

    $: tooltipStyle = $tooltip
        ? `\
            top: ${$pointerPos.y}px; 
            left: ${$pointerPos.x}px; 
            transform: translate(-${($pointerPos.x / width) * 100}%, \
            ${height - $pointerPos.y < 100 ? "calc(-100% - 8px)" : "21px"}`
        : `display:none`;
</script>

<div class="h-full overflow-clip force-graph-container relative">
    <canvas
        bind:this={canvas}
        class="select-none w-full h-full
        {$isDragging ? 'cursor-grabbing' : $isHover ? 'cursor-pointer' : ''}"
        bind:clientWidth={width}
        bind:clientHeight={height}
    />
    <div
        class="absolute p-1 rounded-md text-white bg-brand-900/85 dark:bg-brand-950/90 text-center"
        style={tooltipStyle}
    >
        {@html $tooltip}
    </div>

    {#if $state === "loading"}
        <div class="absolute inset-0 flex items-center justify-center">
            <Spinner class="w-16 h-16 text-accent" />
        </div>
    {/if}

    {#if $state === "error"}
        <div class="absolute inset-0 flex items-center justify-center ">
            <div
                class="flex p-4 mx-4 text-sm rounded-lg border border-brand-200 bg-white text-red-600 dark:border-brand-700 dark:bg-brand-900 dark:text-red-400 items-center"
                role="alert"
            >
                <IconEx
                    path={mdiAlert}
                    class="w-16 h-16 fill-red-600 dark:fill-red-400"
                />
                <div class="pl-4 space-y-3">
                    <div class="font-medium">Unable to load graph data</div>
                    <div>{$error}</div>
                </div>
            </div>
        </div>
    {/if}

    {#if $shortcutStatus.skipped && !bannerDismissed && !$isolatedConnectionsLabel}
        <div
            class="absolute top-2 inset-x-0 flex justify-center pointer-events-none z-30"
        >
            <div
                class="pointer-events-auto flex items-center gap-3 px-3 py-2 max-w-lg text-sm rounded-lg border border-brand-200 bg-white/95 text-brand-700 dark:border-brand-700 dark:bg-brand-900/95 dark:text-brand-200 shadow"
                role="status"
            >
                <IconEx
                    path={mdiInformationOutline}
                    class="w-5 h-5 flex-shrink-0 fill-brand-400 dark:fill-brand-500"
                />
                {#if $shortcutStatus.progress}
                    <div class="flex flex-col gap-1 flex-1">
                        <span
                            >Detecting shortcuts… {Math.round(
                                ($shortcutStatus.progress.processed /
                                    $shortcutStatus.progress.total) *
                                    100,
                            )}%</span
                        >
                        <progress
                            class="w-full h-1.5 accent-accent"
                            value={$shortcutStatus.progress.processed}
                            max={$shortcutStatus.progress.total}
                        ></progress>
                    </div>
                {:else}
                    <span
                        >Shortcut-edge styling was skipped for this large
                        graph — it's rarely used, so this keeps things
                        responsive.</span
                    >
                    <button
                        type="button"
                        class="shrink-0 underline hover:no-underline"
                        on:click={computeShortcuts}
                    >
                        Detect shortcuts now
                    </button>
                {/if}
                <button
                    type="button"
                    aria-label="Dismiss"
                    class="shrink-0 -mr-1 flex items-center justify-center w-5 h-5 rounded hover:bg-brand-100 dark:hover:bg-brand-800"
                    on:click={() => (bannerDismissed = true)}
                >
                    <IconEx
                        path={mdiClose}
                        class="w-4 h-4 fill-brand-400 dark:fill-brand-500"
                    />
                </button>
            </div>
        </div>
    {/if}

    {#if $contextMenu}
        <div
            class="fixed inset-0 z-40"
            on:pointerdown={() => contextMenu.set(undefined)}
            role="presentation"
        ></div>
        <div
            class="absolute z-50 flex flex-col rounded-md border border-brand-200 bg-white dark:border-brand-700 dark:bg-brand-900 shadow-md text-sm overflow-hidden"
            style="top: {$contextMenu.pos.y}px; left: {$contextMenu.pos.x}px;"
            on:pointerdown|stopPropagation
            role="menu"
            tabindex="-1"
        >
            <button
                type="button"
                role="menuitem"
                class="px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-800"
                on:click={() => onOpenInFactGrid($contextMenu?.url ?? "")}
            >
                Open in FactGrid
            </button>
            <button
                type="button"
                role="menuitem"
                class="px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-800"
                on:click={() => onToggleHighlight($contextMenu?.nodeId ?? "")}
            >
                {$pinnedNodeId === $contextMenu.nodeId
                    ? "Remove highlight"
                    : "Highlight connections"}
            </button>
            {#if $contextMenu.canIsolateConnections}
                <button
                    type="button"
                    role="menuitem"
                    class="px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-800"
                    on:click={() => onIsolateConnections($contextMenu?.nodeId ?? "")}
                >
                    Isolate connections
                </button>
            {/if}
        </div>
    {/if}

    {#if $isolatedConnectionsLabel}
        <div
            class="absolute top-2 inset-x-0 flex justify-center pointer-events-none z-30"
        >
            <div
                class="pointer-events-auto flex items-center gap-3 px-3 py-2 max-w-lg text-sm rounded-lg border border-brand-200 bg-white/95 text-brand-700 dark:border-brand-700 dark:bg-brand-900/95 dark:text-brand-200 shadow"
                role="status"
            >
                <span class="truncate"
                    >Showing isolated connections for: {$isolatedConnectionsLabel}</span
                >
                <button
                    type="button"
                    class="shrink-0 underline hover:no-underline"
                    on:click={onShowFullGraph}
                >
                    Back to full view
                </button>
            </div>
        </div>
    {/if}
</div>

<svelte:window on:keydown={onWindowKeyDown} />
