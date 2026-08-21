<script lang="ts">
    import type { HTMLAnchorAttributes } from "svelte/elements";
    import type { AutocompleteItem } from "./autocomplete-input";
    import Badge from "./Badge.svelte";

    interface $$Props extends HTMLAnchorAttributes {
        item: AutocompleteItem;
        active: boolean;
    }

    export let item: AutocompleteItem;
    export let active: boolean;
</script>

<!-- svelte-ignore a11y-invalid-attribute -->
<a
    href="#"
    target="_blank"
    rel="noopener noreferrer"
    class="flex flex-wrap items-start gap-x-2 gap-y-1 px-1.5 py-1.5 rounded
    {active ? 'bg-brand-100 dark:bg-brand-800' : ''}"
    role="option"
    aria-selected={active}
    on:mouseenter
    on:mousedown|preventDefault={() => {}}
    on:click|preventDefault
    {...$$restProps}
>
    <span class="min-w-32 flex-1">
        <span
            class="block font-medium overflow-hidden text-ellipsis whitespace-nowrap
            {active ? 'text-brand-900 dark:text-brand-50' : 'text-brand-800 dark:text-brand-200'}"
        >
            {item.value.label?.value ?? item.value.id}
            {#if item.match && item.match?.text !== item.value.label?.value}
                <i>({item.match.text})</i>
            {/if}
        </span>
        {#if item.value.description}
            <span
                class="block text-brand-500 dark:text-brand-400 overflow-hidden text-ellipsis whitespace-nowrap"
            >
                {item.value.description.value}
            </span>
        {/if}
    </span>
    {#if item.value.instanceOf}
        <Badge>{item.value.instanceOf}</Badge>
    {/if}
</a>
