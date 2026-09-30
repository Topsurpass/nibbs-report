"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, Loader2, CircleCheck, TriangleAlert, CircleX, Users } from "lucide-react";
import { createUserSchema, type CreateUserValues } from "@/lib/validators/user";
import type { AuthUser } from "@/types/user";
import PageHeader from "./layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
	const bannerStyle = banner ? BANNER_STYLES[banner.kind] : null;
	const BannerIcon = bannerStyle?.icon;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={Users}
				eyebrow="Configuration · Admin"
				title="User Management"
				description="Create analyst accounts. The system generates a one-time password and emails it; the analyst sets their own password on first sign-in."
			/>

			<div className="space-y-6">
				{banner && bannerStyle && BannerIcon && (
					<Alert role="alert" className={cn(bannerStyle.wrapCls, bannerStyle.textCls)}>
						<BannerIcon />
						<AlertDescription className={bannerStyle.textCls}>{banner.text}</AlertDescription>
					</Alert>
				)}

				{/* Create analyst */}
				<Card>
					<CardHeader>
						<CardTitle>Create analyst account</CardTitle>
						<CardDescription>They receive an email with a temporary password and a sign-in link.</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3" noValidate>
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
							<div className="space-y-1.5">
								<Label htmlFor="email">Email</Label>
								<Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
								{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
							</div>
							<div className="sm:col-span-3">
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting && <Loader2 className="animate-spin" />}
									{isSubmitting ? "Creating…" : "Create account & email password"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>

				{/* User list */}
				<Card className="gap-0 overflow-hidden py-0">
					<div className="flex items-center justify-between border-b border-border px-5 py-3">
						<CardTitle>Accounts</CardTitle>
						<Button type="button" variant="ghost" size="sm" onClick={loadUsers}>
							<RefreshCw className="size-3.5" />
							Refresh
						</Button>
					</div>

					{loading ? (
						<p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading accounts…</p>
					) : loadError ? (
						<p className="px-5 py-8 text-center text-sm text-destructive">{loadError}</p>
					) : users.length === 0 ? (
						<p className="px-5 py-8 text-center text-sm text-muted-foreground">No accounts yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Name</TableHead>
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Email</TableHead>
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Role</TableHead>
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Status</TableHead>
									<TableHead className="px-5 py-3 text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map((u) => (
									<TableRow key={u.id}>
										<TableCell className="px-5 py-3 font-medium text-foreground">
											{u.firstName} {u.lastName}
										</TableCell>
										<TableCell className="px-5 py-3 text-muted-foreground">{u.email}</TableCell>
										<TableCell className="px-5 py-3">
											<Badge
												variant={u.role === "admin" ? "default" : "secondary"}
												className={cn(u.role === "admin" && "bg-primary/15 text-primary")}
											>
												{u.role}
											</Badge>
										</TableCell>
										<TableCell className="px-5 py-3">
											{u.mustChangePassword ? (
												<span className="text-amber-700 dark:text-amber-300">Pending first login</span>
											) : (
												<span className="text-brand-teal">Active</span>
											)}
										</TableCell>
										<TableCell className="px-5 py-3 text-right">
											<div className="flex justify-end gap-2">
												{u.role === "analyst" ? (
													<Button
														variant="outline"
														size="sm"
														onClick={() => onSetRole(u, "admin")}
														disabled={busyId === u.id}
														className="border-primary/30 text-primary hover:bg-primary/10"
													>
														Make admin
													</Button>
												) : (
													<Button
														variant="outline"
														size="sm"
														onClick={() => onSetRole(u, "analyst")}
														disabled={busyId === u.id || adminCount <= 1}
														title={adminCount <= 1 ? "Can't remove the last admin" : "Revoke admin"}
													>
														Revoke admin
													</Button>
												)}
												<Button variant="outline" size="sm" onClick={() => onReset(u)} disabled={busyId === u.id}>
													Reset password
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => onDelete(u)}
													disabled={busyId === u.id || u.id === currentUserId}
													title={u.id === currentUserId ? "You can't delete your own account" : "Delete"}
													className="border-destructive/30 text-destructive hover:bg-destructive/10"
												>
													Delete
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</Card>
			</div>
		</div>
	);
}
