import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEtranzactTxt } from "./parseTxt.ts";

test("rows keep their file line number and exact amount text, blank lines counted", () => {
	const text = [
		"702\t2026/07/22\t4000470158\t-00000000000001500.25",
		"",
		"702\t2026/07/22\t4000460155\t+00000000000000700.25",
		"702 2026/07/22 4010160155 +00000000000000300.00",
		"702\t2026/07/22\t4000070135\t+00000000000000500.00",
	].join("\r\n");
	const { rows, malformed } = parseEtranzactTxt(`${text}\r\n`);
	assert.deepEqual(rows.map((r) => [r.line, r.code, r.amountStr]), [
		[1, "4000470158", "-00000000000001500.25"],
		[3, "4000460155", "+00000000000000700.25"],
		[5, "4000070135", "+00000000000000500.00"],
	]);
	assert.equal(rows[0].amount, -1500.25);
	assert.equal(malformed, 1);
});
