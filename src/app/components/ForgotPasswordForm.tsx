"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators/auth";

/**
 * Requests a password-reset link. Always shows the same confirmation regardless
 * of whether the email exists (the API never reveals it).
 */
export default function ForgotPasswordForm() {
	const [sent, setSent] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<ForgotPasswordValues>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: { email: "" },
	});

	const onSubmit = handleSubmit(async (values) => {
		setServerError(null);
		try {
			const res = await fetch("/api/auth/forgot-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				setServerError(data.error ?? "Something went wrong. Try again.");
				return;
			}
			setSent(true);
		} catch {
			setServerError("Network error. Check your connection and try again.");
		}
	});

	if (sent) {
		return (
			<div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-3 text-sm text-teal-700 dark:text-teal-300">
				If that email belongs to an account, a reset link is on its way. It expires in 1 hour.
			</div>
		);
	}

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
			<div>
				<label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
					Email
				</label>
				<input
					id="email"
					type="email"
					autoComplete="username"
					autoFocus
					{...register("email")}
					className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
				/>
				{errors.email && (
					<p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
				)}
			</div>
			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isSubmitting ? "Sending…" : "Send reset link"}
			</button>
		</form>
	);
}
