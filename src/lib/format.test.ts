import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNaira, formatNairaSymbol } from "./format.ts";

test("float noise around zero never prints as -0.00", () => {
  assert.equal(formatNaira(-0.0000001), "0.00");
  assert.equal(formatNaira(-0.004), "0.00");
  assert.equal(formatNaira(-0), "0.00");
  assert.equal(formatNairaSymbol(-0.0000001), "₦0.00");
});

test("real amounts keep their sign and separators", () => {
  assert.equal(formatNaira(-157598787534.9), "-157,598,787,534.90");
  assert.equal(formatNaira(-0.01), "-0.01");
  assert.equal(formatNaira(1234.5), "1,234.50");
  assert.equal(formatNaira(Number.NaN), "—");
});
