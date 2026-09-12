import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditMasterBanks } from "./permissions.ts";

test("only an admin may edit the master bank list", () => {
	assert.equal(canEditMasterBanks("admin"), true);
	assert.equal(canEditMasterBanks("analyst"), false);
});

test("an unknown or missing role is never an editor", () => {
	// A client that failed to load its session, or a role added to the database
	// later, must fall to read-only rather than inherit write access.
	assert.equal(canEditMasterBanks(null), false);
	assert.equal(canEditMasterBanks(undefined), false);
	assert.equal(canEditMasterBanks("" as never), false);
	assert.equal(canEditMasterBanks("Admin" as never), false);
	assert.equal(canEditMasterBanks("superuser" as never), false);
});
