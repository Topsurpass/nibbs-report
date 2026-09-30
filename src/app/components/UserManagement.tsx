"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	RefreshCw,
	Loader2,
	CircleCheck,
	TriangleAlert,
	CircleX,
	Users,
	UserPlus,
	MoreHorizontal,
	ShieldCheck,
	ShieldOff,
	KeyRound,
	Trash2,
	Clock,
	UserX,
	RotateCcw,
} from "lucide-react";
import { createUserSchema, type CreateUserValues } from "@/lib/validators/user";
import type { AuthUser } from "@/types/user";
import PageHeader from "./layout/PageHeader";
import StatTile from "./layout/StatTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
	/** The signed-in admin — used to prevent deleting your own account. */
	currentUserId: string;
}

interface Banner {
	kind: "success" | "warn" | "error";
	text: string;
}

const BANNER_STYLES: Record<Banner["kind"], { wrapCls: string; textCls: string; icon: typeof CircleCheck }> = {
	success: { wrapCls: "border-brand-teal/30 bg-brand-teal/5", textCls: "text-brand-teal", icon: CircleCheck },
	warn: {
		wrapCls: "border-amber-500/30 bg-amber-500/5",
		textCls: "text-amber-700 dark:text-amber-300",
		icon: TriangleAlert,
	},
	error: { wrapCls: "border-destructive/30 bg-destructive/5", textCls: "text-destructive", icon: CircleX },
};

