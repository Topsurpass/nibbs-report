import { z } from "zod";

/** Admin-only "create analyst" contract (first name, last name, email). */

export const createUserSchema = z.object({
	firstName: z.string().trim().min(1, "First name is required").max(80),
	lastName: z.string().trim().min(1, "Last name is required").max(80),
	email: z.string().trim().email("Enter a valid email").max(200),
});

export type CreateUserValues = z.infer<typeof createUserSchema>;
