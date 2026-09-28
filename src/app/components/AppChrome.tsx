"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	Landmark,
	Receipt,
	ClipboardList,
	ShieldAlert,
	Moon,
	Lock,
	Archive,
	Settings,
	Users,
	LogOut,
	Menu,
	ChevronsLeft,
	ChevronsRight,
	type LucideIcon,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { MasterProvider } from "./providers/MasterProvider";
import { AuditProvider } from "./providers/AuditProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MasterBank } from "@/lib/master";
import type { AuthUser } from "@/types/user";

interface NavItem {
	href?: string;
	label: string;
	icon: LucideIcon;
	soon?: boolean;
}

interface Props {
	user: AuthUser;
	initialMaster: MasterBank[];
	children: ReactNode;
}

const REPORTS: NavItem[] = [
	{ href: "/", label: "Settlement Audit", icon: Receipt },
	{ href: "/daily-reports", label: "Daily Schedule", icon: ClipboardList },
	{ href: "/escalations", label: "Fraud Escalation", icon: ShieldAlert },
	{ href: "/attendance", label: "Night Duty", icon: Moon },
	{ label: "Lien Safe", icon: Lock, soon: true },
	{ label: "Fraud Bucket", icon: Archive, soon: true },
];

/**
 * Persistent app shell: sidebar + top bar, rendered by the (app) layout so it
 * stays mounted across route changes. Wraps the routed page in the Master +
 * Audit providers, so bank data and in-progress audits survive navigation.
 * Nav uses real links; the active item follows the URL.
 */
