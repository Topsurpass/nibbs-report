"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validators/auth";

/**
 * Completes a password reset using the token from the emailed link. On success,
 * sends the user to sign in with the new password.
 */
export default function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();
	const [serverError, setServerError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<ResetPasswordValues>({
		resolver: zodResolver(resetPasswordSchema),
		defaultValues: { token, newPassword: "", confirmPassword: "" },
	});

	const onSubmit = handleSubmit(async (values) => {
		setServerError(null);
		try {
			const res = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				if (data.errors?.newPassword) {
					setError("newPassword", { message: data.errors.newPassword[0] });
				} else if (data.errors?.confirmPassword) {
					setError("confirmPassword", { message: data.errors.confirmPassword[0] });
				} else {
					setServerError(data.error ?? "Couldn't reset your password.");
				}
				return;
			}
			setDone(true);
			setTimeout(() => router.replace("/login"), 1200);
		} catch {
			setServerError("Network error. Check your connection and try again.");
		}
	});

	if (done) {
		return (
			<div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-3 text-sm text-teal-700 dark:text-teal-300">
				Password updated. Redirecting you to sign in…
			</div>
		);
	}

	const field = (id: "newPassword" | "confirmPassword", label: string) => (
		<div>
			<label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
				{label}
			</label>
			<input
				id={id}
				type="password"
				autoComplete="new-password"
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
			<input type="hidden" {...register("token")} />
			{serverError && (
				<div
					role="alert"
					className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
				>
					{serverError}
				</div>
			)}
			{field("newPassword", "New password")}
			{field("confirmPassword", "Confirm new password")}
			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isSubmitting ? "Saving…" : "Set new password"}
			</button>
		</form>
	);
}
