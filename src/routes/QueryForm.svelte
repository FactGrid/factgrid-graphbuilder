<script lang="ts">
    import {
        modes,
        defaultLanguage,
        defaultMode,
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
    $: isForceDirected = appParameters.visParameters.graphDirection === "none";

    const onSubmit = () => {
        dispatch("submit", formQueryParameters);
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

        <Field label="Iterations">
            <NumberInput
                bind:value={iterations}
                min={0}
                max={100000}
                placeholder="Unlimited"
                treatZeroAsUndefined={true}
            />
        </Field>

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