function initialsOf(u: AuthUser) {
	return `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() || "?";
}

/**
 * Admin-only account management (the "sign up" surface). Creating a user
 * generates a one-time password server-side and emails it; the analyst is forced
 * to change it on first login. Also lists users with reset-password and delete.
 */
export default function UserManagement({ currentUserId }: Props) {
	const [users, setUsers] = useState<AuthUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);

	const {
		register,
		handleSubmit,
		reset: resetForm,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<CreateUserValues>({
		resolver: zodResolver(createUserSchema),
		defaultValues: { firstName: "", lastName: "", email: "" },
	});

	const loadUsers = async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const res = await fetch("/api/users");
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't load users.");
			setUsers(data.users);
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : "Couldn't load users.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadUsers();
	}, []);

	const onCreate = handleSubmit(async (values) => {
		setBanner(null);
		try {
			const res = await fetch("/api/users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				if (data.errors) {
					for (const [field, msgs] of Object.entries(data.errors)) {
						setError(field as keyof CreateUserValues, {
							message: (msgs as string[])[0],
						});
					}
				} else {
					setBanner({ kind: "error", text: data.error ?? "Couldn't create the account." });
				}
				return;
			}
			setUsers((u) => [...u, data.user]);
			resetForm();
			setCreateOpen(false);
			setBanner(
				data.emailed
					? { kind: "success", text: `Account created. Credentials emailed to ${data.user.email}.` }
					: {
							kind: "warn",
							text: `Account created, but the email didn't send. Temporary password: ${data.tempPassword} — share it securely.`,
						},
			);
		} catch {
			setBanner({ kind: "error", text: "Network error. Try again." });
		}
	});

	const onReset = async (u: AuthUser) => {
		if (!window.confirm(`Reset password for ${u.email}? They'll get a new one-time password.`)) return;
		setBusyId(u.id);
		setBanner(null);
		try {
			const res = await fetch(`/api/users/${u.id}`, { method: "POST" });
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed.");
			setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, mustChangePassword: true } : x)));
			setBanner(
				data.emailed
					? { kind: "success", text: `New password emailed to ${u.email}.` }
					: {
							kind: "warn",
							text: `Password reset, but the email didn't send. Temporary password: ${data.tempPassword} — share it securely.`,
						},
			);
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Reset failed." });
		} finally {
			setBusyId(null);
		}
	};

	const onSetRole = async (u: AuthUser, role: "admin" | "analyst") => {
		const verb = role === "admin" ? "Make admin" : "Revoke admin from";
		if (!window.confirm(`${verb} ${u.email}?`)) return;
		setBusyId(u.id);
		setBanner(null);
		try {
			const res = await fetch(`/api/users/${u.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error ?? "Role update failed.");
			setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x)));
			setBanner({
				kind: "success",
				text: role === "admin" ? `${u.email} is now an admin.` : `${u.email} is no longer an admin.`,
			});
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Role update failed." });
		} finally {
			setBusyId(null);
		}
	};

	const onSetActive = async (u: AuthUser, isActive: boolean) => {
		const verb = isActive ? "Restore access for" : "Revoke access for";
		if (!window.confirm(`${verb} ${u.email}?`)) return;
		setBusyId(u.id);
		setBanner(null);
		try {
			const res = await fetch(`/api/users/${u.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isActive }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't update access.");
			setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isActive } : x)));
			setBanner({
				kind: isActive ? "success" : "warn",
				text: isActive
					? `${u.email} can sign in again.`
					: `${u.email}'s access was revoked. Their account and history are kept, but they can no longer sign in.`,
			});
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Couldn't update access." });
		} finally {
			setBusyId(null);
		}
	};

	const onDelete = async (u: AuthUser) => {
		if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
		setBusyId(u.id);
		setBanner(null);
		try {
			const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed.");
			setUsers((list) => list.filter((x) => x.id !== u.id));
			setBanner({ kind: "success", text: `Deleted ${u.email}.` });
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Delete failed." });
		} finally {
			setBusyId(null);
		}
	};

	const adminCount = users.filter((u) => u.role === "admin").length;
	const activeAdminCount = users.filter((u) => u.role === "admin" && u.isActive).length;
	const pendingCount = users.filter((u) => u.mustChangePassword && u.isActive).length;
	const revokedCount = users.filter((u) => !u.isActive).length;
	const bannerStyle = banner ? BANNER_STYLES[banner.kind] : null;
	const BannerIcon = bannerStyle?.icon;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={Users}
				eyebrow="Configuration · Admin"
				title="User Management"
				description="Create analyst accounts. The system generates a one-time password and emails it; the analyst sets their own password on first sign-in."
				actions={
					<Button type="button" onClick={() => setCreateOpen(true)}>
						<UserPlus className="size-4" />
						New analyst
					</Button>
				}
			/>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatTile icon={Users} label="Accounts" value={loading ? "—" : users.length} />
				<StatTile icon={ShieldCheck} label="Admins" value={loading ? "—" : adminCount} />
				<StatTile
					icon={Clock}
					label="Pending first login"
					value={loading ? "—" : pendingCount}
					tone={pendingCount > 0 ? "warning" : "default"}
				/>
				<StatTile
					icon={UserX}
					label="Access revoked"
					value={loading ? "—" : revokedCount}
					tone={revokedCount > 0 ? "danger" : "default"}
				/>
			</div>

			{banner && bannerStyle && BannerIcon && (
				<Alert role="alert" className={cn(bannerStyle.wrapCls, bannerStyle.textCls, "animate-in fade-in slide-in-from-top-1")}>
					<BannerIcon />
					<AlertDescription className={bannerStyle.textCls}>{banner.text}</AlertDescription>
				</Alert>
			)}

			{/* User list */}
			<Card className="gap-0 overflow-hidden py-0">
				<div className="flex items-center justify-between border-b border-border px-5 py-3">
					<div>
						<p className="text-sm font-semibold text-foreground">Accounts</p>
						<p className="text-xs text-muted-foreground">Everyone with access to the toolkit.</p>
					</div>
					<Button type="button" variant="ghost" size="sm" onClick={loadUsers} disabled={loading}>
						<RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
						Refresh
					</Button>
				</div>

				{loading ? (
					<div className="space-y-0 divide-y divide-border">
						{[0, 1, 2, 3].map((i) => (
							<div key={i} className="flex items-center gap-3 px-5 py-3.5">
								<Skeleton className="size-8 shrink-0 rounded-full" />
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3.5 w-36" />
									<Skeleton className="h-3 w-48" />
								</div>
								<Skeleton className="h-5 w-16 rounded-full" />
								<Skeleton className="h-8 w-8 rounded-md" />
							</div>
						))}
					</div>
				) : loadError ? (
					<p className="px-5 py-8 text-center text-sm text-destructive">{loadError}</p>
				) : users.length === 0 ? (
					<p className="px-5 py-8 text-center text-sm text-muted-foreground">No accounts yet.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Name</TableHead>
								<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Role</TableHead>
								<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Status</TableHead>
								<TableHead className="px-5 py-3" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.map((u, i) => (
								<TableRow
									key={u.id}
									className={cn("animate-in fade-in slide-in-from-bottom-1", !u.isActive && "bg-muted/30")}
									style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, animationFillMode: "backwards" }}
								>
									<TableCell className="px-5 py-3">
										<div className={cn("flex items-center gap-3", !u.isActive && "opacity-60")}>
											<Avatar className="size-8 shrink-0">
												<AvatarFallback
													className={cn(
														"text-xs font-bold text-white",
														u.isActive ? "bg-gradient-to-br from-brand-teal to-primary" : "bg-muted-foreground/60",
													)}
												>
													{initialsOf(u)}
												</AvatarFallback>
											</Avatar>
											<div className="min-w-0">
												<p className="truncate font-medium text-foreground">
													{u.firstName} {u.lastName}
												</p>
												<p className="truncate text-xs text-muted-foreground">{u.email}</p>
											</div>
										</div>
									</TableCell>
									<TableCell className="px-5 py-3">
										<Badge
											variant={u.role === "admin" ? "default" : "secondary"}
											className={cn(u.role === "admin" && "bg-primary/15 text-primary", !u.isActive && "opacity-60")}
										>
											{u.role}
										</Badge>
									</TableCell>
									<TableCell className="px-5 py-3">
										{!u.isActive ? (
											<span className="inline-flex items-center gap-1 font-medium text-destructive">
												<UserX className="size-3.5" />
												Access revoked
											</span>
										) : u.mustChangePassword ? (
											<span className="text-amber-700 dark:text-amber-300">Pending first login</span>
										) : (
											<span className="text-brand-teal">Active</span>
										)}
									</TableCell>
									<TableCell className="px-5 py-3 text-right">
										<DropdownMenu>
											<DropdownMenuTrigger
												render={<Button variant="ghost" size="icon-sm" disabled={busyId === u.id} />}
											>
												{busyId === u.id ? (
													<Loader2 className="size-4 animate-spin" />
												) : (
													<MoreHorizontal className="size-4" />
												)}
												<span className="sr-only">Actions for {u.email}</span>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-56">
												{u.role === "analyst" ? (
													<DropdownMenuItem onClick={() => onSetRole(u, "admin")}>
														<ShieldCheck className="size-4" />
														Make admin
													</DropdownMenuItem>
												) : (
													<DropdownMenuItem
														disabled={activeAdminCount <= 1}
														onClick={() => onSetRole(u, "analyst")}
													>
														<ShieldOff className="size-4" />
														{activeAdminCount <= 1 ? "Can't remove last admin" : "Revoke admin"}
													</DropdownMenuItem>
												)}
												<DropdownMenuItem onClick={() => onReset(u)}>
													<KeyRound className="size-4" />
													Reset password
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												{u.isActive ? (
													<DropdownMenuItem
														variant="destructive"
														disabled={u.id === currentUserId || (u.role === "admin" && activeAdminCount <= 1)}
														onClick={() => onSetActive(u, false)}
													>
														<UserX className="size-4" />
														{u.id === currentUserId
															? "That's you"
															: u.role === "admin" && activeAdminCount <= 1
																? "Can't revoke last admin"
																: "Revoke access"}
													</DropdownMenuItem>
												) : (
													<DropdownMenuItem onClick={() => onSetActive(u, true)}>
														<RotateCcw className="size-4" />
														Restore access
													</DropdownMenuItem>
												)}
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													disabled={u.id === currentUserId}
													onClick={() => onDelete(u)}
												>
													<Trash2 className="size-4" />
													{u.id === currentUserId ? "That's you" : "Delete account"}
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Card>

			{/* Create analyst — modal */}
			<Dialog
				open={createOpen}
				onOpenChange={(v) => {
					setCreateOpen(v);
					if (!v) resetForm();
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Create analyst account</DialogTitle>
						<DialogDescription>They receive an email with a temporary password and a sign-in link.</DialogDescription>
					</DialogHeader>
					<form onSubmit={onCreate} className="space-y-4" noValidate>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="firstName">First name</Label>
								<Input id="firstName" aria-invalid={!!errors.firstName} {...register("firstName")} />
								{errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="lastName">Last name</Label>
								<Input id="lastName" aria-invalid={!!errors.lastName} {...register("lastName")} />
								{errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="email">Email</Label>
							<Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
							{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting && <Loader2 className="animate-spin" />}
								{isSubmitting ? "Creating…" : "Create & email password"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
