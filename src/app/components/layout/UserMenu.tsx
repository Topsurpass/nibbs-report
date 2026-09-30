"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthUser } from "@/types/user";

export default function UserMenu({ user }: { user: AuthUser }) {
	const router = useRouter();
	const [signingOut, setSigningOut] = useState(false);

	const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

	const signOut = async () => {
		setSigningOut(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} finally {
			router.replace("/login");
			router.refresh();
		}
	};

	const triggerEl = <button type="button" className="rounded-full outline-none ring-primary/40 focus-visible:ring-2" />;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={triggerEl}>
				<Avatar className="size-8 cursor-pointer ring-1 ring-border transition-shadow hover:ring-primary/40">
					<AvatarFallback className="bg-gradient-to-br from-brand-teal to-primary text-xs font-bold text-white">
						{initials || "?"}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="bottom" align="end" className="w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="flex flex-col gap-0.5">
						<span className="font-semibold text-foreground">
							{user.firstName} {user.lastName}
						</span>
						<span className="truncate font-normal text-muted-foreground">{user.email}</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
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
				<DropdownMenuItem variant="destructive" disabled={signingOut} onClick={() => void signOut()}>
					<LogOut className="size-4" />
					{signingOut ? "Signing out…" : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
