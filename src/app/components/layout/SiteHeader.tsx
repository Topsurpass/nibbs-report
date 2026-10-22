"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import ThemeToggle from "../ThemeToggle";
import UserMenu from "./UserMenu";
import NotificationBell from "../push/NotificationBell";
import { pageTitle } from "../navConfig";
import type { AuthUser } from "@/types/user";

interface Props {
	user: AuthUser;
	onOpenCommand: () => void;
}

export default function SiteHeader({ user, onOpenCommand }: Props) {
	const pathname = usePathname();
	const title = pageTitle(pathname, user);

	return (
		<header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur-sm transition-[width,height] sm:px-6">
			<SidebarTrigger className="-ml-1.5" />
			<Separator orientation="vertical" className="mr-1 h-4" />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage className="text-sm font-semibold text-foreground">{title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<div className="ml-auto flex items-center gap-1.5">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onOpenCommand}
					className="hidden text-muted-foreground sm:inline-flex"
				>
					<Search className="size-3.5" />
					Search
					<Kbd className="ml-1">⌘K</Kbd>
				</Button>
				<Button type="button" variant="outline" size="icon" onClick={onOpenCommand} className="sm:hidden" aria-label="Search">
					<Search className="size-4" />
				</Button>
				<NotificationBell />
				<ThemeToggle mini className="size-8 justify-center rounded-lg border border-border" />
				<UserMenu user={user} />
			</div>
		</header>
	);
}