export default function AppChrome({ user, initialMaster, children }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const [mobileOpen, setMobileOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const [signingOut, setSigningOut] = useState(false);

	const config: NavItem[] = [
		{ href: "/settings", label: "NIBBS Settings", icon: Settings },
		...(user.role === "admin"
			? [{ href: "/users", label: "User Management", icon: Users }]
			: []),
	];

	const isActive = (href?: string) => {
		if (!href) return false;
		if (href === "/") return pathname === "/";
		return pathname === href || pathname.startsWith(`${href}/`);
	};

	const currentTitle =
		[...REPORTS, ...config].find((item) => isActive(item.href))?.label ??
		"Audit Toolkit";

	const signOut = async () => {
		setSigningOut(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} finally {
			router.replace("/login");
			router.refresh();
		}
	};

	const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

	const navGroup = (title: string, items: NavItem[], mini: boolean) => (
		<div className="mb-6">
			{mini ? (
				<div className="mx-3 mb-2 border-t border-sidebar-border" />
			) : (
				<p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
					{title}
				</p>
			)}
			<nav className="space-y-1">
				{items.map((item) => {
					const active = isActive(item.href);
					const Icon = item.icon;
					const cls = cn(
						"flex w-full items-center rounded-lg text-sm font-medium transition-colors",
						mini ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
						active
							? "bg-sidebar-primary/15 text-white"
							: item.soon
								? "cursor-not-allowed text-sidebar-foreground/40"
								: "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
					);
					const inner = (
						<>
							<Icon className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
							{!mini && (
								<>
									<span className="flex-1 text-left">{item.label}</span>
									{active && <span className="size-1.5 rounded-full bg-sidebar-primary" />}
									{item.soon && (
										<Badge variant="outline" className="border-sidebar-border text-[9px] text-sidebar-foreground/50">
											Soon
										</Badge>
									)}
								</>
							)}
						</>
					);

					if (!mini) {
						return item.soon || !item.href ? (
							<button key={item.label} type="button" disabled className={cls}>
								{inner}
							</button>
						) : (
							<Link
								key={item.label}
								href={item.href}
								onClick={() => setMobileOpen(false)}
								className={cls}
							>
								{inner}
							</Link>
						);
					}

					const triggerEl =
						item.soon || !item.href ? (
							<button type="button" disabled className={cls} />
						) : (
							<Link href={item.href} onClick={() => setMobileOpen(false)} className={cls} />
						);

					return (
						<Tooltip key={item.label}>
							<TooltipTrigger render={triggerEl}>{inner}</TooltipTrigger>
							<TooltipContent side="right">
								{item.label}
								{item.soon ? " (soon)" : ""}
							</TooltipContent>
						</Tooltip>
					);
				})}
			</nav>
		</div>
	);

	const userMenu = (mini: boolean) => {
		const triggerEl = (
			<button
				type="button"
				className={cn(
					"flex items-center rounded-lg text-left transition-colors hover:bg-sidebar-accent",
					mini ? "justify-center p-1.5" : "w-full gap-2 px-2 py-2",
				)}
			/>
		);
		const content = (
			<>
				<Avatar className="size-8 shrink-0 ring-1 ring-white/10">
					<AvatarFallback className="bg-gradient-to-br from-brand-teal to-primary text-xs font-bold text-white">
						{initials || "?"}
					</AvatarFallback>
				</Avatar>
				{!mini && (
					<div className="min-w-0 flex-1">
						<p className="flex items-center gap-1 truncate text-xs font-semibold text-white">
							{user.firstName} {user.lastName}
						</p>
						<p className="truncate text-[11px] text-sidebar-foreground/60">{user.email}</p>
					</div>
				)}
			</>
		);

		return (
			<DropdownMenu>
				<DropdownMenuTrigger render={triggerEl}>{content}</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start" className="w-56">
					<DropdownMenuLabel className="flex flex-col gap-0.5">
						<span className="font-semibold text-foreground">
							{user.firstName} {user.lastName}
						</span>
						<span className="truncate font-normal text-muted-foreground">{user.email}</span>
					</DropdownMenuLabel>
					{user.role === "admin" && (
						<>
							<DropdownMenuSeparator />
							<div className="px-1.5 py-1">
								<Badge variant="secondary" className="bg-primary/10 text-primary">
									Administrator
								</Badge>
							</div>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						disabled={signingOut}
						onClick={signOut}
					>
						<LogOut className="size-4" />
						{signingOut ? "Signing out…" : "Sign out"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	const renderSidebar = (mini: boolean, showToggle: boolean) => (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<div className={cn("flex items-center py-5", mini ? "justify-center px-2" : "gap-3 px-4")}>
				<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal to-primary text-white shadow-sm">
					<Landmark className="size-5" strokeWidth={2.25} />
				</div>
				{!mini && (
					<div className="min-w-0">
						<p className="truncate text-sm font-bold leading-tight text-white">Audit Toolkit</p>
						<p className="text-[11px] text-sidebar-foreground/60">Settlement toolkit</p>
					</div>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-3 py-2">
				{navGroup("Reports", REPORTS, mini)}
				{navGroup("Configuration", config, mini)}
			</div>
			<div className="space-y-3 border-t border-sidebar-border px-3 py-3">
				{userMenu(mini)}
				<div className="border-t border-sidebar-border pt-3">
					<ThemeToggle
						mini={mini}
						className="w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					/>
					{showToggle && (
						<button
							type="button"
							onClick={() => setCollapsed((c) => !c)}
							title={mini ? "Expand sidebar" : "Collapse sidebar"}
							className={cn(
								"flex w-full items-center rounded-lg py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
								mini ? "justify-center px-0" : "gap-2 px-3",
							)}
						>
							{mini ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
							{!mini && <span>Collapse</span>}
						</button>
					)}
				</div>
			</div>
		</div>
	);

	return (
		<MasterProvider initialMaster={initialMaster}>
			<AuditProvider>
				<div className="flex min-h-full">
					{/* Desktop sidebar (collapsible to icons) */}
					<aside
						className={cn(
							"no-print sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 ease-in-out md:block",
							collapsed ? "w-16" : "w-64",
						)}
					>
						{renderSidebar(collapsed, true)}
					</aside>

					{/* Mobile drawer */}
					<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
						<SheetContent side="left" className="w-64 border-none p-0 sm:max-w-64">
							<SheetTitle className="sr-only">Navigation</SheetTitle>
							{renderSidebar(false, false)}
						</SheetContent>
					</Sheet>

					{/* Content column */}
					<div className="min-w-0 flex-1">
						<header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm sm:px-6">
							<Button
								variant="outline"
								size="icon"
								className="md:hidden"
								onClick={() => setMobileOpen(true)}
								aria-label="Open menu"
							>
								<Menu className="size-4" />
							</Button>
							<h1 className="truncate text-sm font-semibold text-foreground sm:text-base">
								{currentTitle}
							</h1>
							<div className="ml-auto flex items-center gap-2 md:hidden">
								<ThemeToggle mini className="border border-border" />
							</div>
						</header>

						{children}
					</div>
				</div>
			</AuditProvider>
		</MasterProvider>
	);
}
