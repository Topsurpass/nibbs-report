import { z } from "zod";

/** Master-bank contract. `code` is the 10-digit NIBBS settlement code. */

export const bankSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{10}$/, "Bank code must be 10 digits"),
	name: z.string().trim().min(1, "Bank name is required").max(200),
	collateral: z
		.number({ error: "Collateral must be a number" })
		.finite("Collateral must be a number")
		.min(0, "Collateral cannot be negative"),
});

export type BankValues = z.infer<typeof bankSchema>;

/** The full master list posted to PUT /api/banks. */
export const bankListSchema = z.array(bankSchema);
