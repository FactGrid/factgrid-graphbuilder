<script lang="ts">
    import IntersectionObserver from "svelte-intersection-observer";
    import { Input } from "$lib/components/ui/input/index.js";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import AutocompleteItemBlock from "./AutocompleteItemBlock.svelte";
    import { tick } from "svelte";
    import type {
        AutocompleteFunction,
        AutocompleteItem,
        LoadMoreFunction,
        ResolveFunction,
        ValueItem,
    } from "./autocomplete-input";

    let cls = "";
    export { cls as class };

    export let value: string | undefined = undefined;
    export let valueObject: ValueItem | undefined = undefined;

    export let id: string | undefined = undefined;
    export let placeholder = "Click to set";
    export let autocomplete: AutocompleteFunction;
    export let resolve: ResolveFunction;
    export let language: string | undefined = undefined;

    let inputRef: HTMLInputElement | null = null;
    let loadMoreAreaRef: HTMLDivElement;
    let listRef: HTMLDivElement | null = null;
    let loadMoreAreaVisible = false;
    let fieldValue: string | undefined;

    let autocompleteItems: AutocompleteItem[] | undefined;
    let loadMore: LoadMoreFunction;
    let open = false;

    let abortController: AbortController | undefined;
    let resolveAbortController: AbortController | undefined;

    let activeAutocompleteItem = 0;

    $: onValueUpdate(value, resolve);

    const onValueUpdate = async (
        value: string | undefined,
        resolve: ResolveFunction
    ) => {
        if (value === undefined) {
            valueObject = undefined;
            return;
        }

        if (value === valueObject?.id && language === valueObject.language) {
            return;
        }

        valueObject = undefined;

        resolveAbortController?.abort();
        resolveAbortController = new AbortController();
        try {
            valueObject = await resolve(value, resolveAbortController.signal);
        } catch (error_: unknown) {
            if ((error_ as Error).name !== "AbortError") {
                throw error_;
            }
            return;
        } finally {
            resolveAbortController = undefined;
        }

        if (valueObject === undefined) {
            value = undefined;
        }
    };

    const abort = () => {
        if (abortController) {
            abortController.abort();
            abortController = undefined;
        }
    };

    const labelFn = (value: ValueItem) => {
        return value?.label?.value ?? value?.id;
    };

    const updateFieldValue = (valueObject: ValueItem | undefined) => {
        fieldValue = valueObject ? labelFn(valueObject) : value;
    };

    $: updateFieldValue(valueObject);

    const acceptItem = (newValue: ValueItem | undefined) => {
        abort();
        autocompleteItems = loadMore = undefined;
        open = false;
        if (valueObject?.id !== newValue?.id) {
            value = newValue?.id;
            valueObject = newValue;
        }
    };

    const onBlur = () => {
        abort();
        if (!fieldValue) {
            acceptItem(undefined);
        }
        updateFieldValue(valueObject);
        autocompleteItems = undefined;
        loadMore = undefined;
        open = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (!autocompleteItems) {
            if (event.key === "Enter") {
                if (!fieldValue) {
                    acceptItem(undefined);
                } else if (valueObject && fieldValue === labelFn(valueObject)) {
                    acceptItem(valueObject);
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.key === "Escape") {
                acceptItem(valueObject);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            return;
        }

        if (event.key === "ArrowUp") {
            if (activeAutocompleteItem > 0) {
                activeAutocompleteItem = activeAutocompleteItem - 1;
            }
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event.key === "ArrowDown") {
            if (activeAutocompleteItem < autocompleteItems.length - 1) {
                activeAutocompleteItem = activeAutocompleteItem + 1;
            }
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event.key === "Enter") {
            if (activeAutocompleteItem < autocompleteItems.length) {
                acceptItem(autocompleteItems[activeAutocompleteItem].value);
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            onBlur();
            return;
        }
    };

    const onInput = async () => {
        abort();

        if (!fieldValue) {
            autocompleteItems = loadMore = undefined;
            open = false;
            return;
        }

        try {
            abortController = new AbortController();
            ({ autocompleteItems, loadMore } = await autocomplete(
                fieldValue,
                abortController.signal
            ));
            activeAutocompleteItem = 0;
            open = true;
        } catch (error_: unknown) {
            if ((error_ as Error).name !== "AbortError") {
                throw error_;
            }
            return;
        } finally {
            abortController = undefined;
        }
    };

    const onLoadMore = async () => {
        if (!loadMore) {
            return;
        }
        const load = loadMore;
        loadMore = undefined;

        let newAutocompleteItems: AutocompleteItem[] = [];

        abort();
        abortController = new AbortController();
        try {
            ({ autocompleteItems: newAutocompleteItems, loadMore } = await load(
                abortController.signal
            ));
        } catch (error_: unknown) {
            if ((error_ as Error).name !== "AbortError") {
                throw error_;
            }
            return;
        } finally {
            abortController = undefined;
        }

        const existingItems = new Set(
            autocompleteItems!.map((item) => item.value.id)
        );

        newAutocompleteItems = newAutocompleteItems.filter(
            (item) => !existingItems.has(item.value.id)
        );

        const originalScroll = listRef?.scrollTop ?? 0;
        autocompleteItems = [...autocompleteItems!, ...newAutocompleteItems];
        await tick();
        if (listRef) {
            listRef.scrollTop = originalScroll;
        }
    };
</script>

<Popover.Root bind:open>
    <div class="relative flex items-center gap-1">
        <Input
            bind:ref={inputRef}
            {id}
            bind:value={fieldValue}
            onkeydown={onKeyDown}
            oninput={onInput}
            onblur={onBlur}
            class={cls}
            {placeholder}
            spellcheck="false"
            aria-haspopup="listbox"
            autocapitalize="none"
            autocomplete="off"
            {...{ autocorrect: "off" }}
            role="combobox"
            aria-expanded={open}
            aria-controls="listbox-{id}"
            aria-activedescendant={autocompleteItems
                ? `option-${id}-${activeAutocompleteItem}`
                : undefined}
            aria-autocomplete="list"
        />
        <slot name="action" />
    </div>

    <Popover.Content
        customAnchor={inputRef}
        onOpenAutoFocus={(event) => event.preventDefault()}
        align="start"
        class="w-[max(var(--bits-floating-anchor-width),20rem)] max-w-[calc(100vw-2rem)] max-h-[400px] overflow-auto p-1
        scrollbar-thin scrollbar-track-transparent scrollbar-thumb-brand-300 dark:scrollbar-thumb-brand-700"
        bind:ref={listRef}
        id="listbox-{id}"
        role="listbox"
        aria-labelledby="label-{id}"
    >
        {#if autocompleteItems?.length}
            <div class="relative">
                <IntersectionObserver
                    element={loadMoreAreaRef}
                    bind:intersecting={loadMoreAreaVisible}
                    onintersect={onLoadMore}
                >
                    <div
                        bind:this={loadMoreAreaRef}
                        class="h-16 absolute bottom-0 left-0 right-0 pointer-events-none"
                    />
                </IntersectionObserver>

                {#each autocompleteItems as item, idx (item.value.id)}
                    <AutocompleteItemBlock
                        id="option-{id}-{idx}"
                        {item}
                        active={idx === activeAutocompleteItem}
                        on:mouseenter={() => {
                            activeAutocompleteItem = idx;
                        }}
                        on:click={() => {
                            acceptItem(item.value);
                        }}
                    />
                {/each}
            </div>
        {:else}
            <div class="text-brand-500 dark:text-brand-400 px-2 py-1">No items found</div>
        {/if}
    </Popover.Content>
</Popover.Root>
