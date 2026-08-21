<script lang="ts">
	import { setContext } from "svelte";
	import { makeid } from "./utils";
	import { Label } from "$lib/components/ui/label/index.js";

	export const id: string = makeid(10);
	export let label: string;

	let cls = "";
	export { cls as class };

	setContext("field", { id });
</script>

<Label for={id} id="label-{id}" class="text-brand-900 dark:text-brand-50 font-bold {cls}">
	{label}
</Label>
<slot />
