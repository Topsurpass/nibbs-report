import {
	Receipt,
	CalendarRange,
	ClipboardList,
	ShieldAlert,
	CalendarClock,
	Lock,
	Archive,
	Settings,
	Users,
	type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@/types/user";

export interface NavItem {
	href?: string;
	label: string;
	icon: LucideIcon;
	soon?: boolean;
}

export interface NavSection {
	label: string;
	items: NavItem[];
}

/** Primary nav, grouped the way the team works. Shared by the sidebar and the
 * command palette, so the two can never drift apart. */
export const NAV_SECTIONS: NavSection[] = [
	{
		label: "Settlement",
		items: [
			{ href: "/", label: "Settlement Audit", icon: Receipt },
			{ href: "/weekend-settlement", label: "Weekend Settlement", icon: CalendarRange },
		],
	},
	{
		label: "Operations",
		items: [
			{ href: "/daily-reports", label: "Daily Schedule", icon: ClipboardList },
			{ href: "/escalations", label: "Fraud Escalation", icon: ShieldAlert },
			{ href: "/attendance", label: "Duty Register", icon: CalendarClock },
		],
	},
	{
		label: "Coming soon",
		items: [
			{ label: "Lien Safe", icon: Lock, soon: true },
			{ label: "Fraud Bucket", icon: Archive, soon: true },
		],
	},
];

/** Every primary nav item, flat. */
export const REPORT_NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function configNav(user: AuthUser): NavItem[] {
	return [
		{ href: "/settings", label: "NIBBS Settings", icon: Settings },
		...(user.role === "admin" ? [{ href: "/users", label: "User Management", icon: Users }] : []),
	];
}

export function isNavActive(pathname: string, href?: string): boolean {
	if (!href) return false;
	if (href === "/") return pathname === "/";
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string, user: AuthUser): string {
	const all = [...REPORT_NAV, ...configNav(user)];
	return all.find((item) => isNavActive(pathname, item.href))?.label ?? "Audit Toolkit";
}
