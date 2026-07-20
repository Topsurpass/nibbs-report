"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validators/auth";

interface Props {
	/** True for the mandatory first-login change (hides the "cancel" affordance). */
	forced: boolean;
}

/** Change the signed-in user's password, then return to the app. */
export default function ChangePasswordForm({ forced }: Props) {
	const router = useRouter();
	const [serverError, setServerError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<ChangePasswordValues>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
	});

	const onSubmit = handleSubmit(async (values) => {
		setServerError(null);
		try {
			const res = await fetch("/api/auth/change-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				if (data.errors?.currentPassword) {
					setError("currentPassword", { message: data.errors.currentPassword[0] });
				} else {
					setServerError(data.error ?? "Couldn't update your password.");
				}
				return;
			}
			router.replace("/");
			router.refresh();
		} catch {
			setServerError("Network error. Check your connection and try again.");
		}
	});

	const field = (
		id: keyof ChangePasswordValues,
		label: string,
		autoComplete: string,
	) => (
		<div>
			<label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
				{label}
			</label>
			<input
				id={id}
				type="password"
				autoComplete={autoComplete}
				{...register(id)}
				className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
			/>
			{errors[id] && (
				<p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[id]?.message}</p>
			)}
		</div>
	);

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			{serverError && (
				<div
					role="alert"
					className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
				>
					{serverError}
				</div>
			)}

			{field("currentPassword", forced ? "Temporary password" : "Current password", "current-password")}
			{field("newPassword", "New password", "new-password")}
			{field("confirmPassword", "Confirm new password", "new-password")}

			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isSubmitting ? "Saving…" : "Save new password"}
			</button>

			{!forced && (
				<button
					type="button"
					onClick={() => router.replace("/")}
					className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5"
				>
					Cancel
				</button>
			)}
		</form>
	);
}
