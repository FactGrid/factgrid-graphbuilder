<script lang="ts">
	import { useActions, type ActionList } from "svelte-useactions";
	import ColorPicker from "svelte-awesome-color-picker";
	import PickerIndicator from "./PickerIndicator.svelte";
	import Wrapper from "./Wrapper.svelte";
	import type { HTMLAttributes } from "svelte/elements";

	interface $$Props extends HTMLAttributes<HTMLDivElement> {
		class?: string | undefined;

		use?: ActionList<HTMLDivElement>;
		hex: string;
	}

	export let use: ActionList<HTMLDivElement> = [];
	export let hex: string;

	let element: HTMLDivElement;

	export const focus = () => element.focus();
	export const blur = () => element.blur();
</script>

<div use:useActions={use} on:blur bind:this={element} {...$$restProps}>
	<ColorPicker
		isDialog={false}
		isOpen={true}
		bind:hex
		isTextInput={false}
		sliderDirection="horizontal"
		components={{
			wrapper: Wrapper,
			pickerIndicator: PickerIndicator,
		}}
	/>
</div>
