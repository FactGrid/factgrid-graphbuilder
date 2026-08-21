<script lang="ts">
    import { Graph } from "./graph";
    import { onDestroy, onMount } from "svelte";
    import { writable } from "svelte/store";
    import { mdiAlert } from "@mdi/js";
    import IconEx from "$lib/components/common/IconEx.svelte";
    import Spinner from "$lib/components/common/Spinner.svelte";
    import type { GraphState, VisParameters } from "./types";
    import { theme } from "$lib/theme";
    import {
        buildGraphSvg,
        downloadGraphPdf,
        downloadGraphSvg,
    } from "./graph-export";

    export let query: string;
    export let rootNode: string | undefined;
    export let visParameters: VisParameters;

    export const exportGraph = async (format: "svg" | "pdf") => {
        const payload = await graph.requestExportData();
        const svg = buildGraphSvg(payload);

        if (format === "svg") {
            downloadGraphSvg(svg, "factgrid-graph.svg");
        } else {
            await downloadGraphPdf(svg, payload.bounds, "factgrid-graph.pdf");
        }
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

    onMount(async () => {
        graph = await Graph.create(canvas, visParameters);
        ({ pointerPos, tooltip, isHover, isDragging, state, error } = graph);
        graph.setTheme($theme);
    });

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
</div>
