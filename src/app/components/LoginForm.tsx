"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginValues } from "@/lib/validators/auth";

/**
 * Email + password sign-in. Validates with the shared Zod contract, posts to
 * /api/auth/login, then routes to the app (or the forced password change).
 */
export default function LoginForm() {
	const router = useRouter();
	const [serverError, setServerError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<LoginValues>({
		resolver: zodResolver(loginSchema),
		defaultValues: { email: "", password: "" },
	});

	const onSubmit = handleSubmit(async (values) => {
		setServerError(null);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				setServerError(data.error ?? "Sign-in failed.");
				return;
			}
			router.replace(data.mustChangePassword ? "/change-password" : "/");
			router.refresh();
		} catch {
			setServerError("Network error. Check your connection and try again.");
		}
	});

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
					<p className="mt-1 text-xs text-red-600 dark:text-red-400">
						{errors.email.message}
					</p>
				)}
			</div>

			<div>
				<label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
					Password
				</label>
				<input
					id="password"
					type="password"
					autoComplete="current-password"
					{...register("password")}
					className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
				/>
				{errors.password && (
					<p className="mt-1 text-xs text-red-600 dark:text-red-400">
						{errors.password.message}
					</p>
				)}
			</div>

			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isSubmitting ? "Signing in…" : "Sign in"}
			</button>
		</form>
	);
}
