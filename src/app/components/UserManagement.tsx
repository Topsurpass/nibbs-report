"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUserValues } from "@/lib/validators/user";
import type { AuthUser } from "@/types/user";

interface Props {
	/** The signed-in admin — used to prevent deleting your own account. */
	currentUserId: string;
}

interface Banner {
	kind: "success" | "warn" | "error";
	text: string;
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
			setUsers((list) =>
				list.map((x) => (x.id === u.id ? { ...x, mustChangePassword: true } : x)),
			);
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

	const bannerClass =
		banner?.kind === "success"
			? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300"
			: banner?.kind === "warn"
				? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
				: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";

	const inputClass =
		"w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40";

	return (
		<div>
			<header className="hero-gradient text-white">
				<div className="px-6 py-9 sm:px-10">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
						Configuration · Admin
					</p>
					<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">User Management</h1>
					<p className="mt-2 max-w-2xl text-sm text-white/80">
						Create analyst accounts. The system generates a one-time password and emails it; the
						analyst sets their own password on first sign-in.
					</p>
				</div>
			</header>

			<div className="space-y-6 px-6 py-8 sm:px-10">
				{banner && (
					<div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${bannerClass}`}>
						{banner.text}
					</div>
				)}

				{/* Create analyst */}
				<section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
					<h2 className="text-base font-semibold text-foreground">Create analyst account</h2>
					<p className="mb-4 text-xs text-muted">
						They receive an email with a temporary password and a sign-in link.
					</p>
					<form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3" noValidate>
						<div>
							<label htmlFor="firstName" className="mb-1 block text-sm font-medium text-foreground">
								First name
							</label>
							<input id="firstName" {...register("firstName")} className={inputClass} />
							{errors.firstName && (
								<p className="mt-1 text-xs text-red-600 dark:text-red-400">
									{errors.firstName.message}
								</p>
							)}
						</div>
						<div>
							<label htmlFor="lastName" className="mb-1 block text-sm font-medium text-foreground">
								Last name
							</label>
							<input id="lastName" {...register("lastName")} className={inputClass} />
							{errors.lastName && (
								<p className="mt-1 text-xs text-red-600 dark:text-red-400">
									{errors.lastName.message}
								</p>
							)}
						</div>
						<div>
							<label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
								Email
							</label>
							<input id="email" type="email" {...register("email")} className={inputClass} />
							{errors.email && (
								<p className="mt-1 text-xs text-red-600 dark:text-red-400">
									{errors.email.message}
								</p>
							)}
						</div>
						<div className="sm:col-span-3">
							<button
								type="submit"
								disabled={isSubmitting}
								className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isSubmitting ? "Creating…" : "Create account & email password"}
							</button>
						</div>
					</form>
				</section>

				{/* User list */}
				<section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
					<div className="flex items-center justify-between border-b border-border px-5 py-3">
						<h2 className="text-base font-semibold text-foreground">Accounts</h2>
						<button
							onClick={loadUsers}
							className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5"
						>
							↻ Refresh
						</button>
					</div>

					{loading ? (
						<p className="px-5 py-8 text-center text-sm text-muted">Loading accounts…</p>
					) : loadError ? (
						<p className="px-5 py-8 text-center text-sm text-red-600 dark:text-red-400">{loadError}</p>
					) : users.length === 0 ? (
						<p className="px-5 py-8 text-center text-sm text-muted">No accounts yet.</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
										<th className="px-5 py-3 font-semibold">Name</th>
										<th className="px-5 py-3 font-semibold">Email</th>
										<th className="px-5 py-3 font-semibold">Role</th>
										<th className="px-5 py-3 font-semibold">Status</th>
										<th className="px-5 py-3 text-right font-semibold">Actions</th>
									</tr>
								</thead>
								<tbody>
									{users.map((u) => (
										<tr key={u.id} className="border-t border-border">
											<td className="px-5 py-3 font-medium text-foreground">
												{u.firstName} {u.lastName}
											</td>
											<td className="px-5 py-3 text-muted">{u.email}</td>
											<td className="px-5 py-3">
												<span
													className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
														u.role === "admin"
															? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
															: "bg-black/5 text-muted dark:bg-white/10"
													}`}
												>
													{u.role}
												</span>
											</td>
											<td className="px-5 py-3">
												{u.mustChangePassword ? (
													<span className="text-amber-700 dark:text-amber-300">
														Pending first login
													</span>
												) : (
													<span className="text-teal-700 dark:text-teal-300">Active</span>
												)}
											</td>
											<td className="px-5 py-3 text-right">
												<div className="flex justify-end gap-2">
													{u.role === "analyst" ? (
														<button
															onClick={() => onSetRole(u, "admin")}
															disabled={busyId === u.id}
															className="rounded-md border border-indigo-500/30 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-50 dark:text-indigo-300"
														>
															Make admin
														</button>
													) : (
														<button
															onClick={() => onSetRole(u, "analyst")}
															disabled={busyId === u.id || adminCount <= 1}
															title={adminCount <= 1 ? "Can't remove the last admin" : "Revoke admin"}
															className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5"
														>
															Revoke admin
														</button>
													)}
													<button
														onClick={() => onReset(u)}
														disabled={busyId === u.id}
														className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
													>
														Reset password
													</button>
													<button
														onClick={() => onDelete(u)}
														disabled={busyId === u.id || u.id === currentUserId}
														title={u.id === currentUserId ? "You can't delete your own account" : "Delete"}
														className="rounded-md border border-red-500/30 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
													>
														Delete
													</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
