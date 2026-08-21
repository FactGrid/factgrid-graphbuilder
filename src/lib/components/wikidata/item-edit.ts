import type {
	AutocompleteItem, AutocompleteResult, LangValue, LoadMoreFunction, ValueItem,
} from '../common/autocomplete-input';
import {MwApiService} from '$lib/mw-api-service';
import {QueryService} from '$lib/query-service';
import type {WikibaseEntityCommon} from '$lib/wdtypes';

export type ValueType = 'property' | 'item';

const instanceOfProperty = 'P2';

const getInstanceOfLabels = async (ids: string[], language: string, abortSignal: AbortSignal): Promise<Record<string, string>> => {
	if (ids.length === 0) {
		return {};
	}

	const values = ids.map(id => `wd:${id}`).join(' ');
	const languageParameter = language === 'en' ? 'en' : `${language},en`;
	const query = `\
SELECT ?item ?typeLabel WHERE {
  VALUES ?item { ${values} }
  ?item wdt:${instanceOfProperty} ?type .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${languageParameter}" }
}`;

	const queryService = QueryService.getInstance();
	const rows = await queryService.getFlat(query, {signal: abortSignal});

	const labels: Record<string, string> = {};
	for (const row of rows) {
		const id = row.item.split('/').pop()!;
		if (!labels[id]) {
			labels[id] = row.typeLabel;
		}
	}

	return labels;
};

// eslint-disable-next-line max-params
export const searchEntities = async (type: ValueType, search: string, language: string | undefined, abortSignal: AbortSignal, after?: number, datatype?: string): Promise<AutocompleteResult> => {
	if (language === undefined) {
		language = 'en';
	}

	let autocompleteItems: AutocompleteItem[] | undefined = [];
	let loadMore: LoadMoreFunction;

	if (search.length === 0) {
		return {autocompleteItems, loadMore};
	}

	const query: Record<string, any> = {
		action: 'wbsearchentities',
		type: type as string,
		search,
		language,
		uselang: language,
	};

	if (after) {
		query.continue = after;
	}

	const wikidataClient = MwApiService.getInstance({
		server: 'https://database.factgrid.de',
	});

	type SearchResult = {
		id: string;
		title: string;
		pageid: number;
		display: {
			label?: LangValue;
			description?: LangValue;
		};
		repository: string;
		url: string;
		datatype: string;
		concepturi: string;
		label: string;
		description: string;
		match: {
			language: string;
			text: string;
			type: string;
		};
		aliases: string[];
	};

	type SearchResults = {
		search: SearchResult[];
		'search-continue'?: number;
		searchinfo: {search: string};
		success: 1;
	};

	const resp = (await wikidataClient.call(query, {signal: abortSignal})) as SearchResults;
	const searchResults = datatype ? resp.search.filter(item => item.datatype === datatype) : resp.search;
	autocompleteItems = searchResults.map(item => ({
		value: {
			id: item.id,
			label: item.display.label,
			description: item.display.description,
			language,
		},
		match: item.match,
	}));

	if (type === 'item' && autocompleteItems.length > 0) {
		try {
			const instanceOfLabels = await getInstanceOfLabels(autocompleteItems.map(item => item.value.id), language, abortSignal);
			autocompleteItems = autocompleteItems.map(item => ({
				...item,
				value: {...item.value, instanceOf: instanceOfLabels[item.value.id]},
			}));
		} catch (error_: unknown) {
			if ((error_ as Error).name !== 'AbortError') {
				throw error_;
			}
		}
	}

	if (resp['search-continue']) {
		loadMore = async (abortSignal: AbortSignal) => searchEntities(type, search, language, abortSignal, resp['search-continue'], datatype);
	}

	return {
		autocompleteItems,
		loadMore,
	};
};

export const getEntity = async (id: string, language: string | undefined, abortSignal: AbortSignal): Promise<ValueItem | undefined> => {
	if (language === undefined) {
		language = 'en';
	}

	type WbGetEntitiesResultMissing = {
		id: string;
		missing: '';
	};

	type WbGetEntitiesResult = {
		entities: Record<string, WikibaseEntityCommon | WbGetEntitiesResultMissing>;
	};

	const parameters = {
		action: 'wbgetentities',
		ids: id,
		languages: language,
		props: ['labels', 'descriptions'],
		languagefallback: true,
	};

	const wikidataClient = MwApiService.getInstance({
		server: 'https://database.factgrid.de',
	});

	const response = (await wikidataClient.call(parameters, {signal: abortSignal})) as WbGetEntitiesResult;
	if (!response.entities) {
		return;
	}

	if ((response.entities[id] as WbGetEntitiesResultMissing).missing) {
		return;
	}

	const result = response.entities[id] as WikibaseEntityCommon;

	return {
		id: result.id,
		label: result.labels[language],
		description: result.labels[language],
		language,
	};
};
