import { z } from "zod";

/** Shared login + password-change contracts (used by the forms and the API). */

export const loginSchema = z.object({
	email: z.string().trim().email("Enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Enter your current password"),
		newPassword: z
			.string()
			.min(8, "Use at least 8 characters")
			.max(200, "Too long"),
		confirmPassword: z.string().min(1, "Confirm your new password"),
	})
	.refine((v) => v.newPassword === v.confirmPassword, {
		path: ["confirmPassword"],
		message: "Passwords do not match",
	})
	.refine((v) => v.newPassword !== v.currentPassword, {
		path: ["newPassword"],
		message: "New password must differ from the current one",
	});

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
	email: z.string().trim().email("Enter a valid email"),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
	.object({
		token: z.string().min(1, "Missing reset token"),
		newPassword: z.string().min(8, "Use at least 8 characters").max(200, "Too long"),
		confirmPassword: z.string().min(1, "Confirm your new password"),
	})
	.refine((v) => v.newPassword === v.confirmPassword, {
		path: ["confirmPassword"],
		message: "Passwords do not match",
	});

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
