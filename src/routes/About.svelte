<script lang="ts">
    import { mdiArrowTopRightThin } from "@mdi/js";
    import IconEx from "$lib/components/common/IconEx.svelte";

    const link = (params: Record<string, string>) =>
        "?" + new URLSearchParams(params).toString();

    const examples = {
        "State-organization Duchy Saxe-Gotha-Altenburg (organisation chart)": {
            item: "Q40154",
            property: "P428",
            mode: "reverse",
            graph_direction: "left",
            lang: "de",
        },
        "State-organization Duchy Saxe-Gotha-Altenburg with number of employees":
            {
                item: "Q40154",
                property: "P428",
                mode: "reverse",
                size_property: "P315",
                lang: "de",
            },
        "Pedigree of Duke Ernst II of Saxe-Gotha-Altenburg": {
            item: "Q978",
            property: "P150",
            mode: "reverse",
            graph_direction: "down",
        },
        "Continuing font grades from Cicero, sized by point value": {
            item: "Q1194171",
            property: "P6",
            mode: "both",
            unit_property: "P834",
            lang: "de",
        },
        "OhdAB-Taxonomy of Speculoos baker": {
            property: "P1007",
            item: "Q673131",
            graph_direction: "up",
        },
        "Whole OhdAB-Dataset (large Graph)": {
            property: "P1007",
            item: "Q657045",
            mode: "reverse",
        },
    };
</script>

<div>
    <h2 class="text-2xl font-semibold mb-3">Tool description</h2>
    <p class="leading-relaxed">
        Create hierarchical visualisations directly from FactGrid. Data entered
        is retrieved in real time via the
        <a href="https://database.factgrid.de/wiki/Main_Page">FactGrid</a>
        <a href="https://database.factgrid.de/query/">Query Service</a>. Use
        directed graphs, for example, for family trees, organisation charts or
        taxonomies.
    </p>

    <h2 class="text-2xl font-semibold mt-12 mb-3">Examples</h2>
    <ul>
        {#each Object.entries(examples) as [name, params]}
            <li>
                <a href={link(params)} class="example-link">
                    <span>{name}</span>
                    <IconEx
                        path={mdiArrowTopRightThin}
                        class="inline w-3.5 h-3.5 align-text-top fill-current no-underline"
                    />
                </a>
            </li>
        {/each}
    </ul>
    <p class="text-sm mt-8">
        The source code is released under
        <a href="https://opensource.org/licenses/MIT">MIT license </a>
        at
        <a href="https://github.com/FactGrid/factgrid-graphbuilder"> GitHub</a>.
        Originally created by
        <a href="https://angryloki.github.io/wikidata-graph-builder/">
            angryloki
        </a>. Designed, adapted and expanded by
        <a href="https://github.com/vonmitzscha">vonMitzscha </a> for FactGrid.
    </p>
</div>

<style lang="postcss">
    @reference '../app.css';

    a {
        @apply text-brand-800 dark:text-brand-200 underline decoration-brand-300 dark:decoration-brand-600 underline-offset-2 hover:decoration-brand-500 dark:hover:decoration-brand-400;
    }

    a.example-link {
        @apply no-underline;
    }

    a.example-link span {
        @apply underline decoration-brand-300 dark:decoration-brand-600 underline-offset-2;
    }

    p {
        @apply mb-3 text-brand-700 dark:text-brand-300;
    }

    ul {
        @apply ml-4 mb-3 list-disc list-inside;
    }

    li {
        @apply mb-2;
    }
</style>
