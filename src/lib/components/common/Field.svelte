<script lang="ts">
    import { setContext } from "svelte";
    import { makeid } from "./utils";
    import { Label } from "$lib/components/ui/label/index.js";

    export const id: string = makeid(10);
    export let label: string;

    let cls = "";
    export { cls as class };

    const onMousedown = (event: MouseEvent) => {
        // prevent blur for nested component, if it is focused at this moment
        const activeFieldId = document.activeElement?.id;
        if (activeFieldId === id || activeFieldId === "field-" + id) {
            event.preventDefault();
        }
    };

    setContext("field", { id });
</script>

<div class={cls}>
    <Label
        for={id}
        id="label-{id}"
        onmousedown={onMousedown}
        class="block mb-1.5 text-brand-900 dark:text-brand-50 font-bold"
    >
        {label}
    </Label>
    <slot />
</div>
