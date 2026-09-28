"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { loginSchema, type LoginValues } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "./forms/PasswordInput";

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
				<Alert variant="destructive" role="alert">
					<AlertCircle />
					<AlertDescription>{serverError}</AlertDescription>
				</Alert>
			)}

			<div className="space-y-1.5">
				<Label htmlFor="email">Email</Label>
				<Input
					id="email"
					type="email"
					autoComplete="username"
					autoFocus
					aria-invalid={!!errors.email}
					{...register("email")}
				/>
				{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="password">Password</Label>
				<PasswordInput
					id="password"
					autoComplete="current-password"
					aria-invalid={!!errors.password}
					{...register("password")}
				/>
				{errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
			</div>

			<Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
				{isSubmitting && <Loader2 className="animate-spin" />}
				{isSubmitting ? "Signing in…" : "Sign in"}
			</Button>

			<p className="text-center text-sm">
				<Link href="/forgot-password" className="font-medium text-primary hover:underline">
					Forgot password?
				</Link>
			</p>
		</form>
	);
}
