import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCreditedCnyAmount,
  calculateExpectedUsdtAmount,
  deriveRechargeSettlementRate,
  parseRequestedCnyAmount,
} from "../../lib/payments/recharge-rate.mjs";

test("daily settlement rate truncates downward to one decimal", () => {
  assert.equal(deriveRechargeSettlementRate("6.74"), "6.7");
  assert.equal(deriveRechargeSettlementRate("6.79"), "6.7");
  assert.equal(deriveRechargeSettlementRate("6.80"), "6.8");
  assert.equal(deriveRechargeSettlementRate("6.83"), "6.8");
});

test("rate parsing rejects non-canonical and non-positive input", () => {
  for (const value of [6.74, "", "  ", "1e1", "0x10", "-1", "0", null]) {
    assert.equal(deriveRechargeSettlementRate(value), null);
  }
});

test("expected USDT is rounded upward to six decimals", () => {
  assert.equal(calculateExpectedUsdtAmount("100", "6.7"), "14.925374");
  assert.equal(calculateExpectedUsdtAmount("67.00", "6.7"), "10.000000");
});

test("credited CNY uses actual USDT and floors to cents", () => {
  assert.equal(calculateCreditedCnyAmount("10", "6.7"), "67.00");
  assert.equal(calculateCreditedCnyAmount("14", "6.7"), "93.80");
  assert.equal(calculateCreditedCnyAmount("16", "6.7"), "107.20");
  assert.equal(calculateCreditedCnyAmount("1.999", "6.7"), "13.39");
});

test("requested CNY accepts at most two decimal places", () => {
  assert.equal(parseRequestedCnyAmount("100"), "100");
  assert.equal(parseRequestedCnyAmount("100.00"), "100.00");
  assert.equal(parseRequestedCnyAmount("0.01"), "0.01");
  assert.equal(parseRequestedCnyAmount("1.001"), null);
});
