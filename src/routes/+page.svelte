<script lang="ts">
    import { page } from "$app/stores";
    import { parseUrlParameters, updateUrl, type AppParameters } from "./app";
    import { generateQuery, type QueryParameters } from "./sparql-gen";
    import QueryForm from "./QueryForm.svelte";
    import Graph from "$lib/force-graph/Graph.svelte";
    import About from "./About.svelte";
    import { mdiDownload, mdiMenuDown } from "@mdi/js";
    import IconEx from "$lib/components/common/IconEx.svelte";
    import Logo from "$lib/components/common/Logo.svelte";
    import ThemeToggle from "$lib/components/common/ThemeToggle.svelte";
    import Heading2 from "$lib/components/common/Heading2.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import EditorSettingsPanel from "./EditorSettingsPanel.svelte";
    import isEqual from "lodash.isequal";
    import type { VisParameters } from "$lib/force-graph/types";

    let graphComponent: Graph;
    let exporting = false;

    const onExport = async (format: "svg" | "pdf") => {
        if (!graphComponent || exporting) {
            return;
        }

        exporting = true;
        try {
            await graphComponent.exportGraph(format);
        } catch (error) {
            console.error("Graph export failed", error);
        } finally {
            exporting = false;
        }
    };

    let query: string | undefined = undefined;

    let appParameters: AppParameters = parseUrlParameters();

    let queryParameters: QueryParameters | undefined = undefined;
    let visParameters: VisParameters = appParameters.visParameters;

    $: appParameters = parseUrlParameters($page.url.searchParams);
    $: onAppParametersUpdate(appParameters);
    $: query = generateQuery(queryParameters);

    const onAppParametersUpdate = (appParameters: AppParameters) => {
        if (!isEqual(queryParameters, appParameters.queryParameters)) {
            queryParameters = appParameters.queryParameters;
        }
        if (!isEqual(visParameters, appParameters.visParameters)) {
            visParameters = appParameters.visParameters;
        }
    };

    const rootPage = $page.url.origin + $page.url.pathname;

    const onQueryFormSubmit = async (event: CustomEvent<QueryParameters>) => {
        await updateUrl(event.detail, appParameters.visParameters, false);
    };

    const onViewFormSubmit = async (event: CustomEvent<VisParameters>) => {
        await updateUrl(appParameters.queryParameters, event.detail, true);
    };
</script>

<svelte:head>
    <title>FactGrid Graph Builder</title>
</svelte:head>

{#if query}
    <div class="relative h-screen max-h-screen w-full bg-white dark:bg-brand-950">
        <Graph
            bind:this={graphComponent}
            {query}
            rootNode={appParameters.queryParameters.item}
            visParameters={appParameters.visParameters}
        />

        <div
            class="absolute top-4 left-4 flex flex-col items-start gap-3 max-w-[calc(100vw-2rem)]"
        >
            <Logo href={rootPage} class="drop-shadow-sm" />
            <EditorSettingsPanel
                {appParameters}
                {visParameters}
                on:querysubmit={onQueryFormSubmit}
                on:vissubmit={onViewFormSubmit}
            />
        </div>

        <div class="absolute top-4 right-4">
            <ThemeToggle />
        </div>

        <div class="absolute bottom-4 left-4">
            <DropdownMenu.Root>
                <DropdownMenu.Trigger disabled={exporting}>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="outline"
                            disabled={exporting}
                            class="flex items-center gap-2"
                        >
                            <IconEx path={mdiDownload} class="w-4 h-4 fill-current" />
                            {exporting ? "Downloading…" : "Download"}
                            <IconEx
                                path={mdiMenuDown}
                                class="fill-current h-4 w-4"
                                role="presentation"
                            />
                        </Button>
                    {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start">
                    <DropdownMenu.Item onclick={() => onExport("svg")}>
                        Download as SVG
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onclick={() => onExport("pdf")}>
                        Download as PDF
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    </div>
{:else}
    <div class="min-h-screen w-full bg-white dark:bg-brand-950 px-6 py-10 md:px-20 md:py-16">
        <div class="flex items-center justify-between max-w-7xl mx-auto mb-16">
            <Logo href={rootPage} />
            <ThemeToggle />
        </div>

        <div class="grid md:grid-cols-2 gap-x-20 gap-y-12 max-w-7xl mx-auto">
            <About />

            <div>
                <Heading2 class="mt-0 text-2xl font-semibold mb-4">Start over</Heading2>
                <QueryForm {appParameters} on:submit={onQueryFormSubmit} />
            </div>
        </div>
    </div>
{/if}
