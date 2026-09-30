"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, SunMoon } from "lucide-react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { REPORT_NAV, configNav } from "./navConfig";
import { useTheme } from "@/hooks/useTheme";
import type { AuthUser } from "@/types/user";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: AuthUser;
}

/** Global ⌘K / Ctrl+K quick-jump, opened from the header search button or the
 * shortcut itself. Mirrors the sidebar's own nav list so the two never disagree. */
export default function CommandMenu({ open, onOpenChange, user }: Props) {
	const router = useRouter();
	const { toggle } = useTheme();

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				onOpenChange(!open);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onOpenChange]);

	const go = useCallback(
		(href: string) => {
			onOpenChange(false);
			router.push(href);
		},
		[onOpenChange, router],
	);

	const signOut = useCallback(async () => {
		onOpenChange(false);
		await fetch("/api/auth/logout", { method: "POST" });
		router.replace("/login");
		router.refresh();
	}, [onOpenChange, router]);

	return (
		<CommandDialog open={open} onOpenChange={onOpenChange} title="Quick jump" description="Jump to a screen or run an action">
			<CommandInput placeholder="Jump to a screen or run a command…" />
			<CommandList>
				<CommandEmpty>No matches.</CommandEmpty>
				<CommandGroup heading="Reports">
					{REPORT_NAV.filter((item) => item.href).map((item) => (
						<CommandItem key={item.label} value={item.label} disabled={item.soon} onSelect={() => go(item.href!)}>
							<item.icon />
							{item.label}
						</CommandItem>
					))}
				</CommandGroup>
				<CommandGroup heading="Configuration">
					{configNav(user).map((item) => (
						<CommandItem key={item.label} value={item.label} onSelect={() => go(item.href!)}>
							<item.icon />
							{item.label}
						</CommandItem>
					))}
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading="General">
					<CommandItem value="Toggle theme" onSelect={() => toggle()}>
						<SunMoon />
						Toggle light / dark
					</CommandItem>
					<CommandItem value="Sign out" onSelect={() => void signOut()}>
						<LogOut />
						Sign out
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
