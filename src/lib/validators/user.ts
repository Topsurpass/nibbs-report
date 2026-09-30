import { z } from "zod";

/** Admin-only "create analyst" contract (first name, last name, email). */

export const createUserSchema = z.object({
	firstName: z.string().trim().min(1, "First name is required").max(80),
	lastName: z.string().trim().min(1, "Last name is required").max(80),
	email: z.string().trim().email("Enter a valid email").max(200),
});

export type CreateUserValues = z.infer<typeof createUserSchema>;

/** Admin changing another account's role. */
export const updateRoleSchema = z.object({
	role: z.enum(["admin", "analyst"]),
});

export type UpdateRoleValues = z.infer<typeof updateRoleSchema>;

/** Admin revoking or restoring an account's access, without deleting it. */
export const updateStatusSchema = z.object({
	isActive: z.boolean(),
});

export type UpdateStatusValues = z.infer<typeof updateStatusSchema>;

/** PATCH /api/users/[id] accepts either a role change or a status change. */
export const updateUserSchema = z.union([updateRoleSchema, updateStatusSchema]);
