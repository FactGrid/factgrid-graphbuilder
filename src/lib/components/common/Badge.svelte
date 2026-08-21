<script lang="ts">
    let cls = "";
    export { cls as class };
</script>

<span
    class="inline-flex flex-none items-center whitespace-nowrap rounded-md border border-brand-400/40 bg-brand-400/10 px-2 py-0.5 text-xs font-medium text-brand-700
    dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-200
    {cls}"
>
    <slot />
</span>
