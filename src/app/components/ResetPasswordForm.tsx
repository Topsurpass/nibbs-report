"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "./forms/PasswordInput";

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
			<Alert className="border-success/30 bg-success/5">
				<CheckCircle2 className="text-success" />
				<AlertDescription className="text-success">
					Password updated. Redirecting you to sign in…
				</AlertDescription>
			</Alert>
		);
	}

	const field = (id: "newPassword" | "confirmPassword", label: string) => (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<PasswordInput
				id={id}
				autoComplete="new-password"
				aria-invalid={!!errors[id]}
				{...register(id)}
			/>
			{errors[id] && <p className="text-xs text-destructive">{errors[id]?.message}</p>}
		</div>
	);

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			<input type="hidden" {...register("token")} />
			{serverError && (
				<Alert variant="destructive" role="alert">
					<AlertCircle />
					<AlertDescription>{serverError}</AlertDescription>
				</Alert>
			)}
			{field("newPassword", "New password")}
			{field("confirmPassword", "Confirm new password")}
			<Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
				{isSubmitting && <Loader2 className="animate-spin" />}
				{isSubmitting ? "Saving…" : "Set new password"}
			</Button>
		</form>
	);
}
