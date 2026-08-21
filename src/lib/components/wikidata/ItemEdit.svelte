<script lang="ts">
    import { searchEntities, getEntity, type ValueType } from "./item-edit";
    import AutocompleteInput from "$lib/components/common/AutocompleteInput.svelte";
    import IconEx from "$lib/components/common/IconEx.svelte";
    import { mdiOpenInNew } from "@mdi/js";
    import type {
        AutocompleteFunction,
        ResolveFunction,
        ValueItem,
    } from "$lib/components/common/autocomplete-input";

    let cls = "";
    export { cls as class };

    export let id: string | undefined = undefined;
    export let value: string | undefined = undefined;
    export let valueObject: ValueItem | undefined = undefined;
    export let type: ValueType;
    export let language: string = "en";
    export let placeholder = "Click to set";
    export let datatype: string | undefined = undefined;

    let autocomplete: AutocompleteFunction;
    let resolve: ResolveFunction;

    $: autocomplete = (search, abortSignal) =>
        searchEntities(type, search, language, abortSignal, undefined, datatype);
    $: resolve = (value, abortSignal) =>
        getEntity(value, language, abortSignal);

    const getUrl = (value: ValueItem | undefined) => {
        let namespace = "Item:";
        if (type === "property") {
            namespace = "Property:";
        }
        return `https://database.factgrid.de/wiki/${namespace}${value!.id}`;
    };
</script>

<AutocompleteInput
    bind:value
    bind:valueObject
    {id}
    {autocomplete}
    {resolve}
    class={cls}
    {placeholder}
    {language}
>
    <svelte:fragment slot="action">
        {#if valueObject}
            <a
                href={getUrl(valueObject)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in FactGrid"
                class="flex-none flex items-center justify-center w-9 h-9 rounded-md text-brand-400 hover:text-brand-600 hover:bg-brand-100 dark:text-brand-500 dark:hover:text-brand-300 dark:hover:bg-brand-800"
            >
                <IconEx path={mdiOpenInNew} class="w-4 h-4 fill-current" />
            </a>
        {/if}
    </svelte:fragment>
</AutocompleteInput>
