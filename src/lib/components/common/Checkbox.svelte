<script lang="ts">
    import { getid } from "./utils";

    export let id = getid();

    export let label: string;
    export let value: boolean = false;
</script>

<div
    class="border-[1.99px] border-transparent px-1 leading-6 flex items-center group select-none"
>
    <input
        bind:checked={value}
        type="checkbox"
        {id}
        class="form-checkbox w-4 h-4 rounded-sm border-[1.99px] border-brand-300 dark:border-brand-700 focus-visible:border-brand-500
        text-brand-600 bg-white dark:bg-brand-900 group-hover:bg-brand-100 dark:group-hover:bg-brand-800 group-hover:checked:bg-brand-700
        focus:outline-none focus:ring-0 focus:ring-offset-0 mt-0.5 peer"
        on:change
    />
    <label
        for={id}
        class="pl-2 text-brand-500 dark:text-brand-400 group-hover:text-brand-700 dark:group-hover:text-brand-300 peer-checked:text-brand-900 dark:peer-checked:text-brand-100"
    >
        {label}
    </label>
</div>
