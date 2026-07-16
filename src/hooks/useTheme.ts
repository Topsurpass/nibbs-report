"use client";

import { useCallback, useEffect, useState } from "react";
import {
	nextTheme,
	resolveTheme,
	THEME_STORAGE_KEY,
	type Theme,
} from "@/lib/theme";

/** Apply a theme to the document: toggle the `dark` class and color-scheme. */
function applyTheme(theme: Theme) {
	const el = document.documentElement;
	el.classList.toggle("dark", theme === "dark");
	el.style.colorScheme = theme;
}

interface UseThemeResult {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggle: () => void;
	/** False until mounted — guards against SSR/hydration mismatch. */
	mounted: boolean;
}

/**
 * Reads the persisted theme (falling back to system preference), keeps the
 * document class in sync, and persists explicit choices to localStorage.
 * The inline script in <head> handles first paint; this hook owns runtime.
 */
export function useTheme(): UseThemeResult {
	const [theme, setThemeState] = useState<Theme>("light");
	const [mounted, setMounted] = useState(false);

	// Hydrate from storage + system on mount (matches the pre-paint script).
	useEffect(() => {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		const systemDark = window.matchMedia(
			"(prefers-color-scheme: dark)",
		).matches;
		/* eslint-disable react-hooks/set-state-in-effect */
		setThemeState(resolveTheme(stored, systemDark));
		setMounted(true);
		/* eslint-enable react-hooks/set-state-in-effect */
	}, []);

	// Follow the OS only while the user hasn't made an explicit choice.
	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = (e: MediaQueryListEvent) => {
			if (localStorage.getItem(THEME_STORAGE_KEY)) return;
			const next: Theme = e.matches ? "dark" : "light";
			setThemeState(next);
			applyTheme(next);
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next);
		applyTheme(next);
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Private mode / storage disabled — theme still applies for the session.
		}
	}, []);

	const toggle = useCallback(() => {
		setThemeState((current) => {
			const next = nextTheme(current);
			applyTheme(next);
			try {
				localStorage.setItem(THEME_STORAGE_KEY, next);
			} catch {
				// no-op
			}
			return next;
		});
	}, []);

	return { theme, setTheme, toggle, mounted };
}
