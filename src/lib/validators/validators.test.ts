import { test } from "node:test";
import assert from "node:assert/strict";
import {
	changePasswordSchema,
	forgotPasswordSchema,
	loginSchema,
	resetPasswordSchema,
} from "./auth.ts";
import { createUserSchema, updateRoleSchema } from "./user.ts";
import { bankSchema, bankListSchema } from "./bank.ts";

test("loginSchema accepts valid, rejects bad email / empty password", () => {
	assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success, true);
	assert.equal(loginSchema.safeParse({ email: "nope", password: "x" }).success, false);
	assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "" }).success, false);
});

test("createUserSchema requires first/last/email", () => {
	assert.equal(
		createUserSchema.safeParse({ firstName: "A", lastName: "B", email: "a@b.com" }).success,
		true,
	);
	assert.equal(
		createUserSchema.safeParse({ firstName: "", lastName: "B", email: "a@b.com" }).success,
		false,
	);
	assert.equal(
		createUserSchema.safeParse({ firstName: "A", lastName: "B", email: "bad" }).success,
		false,
	);
});

test("changePasswordSchema enforces length, match, and difference", () => {
	// too short
	assert.equal(
		changePasswordSchema.safeParse({
			currentPassword: "old",
			newPassword: "short",
			confirmPassword: "short",
		}).success,
		false,
	);
	// mismatch
	assert.equal(
		changePasswordSchema.safeParse({
			currentPassword: "old",
			newPassword: "longenough1",
			confirmPassword: "different1",
		}).success,
		false,
	);
	// same as current
	assert.equal(
		changePasswordSchema.safeParse({
			currentPassword: "samePass123",
			newPassword: "samePass123",
			confirmPassword: "samePass123",
		}).success,
		false,
	);
	// valid
	assert.equal(
		changePasswordSchema.safeParse({
			currentPassword: "oldPass1",
			newPassword: "brandNew99",
			confirmPassword: "brandNew99",
		}).success,
		true,
	);
});

test("bankSchema enforces 10-digit code and non-negative collateral", () => {
	assert.equal(
		bankSchema.safeParse({ code: "4000470158", name: "Access", collateral: 10 }).success,
		true,
	);
	assert.equal(
		bankSchema.safeParse({ code: "123", name: "Access", collateral: 10 }).success,
		false,
	);
	assert.equal(
		bankSchema.safeParse({ code: "4000470158", name: "", collateral: 10 }).success,
		false,
	);
	assert.equal(
		bankSchema.safeParse({ code: "4000470158", name: "Access", collateral: -1 }).success,
		false,
	);
});

test("updateRoleSchema only accepts admin/analyst", () => {
	assert.equal(updateRoleSchema.safeParse({ role: "admin" }).success, true);
	assert.equal(updateRoleSchema.safeParse({ role: "analyst" }).success, true);
	assert.equal(updateRoleSchema.safeParse({ role: "superuser" }).success, false);
	assert.equal(updateRoleSchema.safeParse({}).success, false);
});

test("forgotPasswordSchema requires a valid email", () => {
	assert.equal(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success, true);
	assert.equal(forgotPasswordSchema.safeParse({ email: "nope" }).success, false);
});

test("resetPasswordSchema enforces token, length, and match", () => {
	// missing token
	assert.equal(
		resetPasswordSchema.safeParse({ token: "", newPassword: "longenough", confirmPassword: "longenough" }).success,
		false,
	);
	// short password
	assert.equal(
		resetPasswordSchema.safeParse({ token: "t", newPassword: "short", confirmPassword: "short" }).success,
		false,
	);
	// mismatch
	assert.equal(
		resetPasswordSchema.safeParse({ token: "t", newPassword: "longenough1", confirmPassword: "different1" }).success,
		false,
	);
	// valid
	assert.equal(
		resetPasswordSchema.safeParse({ token: "t", newPassword: "brandNew99", confirmPassword: "brandNew99" }).success,
		true,
	);
});

test("bankListSchema validates an array", () => {
	assert.equal(
		bankListSchema.safeParse([{ code: "4000470158", name: "Access", collateral: 0 }]).success,
		true,
	);
	assert.equal(bankListSchema.safeParse([{ code: "x", name: "Access", collateral: 0 }]).success, false);
});
