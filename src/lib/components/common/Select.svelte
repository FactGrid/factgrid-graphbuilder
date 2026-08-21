<script lang="ts">
    import * as Select from "$lib/components/ui/select/index.js";
    import { createEventDispatcher } from "svelte";
    import { getid } from "./utils";

    let cls = "";
    export { cls as class };

    export let id = getid();
    export let value: string;

    export let options: Record<string, string>;

    const dispatch = createEventDispatcher();

    $: items = Object.entries(options).map(([itemValue, label]) => ({
        value: itemValue,
        label,
    }));

    const onValueChange = (newValue: string) => {
        const changed = newValue !== value;
        value = newValue;

        if (changed) {
            dispatch("change");
        }
    };
</script>

<Select.Root type="single" {value} {items} {onValueChange}>
    <Select.Trigger {id} class="w-full {cls}">
        {options[value]}
    </Select.Trigger>
    <Select.Content>
        {#each items as item (item.value)}
            <Select.Item value={item.value} label={item.label} />
        {/each}
    </Select.Content>
</Select.Root>
