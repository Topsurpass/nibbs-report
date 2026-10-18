"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, configNav, isNavActive, type NavItem, type NavSection } from "../navConfig";
import type { AuthUser } from "@/types/user";

/**
 * Roomy rows (40px) with a clear active state: tinted background, brand icon
 * and a left indicator bar. Overrides ride on className so components/ui stays
 * untouched; icon-collapsed mode keeps the primitive's square button.
 */
const ROW_CLS = cn(
	"relative h-10 gap-3 rounded-lg px-3 text-[13.5px] font-medium text-sidebar-foreground/80 transition-colors",
	"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
	"[&_svg]:size-[18px] [&_svg]:text-sidebar-foreground/55 hover:[&_svg]:text-sidebar-accent-foreground",
	"data-active:bg-sidebar-primary/10 data-active:text-sidebar-accent-foreground data-active:[&_svg]:text-sidebar-ring dark:data-active:bg-sidebar-primary/15",
	"before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-sidebar-ring before:opacity-0 before:transition-opacity data-active:before:opacity-100",
	"group-data-[collapsible=icon]:before:hidden",
);

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
	if (item.soon || !item.href) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton disabled tooltip={`${item.label} (soon)`} className={cn(ROW_CLS, "opacity-60")}>
					<item.icon />
					<span>{item.label}</span>
				</SidebarMenuButton>
				<SidebarMenuBadge className="top-2.5! right-2 rounded-full bg-sidebar-accent px-1.5 text-[9px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
					Soon
				</SidebarMenuBadge>
			</SidebarMenuItem>
		);
	}
	return (
		<SidebarMenuItem>
			<SidebarMenuButton isActive={active} tooltip={item.label} className={ROW_CLS} render={<Link href={item.href} />}>
				<item.icon />
				<span>{item.label}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function NavGroup({ section, pathname }: { section: NavSection; pathname: string }) {
	return (
		<SidebarGroup className="px-3 py-2">
			<SidebarGroupLabel className="mb-1 h-6 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">
				{section.label}
			</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu className="gap-1.5">
					{section.items.map((item) => (
						<NavRow key={item.label} item={item} active={isNavActive(pathname, item.href)} />
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function initials(user: AuthUser): string {
	return `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || user.email[0].toUpperCase();
}

export default function AppSidebar({ user }: { user: AuthUser }) {
	const pathname = usePathname();
	const sections: NavSection[] = [...NAV_SECTIONS, { label: "Configuration", items: configNav(user) }];

	return (
		<Sidebar collapsible="icon" variant="inset" className="no-print">
			{/* Same height as SiteHeader (h-14) with a full-bleed bottom border, so the
			    line under the logo continues the top bar's border on the same row. */}
			<SidebarHeader className="-mx-2 h-14 justify-center border-b border-sidebar-border px-5 py-0 group-data-[collapsible=icon]:px-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" className="h-11 rounded-xl hover:bg-sidebar-accent" render={<Link href="/" />}>
							<div className="hero-gradient flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-sidebar-primary/30">
								<Landmark className="size-[18px]" strokeWidth={2.25} />
							</div>
							<div className="grid flex-1 text-left leading-tight">
								<span className="truncate text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">Audit Toolkit</span>
								<span className="truncate text-xs text-sidebar-foreground/55">NIBBS settlement</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent className="gap-3 py-3">
				{sections.map((section) => (
					<NavGroup key={section.label} section={section} pathname={pathname} />
				))}
			</SidebarContent>

			<SidebarFooter className="px-3 pb-4">
				<div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-xs font-semibold text-sidebar-ring">
						{initials(user)}
					</div>
					<div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
						<p className="truncate text-sm font-medium text-sidebar-accent-foreground">
							{user.firstName} {user.lastName}
						</p>
						<p className="truncate text-xs capitalize text-sidebar-foreground/55">{user.role}</p>
					</div>
				</div>
			</SidebarFooter>
			<SidebarRail className="no-print" />
		</Sidebar>
	);
}
