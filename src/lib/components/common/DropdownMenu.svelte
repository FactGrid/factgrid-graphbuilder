<script lang="ts">
    import { mdiMenuDown } from "@mdi/js";
    import IconEx from "./IconEx.svelte";
    import { getid } from "./utils";
    import { Button } from "$lib/components/ui/button/index.js";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";

    let cls = "";
    export { cls as class };

    export let id = getid();
    export let title: string;
    export let links: { link: string; text: string }[];
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger disabled={links.length === 0}>
        {#snippet child({ props })}
            <Button
                {...props}
                {id}
                variant="outline"
                disabled={links.length === 0}
                class={cls}
            >
                {title}
                <IconEx
                    path={mdiMenuDown}
                    class="fill-current h-4 w-4 inline"
                    role="presentation"
                />
            </Button>
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start">
        {#each links as { link, text }}
            <DropdownMenu.Item>
                {#snippet child({ props })}
                    <a {...props} href={link} target="_blank" rel="noopener noreferrer">
                        {text}
                    </a>
                {/snippet}
            </DropdownMenu.Item>
        {/each}
    </DropdownMenu.Content>
</DropdownMenu.Root>
