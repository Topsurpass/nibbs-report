"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "./forms/PasswordInput";

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

	const field = (id: keyof ChangePasswordValues, label: string, autoComplete: string) => (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<PasswordInput
				id={id}
				autoComplete={autoComplete}
				aria-invalid={!!errors[id]}
				{...register(id)}
			/>
			{errors[id] && <p className="text-xs text-destructive">{errors[id]?.message}</p>}
		</div>
	);

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			{serverError && (
				<Alert variant="destructive" role="alert">
					<AlertCircle />
					<AlertDescription>{serverError}</AlertDescription>
				</Alert>
			)}

			{field("currentPassword", forced ? "Temporary password" : "Current password", "current-password")}
			{field("newPassword", "New password", "new-password")}
			{field("confirmPassword", "Confirm new password", "new-password")}

			<Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
				{isSubmitting && <Loader2 className="animate-spin" />}
				{isSubmitting ? "Saving…" : "Save new password"}
			</Button>

			{!forced && (
				<Button type="button" variant="outline" size="lg" className="w-full" onClick={() => router.replace("/")}>
					Cancel
				</Button>
			)}
		</form>
	);
}
