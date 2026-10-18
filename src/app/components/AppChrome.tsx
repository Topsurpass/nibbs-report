"use client";

import { useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "./layout/AppSidebar";
import SiteHeader from "./layout/SiteHeader";
import CommandMenu from "./CommandMenu";
import ShiftReminder from "./attendance/ShiftReminder";
import { MasterProvider } from "./providers/MasterProvider";
import { AuditProvider } from "./providers/AuditProvider";
import { WeekendMergeProvider } from "./providers/WeekendMergeProvider";
import type { MasterBank } from "@/lib/master";
import type { AuthUser } from "@/types/user";

interface Props {
	user: AuthUser;
	initialMaster: MasterBank[];
	children: ReactNode;
}

/**
 * Persistent app shell, rendered by the (app) layout so it stays mounted
 * across route changes. Built on shadcn's Sidebar primitive with the "inset"
 * variant: the dark sidebar chrome surrounds a lighter, elevated content
 * card rather than content running flush edge-to-edge. Wraps the routed page
 * in the Master, Audit and WeekendMerge providers, so bank data and in-progress
 * work survive navigation.
 */
export default function AppChrome({ user, initialMaster, children }: Props) {
	const [commandOpen, setCommandOpen] = useState(false);

	return (
		<MasterProvider initialMaster={initialMaster}>
			<AuditProvider>
				<WeekendMergeProvider>
					<SidebarProvider>
						<AppSidebar user={user} />
						<SidebarInset>
							<SiteHeader user={user} onOpenCommand={() => setCommandOpen(true)} />
							<div className="flex flex-1 flex-col">{children}</div>
						</SidebarInset>
					</SidebarProvider>
					<CommandMenu open={commandOpen} onOpenChange={setCommandOpen} user={user} />
					<ShiftReminder userId={user.id} />
				</WeekendMergeProvider>
			</AuditProvider>
		</MasterProvider>
	);
}
