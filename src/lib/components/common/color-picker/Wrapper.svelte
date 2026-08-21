<script lang="ts">
	import type {Snippet} from 'svelte';

	let {
		wrapper = $bindable(undefined),
		isOpen,
		isDialog,
		children,
	}: {
		wrapper?: HTMLElement;
		isOpen: boolean;
		isDialog: boolean;
		children: Snippet;
	} = $props();
</script>

<div
	class="w-64 flex flex-col bg-white border border-brand-200 shadow-md shadow-brand-900/10 rounded-md pb-1 overflow-hidden z-10 dark:bg-brand-900 dark:border-brand-700 dark:shadow-black/40"
	bind:this={wrapper}
	aria-label="color picker"
>
	{@render children()}
</div>
