import {browser} from '$app/environment';
import {writable} from 'svelte/store';

export type Theme = 'light' | 'dark';

const storageKey = 'factgrid-graphbuilder-theme';

const getInitialTheme = (): Theme => {
	if (!browser) {
		return 'light';
	}

	const stored = localStorage.getItem(storageKey);
	if (stored === 'light' || stored === 'dark') {
		return stored;
	}

	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme: Theme) => {
	if (!browser) {
		return;
	}

	document.documentElement.classList.toggle('dark', theme === 'dark');
	localStorage.setItem(storageKey, theme);
};

export const theme = writable<Theme>(getInitialTheme());

theme.subscribe(applyTheme);

export const toggleTheme = () => {
	theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
};
