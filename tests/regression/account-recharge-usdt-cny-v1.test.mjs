import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calculateCreditedCnyAmount,
  calculateExpectedUsdtAmount,
} from "../../lib/payments/recharge-rate.mjs";

const migration = readFileSync(new URL("../../supabase/migrations/20260809120000_account_recharge_usdt_cny_v1.sql", import.meta.url), "utf8");
const rechargeRoute = readFileSync(new URL("../../app/api/recharges/route.ts", import.meta.url), "utf8");
const reviewService = readFileSync(new URL("../../lib/recharges/review-service.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../../app/checkout/page.tsx", import.meta.url), "utf8");

test("underpayment and overpayment credit the actual received USDT", () => {
  assert.equal(calculateExpectedUsdtAmount("100", "6.7"), "14.925374");
  assert.equal(calculateCreditedCnyAmount("14", "6.7"), "93.80");
  assert.equal(calculateCreditedCnyAmount("16", "6.7"), "107.20");
});

test("a recharge uses its locked rate even when a newer daily rate exists", () => {
  const lockedRate = "6.7";
  const tomorrowRate = "6.8";
  assert.equal(calculateCreditedCnyAmount("10", lockedRate), "67.00");
  assert.equal(calculateCreditedCnyAmount("10", tomorrowRate), "68.00");
});

test("candidate migration enforces daily rate and immutable settlement evidence", () => {
  assert.match(migration, /effective_date date primary key/i);
  assert.match(migration, /settlement_rate = trunc\(market_rate, 1\)/i);
  assert.match(migration, /requested_cny_amount numeric\(18, 2\)/i);
  assert.match(migration, /actual_received_usdt numeric\(36, 18\)/i);
  assert.match(migration, /credited_cny := trunc\(target_recharge\.actual_received_usdt \* target_recharge\.locked_settlement_rate, 2\)/i);
});

test("TxHash and recharge credit idempotency are database-enforced", () => {
  assert.match(migration, /primary key \(chain_id, tx_hash\)/i);
  assert.match(migration, /recharge_id uuid primary key/i);
  assert.match(migration, /business_type = 'account_recharge'[\s\S]*business_id = target_recharge\.recharge_no/i);
  assert.match(migration, /alreadyCompleted', true/i);
  assert.match(migration, /currency, status[\s\S]*'CNY', 'completed'/i);
});

test("USDT/CNY recharge creation stores explicit locked snapshot fields", () => {
  for (const field of [
    "requested_cny_amount", "expected_usdt_amount", "actual_received_usdt",
    "credited_cny_amount", "locked_market_rate", "locked_settlement_rate",
    "rate_source", "rate_effective_date", "rate_locked_at",
  ]) assert.match(rechargeRoute, new RegExp(field));
  assert.match(reviewService, /complete_account_recharge_usdt_cny_v1/);
  assert.match(migration, /update public\.profiles set balance = after_balance/i);
  assert.doesNotMatch(migration, /wallet_accounts/i);
});

test("checkout keeps the existing focus refresh for newly credited CNY balance", () => {
  assert.match(checkout, /\/api\/account\/assets/);
  assert.match(checkout, /addEventListener\("focus"/);
  assert.match(checkout, /loadAccountBalance/);
});
