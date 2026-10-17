import { test } from "node:test";
import assert from "node:assert/strict";
import { countByFilter, filterUsers } from "./filterUsers.ts";

const u = (firstName: string, lastName: string, role: "admin" | "analyst", isActive = true, mustChangePassword = false) => ({
	firstName,
	lastName,
	email: `${firstName}.${lastName}@example.com`.toLowerCase(),
	role,
	isActive,
	mustChangePassword,
});

const users = [
	u("Ada", "Obi", "admin"),
	u("Bode", "Ayo", "analyst", true, true),
	u("Chi", "Eze", "analyst", false),
	u("Dayo", "Ade", "analyst"),
];

test("filters by role, pending and revoked", () => {
	assert.deepEqual(filterUsers(users, "", "admin").map((x) => x.firstName), ["Ada"]);
	assert.deepEqual(filterUsers(users, "", "analyst").map((x) => x.firstName), ["Bode", "Chi", "Dayo"]);
	assert.deepEqual(filterUsers(users, "", "pending").map((x) => x.firstName), ["Bode"]);
	assert.deepEqual(filterUsers(users, "", "revoked").map((x) => x.firstName), ["Chi"]);
});

test("a revoked account that never logged in is revoked, not pending", () => {
	const r = [u("Eve", "Ola", "analyst", false, true)];
	assert.equal(filterUsers(r, "", "pending").length, 0);
	assert.equal(filterUsers(r, "", "revoked").length, 1);
});

test("search matches name or email, every term", () => {
	assert.deepEqual(filterUsers(users, "ADA", "all").map((x) => x.firstName), ["Ada"]);
  assert.deepEqual(filterUsers(users, "ad", "all").map((x) => x.firstName), ["Ada", "Dayo"]);
	assert.deepEqual(filterUsers(users, "dayo ade", "all").map((x) => x.firstName), ["Dayo"]);
	assert.deepEqual(filterUsers(users, "example.com", "revoked").map((x) => x.firstName), ["Chi"]);
});

test("counts per filter", () => {
	assert.deepEqual(countByFilter(users), { all: 4, admin: 1, analyst: 3, pending: 1, revoked: 1 });
});
