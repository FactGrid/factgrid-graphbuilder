<script lang="ts">
	import Select from "$lib/components/common/Select.svelte";
	import { graphLayouts, shortcutsModes } from "./app";
	import { createEventDispatcher } from "svelte";
	import FieldInline from "$lib/components/common/FieldInline.svelte";
	import ColorInput from "$lib/components/common/ColorInput.svelte";
	import NumberInput from "$lib/components/common/NumberInput.svelte";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import type { ShortcutStatus, VisParameters } from "$lib/force-graph/types";

	export let visParameters: VisParameters;
	export let shortcutStatus: ShortcutStatus;

	const dispatch = createEventDispatcher();

	const onComputeShortcuts = () => {
		dispatch("computeshortcuts");
	};

	const onChange = () => {
		dispatch("submit", visParameters);
	};

	const onShowLabelsChange = (checked: boolean) => {
		visParameters.showLabels = checked;
		onChange();
	};
</script>

<div class="grid grid-cols-2 gap-2">
	<FieldInline label="Layout">
		<Select
			options={graphLayouts}
			bind:value={visParameters.graphDirection}
			on:change={onChange}
		/>
	</FieldInline>
	{#if visParameters.graphDirection === "none"}
		<FieldInline label="Show labels">
			<Switch
				checked={visParameters.showLabels}
				onCheckedChange={onShowLabelsChange}
			/>
		</FieldInline>
	{/if}
	<FieldInline label="Shortcuts">
		<Select
			options={shortcutsModes}
			bind:value={visParameters.shortcutsMode}
			on:change={onChange}
		/>
	</FieldInline>
	<FieldInline label="Shortcuts color">
		<ColorInput bind:value={visParameters.shortcutsColor} on:change={onChange} />
	</FieldInline>
	<FieldInline label="Shortcuts width">
		<NumberInput
			bind:value={visParameters.shortcutsWidth}
			required={true}
			on:change={onChange}
		/>
	</FieldInline>
	{#if shortcutStatus.skipped}
		<FieldInline label="Shortcut detection">
			{#if shortcutStatus.progress}
				<span class="text-xs text-brand-500 dark:text-brand-400">
					Detecting… {Math.round(
						(shortcutStatus.progress.processed /
							shortcutStatus.progress.total) *
							100,
					)}%
				</span>
			{:else}
				<button
					type="button"
					class="text-xs underline hover:no-underline text-brand-700 dark:text-brand-200"
					on:click={onComputeShortcuts}
				>
					Detect shortcuts now
				</button>
			{/if}
		</FieldInline>
	{/if}
</div>
