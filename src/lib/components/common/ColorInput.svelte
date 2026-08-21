<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import ColorPicker from "./color-picker/ColorPicker.svelte";
	import * as Popover from "$lib/components/ui/popover/index.js";
	import { getid } from "./utils";

	export let value: string = "#ff0000";
	$: editValue = value;

	let cls = "";
	export { cls as class };

	export let id = getid();
	export let label: string | undefined = undefined;

	let open = false;

	const dispatch = createEventDispatcher();

	const onOpenChange = (isOpen: boolean) => {
		if (!isOpen && open) {
			const changed = value !== editValue;
			value = editValue;

			if (changed) {
				dispatch("change");
			}
		}

		open = isOpen;
	};
</script>

<Popover.Root bind:open {onOpenChange}>
	<div class="inline-flex items-center gap-2">
		<Popover.Trigger
			{id}
			aria-label={label ?? "Choose color"}
			style="background-color: {editValue}"
			class="h-8 w-8 flex-none rounded-md border border-black/10 dark:border-white/15 shadow-sm
			hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-600
			data-[state=open]:ring-2 data-[state=open]:ring-brand-500
			focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
			transition
			{cls}"
		></Popover.Trigger>
		{#if label !== undefined}
			<span class="text-sm text-brand-800 dark:text-brand-200">{label}</span>
		{/if}
	</div>
	<Popover.Content class="w-auto p-0" align="start">
		<ColorPicker id="field-{id}" bind:hex={editValue} tabindex={0} />
	</Popover.Content>
</Popover.Root>
