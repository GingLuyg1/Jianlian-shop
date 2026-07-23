import assert from "node:assert/strict";
import test from "node:test";

import {
  addBep20UnderpaymentDecimal,
  multiplyBep20UnderpaymentDecimalToCny,
  subtractBep20UnderpaymentDecimal,
} from "../../lib/payments/bep20-underpayment-runtime.mjs";

test("underpayment preview uses exact decimal strings and PostgreSQL-compatible positive rounding", () => {
  assert.equal(subtractBep20UnderpaymentDecimal("4.000000", "2.990000"), "1.01");
  assert.equal(multiplyBep20UnderpaymentDecimalToCny("2.99", "7.2"), "21.53");
  assert.equal(multiplyBep20UnderpaymentDecimalToCny("0.125", "7.2"), "0.9");
  assert.equal(addBep20UnderpaymentDecimal("26.73", "21.53"), "48.26");
  assert.throws(
    () => subtractBep20UnderpaymentDecimal("2.99", "4"),
    /欠额结算预览金额顺序无效/,
  );
});
