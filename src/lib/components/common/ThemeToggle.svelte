<script lang="ts">
    import { mdiWeatherNight, mdiWhiteBalanceSunny } from "@mdi/js";
    import IconEx from "./IconEx.svelte";
    import { theme, toggleTheme } from "$lib/theme";

    let cls = "";
    export { cls as class };
</script>

<button
    type="button"
    on:click={toggleTheme}
    title={$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    class="flex items-center justify-center w-9 h-9 rounded-md border border-brand-300 bg-white
    text-brand-600 hover:bg-brand-100 transition-colors
    dark:bg-brand-900 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-800
    {cls}"
>
    <IconEx
        path={$theme === "dark" ? mdiWeatherNight : mdiWhiteBalanceSunny}
        class="w-5 h-5 fill-current"
    />
</button>
