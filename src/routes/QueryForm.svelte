<script lang="ts">
    import {
        modes,
        graphLayouts,
        defaultLanguage,
        defaultMode,
        defaultGraphLayout,
        getLinks,
        type AppParameters,
    } from "./app";
    import NumberInput from "$lib/components/common/NumberInput.svelte";
    import Select from "$lib/components/common/Select.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import Field from "$lib/components/common/Field.svelte";
    import ItemEdit from "$lib/components/wikidata/ItemEdit.svelte";
    import LanguageEdit from "$lib/components/wikidata/LanguageEdit.svelte";
    import type { ValueItem } from "$lib/components/common/autocomplete-input";
    import { Textarea } from "$lib/components/ui/textarea/index.js";
    import DropdownMenu from "$lib/components/common/DropdownMenu.svelte";
    import { createEventDispatcher } from "svelte";
    import type { GraphLayout } from "$lib/force-graph/types";
    import { mdiInformationOutline } from "@mdi/js";
    import IconEx from "$lib/components/common/IconEx.svelte";

    import {
        queryParametersIsValid,
        type AppMode,
        type QueryParameters,
    } from "./sparql-gen";

    export let appParameters: AppParameters;

    let item: string | undefined;
    let itemObject: ValueItem | undefined;
    let property: string | undefined;
    let propertyObject: ValueItem | undefined;
    let language: string = defaultLanguage;
    let iterations: number | undefined;
    let limit: number | undefined;
    let mode: AppMode = defaultMode;
    let wdqs: string | undefined;
    let sizeProperty: string | undefined;
    let sizePropertyObject: ValueItem | undefined;
    let unitProperty: string | undefined;
    let unitPropertyObject: ValueItem | undefined;
    let sizeMode: "none" | "size" | "unit" = "none";
    let graphDirection: GraphLayout = defaultGraphLayout;

    const sizeModeOptions: Record<string, string> = {
        none: "None",
        size: "Size property",
        unit: "Unit property",
    };

    const dispatch = createEventDispatcher();

    $: onAppParametersUpdate(appParameters);

    const onAppParametersUpdate = async (appParameters: AppParameters) => {
        ({
            item,
            property,
            language,
            iterations,
            limit,
            mode,
            wdqs,
            sizeProperty,
            unitProperty,
        } = appParameters.queryParameters);

        sizeMode = unitProperty ? "unit" : sizeProperty ? "size" : "none";
        graphDirection = appParameters.visParameters.graphDirection;

        // https://github.com/sveltejs/svelte/issues/4470
        // await tick();
        // dispatch("update", appParameters);
    };

    $: formQueryParameters = {
        property: propertyObject?.id,
        item: itemObject?.id,
        language,
        iterations,
        limit,
        mode,
        wdqs,
        sizeProperty: sizePropertyObject?.id,
        unitProperty: unitPropertyObject?.id,
    } as QueryParameters;

    $: isValid = queryParametersIsValid(formQueryParameters);
    $: tools = getLinks(formQueryParameters);
    $: isForceDirected = graphDirection === "none";

    const onSubmit = () => {
        dispatch("submit", {queryParameters: formQueryParameters, graphDirection});
    };

    const onSizeModeChange = () => {
        if (sizeMode !== "size") {
            sizeProperty = undefined;
            sizePropertyObject = undefined;
        }

        if (sizeMode !== "unit") {
            unitProperty = undefined;
            unitPropertyObject = undefined;
        }
    };
</script>

<div class="space-y-5">
    <div class="flex gap-4">
        <Field class="w-[calc(50%-0.25rem)] box-border" label="Mode">
            <Select bind:value={mode} options={modes} />
        </Field>

        <Field class="w-[calc(50%-0.25rem)] box-border" label="Language">
            <LanguageEdit bind:value={language} placeholder="Click to set" />
        </Field>
    </div>

    {#if mode === "wdqs"}
        <Field label="SPARQL query">
            <Textarea bind:value={wdqs} class="min-h-32 font-mono text-sm" />
        </Field>

        <div
            class="flex items-start gap-3 px-3 py-2 text-sm rounded-lg border border-brand-200 bg-brand-50/60 text-brand-700 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
        >
            <IconEx
                path={mdiInformationOutline}
                class="w-5 h-5 flex-shrink-0 mt-0.5 fill-brand-400 dark:fill-brand-500"
            />
            <div class="space-y-1">
                <div>
                    The query's result needs these bindings for the graph to be built
                    from it:
                </div>
                <ul class="list-disc pl-4 space-y-0.5">
                    <li>
                        <span class="font-mono">?item</span> — required, a unique IRI
                        per node.
                    </li>
                    <li>
                        <span class="font-mono">?itemLabel</span> — optional, the node's
                        display label (falls back to the tail of the item's IRI).
                    </li>
                    <li>
                        <span class="font-mono">?linkTo</span> — optional, the IRI of another
                        node this one links to; repeat the row (same
                        <span class="font-mono">?item</span>, different
                        <span class="font-mono">?linkTo</span>) for more than one link.
                    </li>
                    <li>
                        <span class="font-mono">?size</span> — optional, a number used to
                        scale node size (force-directed layout only).
                    </li>
                </ul>
            </div>
        </div>
    {:else}
        <Field label="Traversal property">
            <ItemEdit
                bind:value={property}
                bind:valueObject={propertyObject}
                type="property"
                {language}
            />
        </Field>

        <Field label="Root item">
            <ItemEdit
                bind:value={item}
                bind:valueObject={itemObject}
                type="item"
                {language}
            />
        </Field>

        <div class="flex gap-4">
            <Field class="w-[calc(50%-0.25rem)] box-border" label="Iterations">
                <NumberInput
                    bind:value={iterations}
                    min={0}
                    max={100000}
                    placeholder="Unlimited"
                    treatZeroAsUndefined={true}
                />
            </Field>

            <Field class="w-[calc(50%-0.25rem)] box-border" label="Layout">
                <Select options={graphLayouts} bind:value={graphDirection} />
            </Field>
        </div>

        {#if isForceDirected}
            <Field label="Node size based on">
                <Select
                    options={sizeModeOptions}
                    bind:value={sizeMode}
                    on:change={onSizeModeChange}
                />
            </Field>

            {#if sizeMode === "size"}
                <Field label="Size property">
                    <ItemEdit
                        bind:value={sizeProperty}
                        bind:valueObject={sizePropertyObject}
                        type="property"
                        {language}
                    />
                </Field>
            {:else if sizeMode === "unit"}
                <Field label="Unit property">
                    <ItemEdit
                        bind:value={unitProperty}
                        bind:valueObject={unitPropertyObject}
                        type="property"
                        datatype="quantity"
                        {language}
                    />
                </Field>
            {/if}
        {/if}
    {/if}

    <div class="flex gap-4 pt-2">
        <Button
            onclick={onSubmit}
            disabled={!isValid}
            class="flex-1"
            variant="cta"
        >
            Build
        </Button>
        <DropdownMenu class="flex-1" title="Tools" links={tools} />
    </div>
</div>
