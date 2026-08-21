<script lang="ts">
    let cls = "";
    export { cls as class };
</script>

<div
    class="rounded-lg border border-brand-300 bg-white shadow-sm
    dark:border-brand-700 dark:bg-brand-900
    {cls}"
    {...$$restProps}
>
    <slot />
</div>
