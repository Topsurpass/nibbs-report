"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
			<Alert className="border-success/30 bg-success/5">
				<CheckCircle2 className="text-success" />
				<AlertDescription className="text-success">
					If that email belongs to an account, a reset link is on its way. It expires in 1 hour.
				</AlertDescription>
			</Alert>
		);
	}

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
			<Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
				{isSubmitting && <Loader2 className="animate-spin" />}
				{isSubmitting ? "Sending…" : "Send reset link"}
			</Button>
		</form>
	);
}
