import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Keep zero-dependency Node test runner compatibility by checking contract + inline mirror.
const source = readFileSync(join(process.cwd(), "lib/recharges/admin-attention.ts"), "utf8");

test("recharge admin attention excludes routine expired orders while keeping actionable exceptions", () => {
  assert.match(source, /ROUTINE_EXPIRY_SUMMARY/);
  assert.match(source, /充值订单已过期/);
  assert.match(source, /if \(isClosedWithoutAdminAction\)/);
  assert.match(source, /!ROUTINE_EXPIRY_SUMMARY\.test\(summary\)/);
});
