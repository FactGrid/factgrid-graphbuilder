<script lang="ts">
    import IconEx from "./IconEx.svelte";
    import MultilineField from "./MultilineField.svelte";
    import { mdiAlertCircleOutline, mdiPencil } from "@mdi/js";
    import { createEventDispatcher, tick } from "svelte";
    import { useActions } from "svelte-useactions";
    import type { ActionList } from "svelte-useactions";
    import type { HTMLTextareaAttributes } from "svelte/elements";
    import { browser } from "$app/environment";
    import { getid } from "./utils";

    interface $$Props extends HTMLTextareaAttributes {
        value?: string | undefined;
        ignoreKeyboardEvents?: boolean;
        use?: ActionList<HTMLOutputElement>;
        id?: string | undefined;
        placeholder?: string | undefined;
        class?: string | undefined;
        edit?: boolean;
        multiline?: boolean;
    }

    export let use: ActionList<HTMLOutputElement> = [];

    let cls: string | undefined = "";
    export { cls as class };

    export let id = getid();
    export let value: string | undefined = undefined;
    export let placeholder: string | undefined = "Click to set";
    export let ignoreKeyboardEvents: boolean = false;
    export const required: boolean = false;
    export let edit = false;
    export let multiline = false;

    let invalid = false;
    let editRef: MultilineField;
    let originalValue: string | undefined;

    const dispatch = createEventDispatcher();

    $: onEditChange(edit);

    const onEditChange = async (edit: boolean) => {
        if (!browser) {
            return;
        }

        if (edit) {
            originalValue = value;
            await tick();
            editRef.focus();
        } else {
            editRef?.blur();
        }
    };

    const enterEditMode = (event: MouseEvent | KeyboardEvent | FocusEvent) => {
        if (edit) {
            return;
        }

        if (event instanceof KeyboardEvent) {
            if (
                event.key === " " ||
                event.key === "Enter" ||
                event.key === "Spacebar"
            ) {
                event.preventDefault();
                event.stopPropagation();
                edit = true;
            }
        } else {
            edit = true;
        }
    };

    const onBlur = (event: FocusEvent) => {
        if (value !== originalValue) {
            dispatch("change");
        }

        edit = false;
    };

    const onKeydown = (event: KeyboardEvent) => {
        if (ignoreKeyboardEvents) {
            return;
        }

        if (event.key === "Enter") {
            if (!multiline || event.ctrlKey) {
                edit = false;
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }

        if (event.key === "Escape") {
            if (!multiline) {
                value = originalValue;
            }
            edit = false;
            event.stopPropagation();
            return;
        }
    };

    const onInput = () => {
        if (!multiline) {
            value = value!.replaceAll("\n", "");
        }
    };
</script>

<output
    role="button"
    use:useActions={use}
    class="flex items-center h-9 w-full transition-colors rounded-md border cursor-text px-3 py-2
    text-sm text-brand-900 dark:text-brand-100 selection:text-white selection:bg-brand-400/70
    bg-white dark:bg-brand-900
    {invalid
        ? 'border-red-500'
        : 'border-brand-300 dark:border-brand-600 hover:border-brand-400 dark:hover:border-brand-500'}
    focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15
    {cls}"
    on:click={enterEditMode}
    on:keydown={enterEditMode}
    on:focus={enterEditMode}
    aria-label="Edit"
    {id}
    tabindex={edit ? -1 : 0}
>
    {#if edit}
        <MultilineField
            bind:this={editRef}
            class="grow min-h-[1.25rem]
            border-none w-full focus:outline-none focus:ring-0 bg-transparent"
            {...$$restProps}
            on:keydown={onKeydown}
            on:blur={onBlur}
            on:input={onInput}
            on:input
            on:blur
            on:keydown
            bind:value
            id="field-{id}"
            aria-multiline={multiline}
            aria-labelledby="label-{id}"
        />
        {#if invalid}
            <IconEx
                path={mdiAlertCircleOutline}
                class="flex-none w-5 h-5 mx-1 fill-red-500"
            />
        {/if}
    {:else}
        <div
            class="min-h-[1.25rem] h-full break-words [word-break:break-word] whitespace-pre-wrap"
        >
            {#if !value}
                <span class="italic text-brand-400 dark:text-brand-500">
                    {placeholder}
                </span>
            {:else}
                <slot>{value + "\n"}</slot>
            {/if}
        </div>
        <button tabindex="-1" class="block min-w-[1rem] grow cursor-text">
            &nbsp;
        </button>
    {/if}
    <slot name="editbuttons" />
</output>
