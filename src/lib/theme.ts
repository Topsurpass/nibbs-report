// Theme resolution — pure, deterministic. No DOM, no React.
// The one latent-free source of truth for "which theme should be active".

export type Theme = "light" | "dark";
export type ThemeChoice = Theme | "system";

export const THEME_STORAGE_KEY = "nibbs-theme";

/** True when the stored value is a real user choice we should honor. */
export function isTheme(value: unknown): value is Theme {
	return value === "light" || value === "dark";
}

/**
 * Resolve the active theme from a stored value and the system preference.
 * Stored light/dark always wins; anything else (null, "system", garbage)
 * falls back to what the OS asks for.
 */
export function resolveTheme(
	stored: string | null | undefined,
	systemPrefersDark: boolean,
): Theme {
	if (isTheme(stored)) return stored;
	return systemPrefersDark ? "dark" : "light";
}

/** The opposite theme — used by the toggle. */
export function nextTheme(current: Theme): Theme {
	return current === "dark" ? "light" : "dark";
}

/**
 * Inline script injected into <head> to set the theme class before first
 * paint, killing the light/dark flash on load. Stringified so it can run
 * synchronously before React hydrates. Keep it dependency-free.
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(
	THEME_STORAGE_KEY,
)};var s=localStorage.getItem(k);var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=(s==="light"||s==="dark")?s:(m?"dark":"light");var e=document.documentElement;e.classList.toggle("dark",t==="dark");e.style.colorScheme=t;}catch(_){}})();`;
