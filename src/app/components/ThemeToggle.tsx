"use client";

import { useTheme } from "@/hooks/useTheme";

interface ThemeToggleProps {
	/** Icon-only rendering for the collapsed sidebar / tight spaces. */
	mini?: boolean;
	className?: string;
}

/** Sun/moon button that flips between light and dark. */
export default function ThemeToggle({ mini = false, className }: ThemeToggleProps) {
	const { theme, toggle, mounted } = useTheme();
	const isDark = theme === "dark";
	// Before mount we don't know the resolved theme; render a stable placeholder
	// so the markup matches SSR and there's no icon flicker.
	const label = !mounted
		? "Toggle theme"
		: isDark
			? "Switch to light mode"
			: "Switch to dark mode";

	return (
		<button
			type="button"
			onClick={toggle}
			title={label}
			aria-label={label}
			className={`flex items-center rounded-lg text-sm font-medium text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
				mini ? "justify-center px-0 py-2" : "gap-2 px-3 py-2"
			} ${className ?? ""}`}
		>
			<span className="text-base leading-none" aria-hidden suppressHydrationWarning>
				{mounted ? (isDark ? "☀️" : "🌙") : "🌓"}
			</span>
			{!mini && (
				<span suppressHydrationWarning>
					{mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
				</span>
			)}
		</button>
	);
}
