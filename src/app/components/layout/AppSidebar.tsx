"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
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
import { REPORT_NAV, configNav, isNavActive, type NavItem } from "../navConfig";
import type { AuthUser } from "@/types/user";

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
	if (item.soon || !item.href) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton disabled tooltip={`${item.label} (soon)`}>
					<item.icon />
					<span>{item.label}</span>
				</SidebarMenuButton>
				<SidebarMenuBadge className="text-[9px] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
					Soon
				</SidebarMenuBadge>
			</SidebarMenuItem>
		);
	}
	return (
		<SidebarMenuItem>
			<SidebarMenuButton isActive={active} tooltip={item.label} render={<Link href={item.href} />}>
				<item.icon />
				<span>{item.label}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

export default function AppSidebar({ user }: { user: AuthUser }) {
	const pathname = usePathname();
	const config = configNav(user);

	return (
		<Sidebar collapsible="icon" variant="inset" className="no-print">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" render={<Link href="/" />}>
							<div className="hero-gradient flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
								<Landmark className="size-4" strokeWidth={2.25} />
							</div>
							<div className="grid flex-1 text-left leading-tight">
								<span className="truncate text-sm font-semibold text-sidebar-foreground">Audit Toolkit</span>
								<span className="truncate text-xs text-sidebar-foreground/60">Settlement toolkit</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Reports</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{REPORT_NAV.map((item) => (
								<NavRow key={item.label} item={item} active={isNavActive(pathname, item.href)} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>Configuration</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{config.map((item) => (
								<NavRow key={item.label} item={item} active={isNavActive(pathname, item.href)} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail className="no-print" />
		</Sidebar>
	);
}
