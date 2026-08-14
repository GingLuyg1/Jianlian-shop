import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260814171000_account_recharge_amount_fingerprint_v3.sql", "utf8");
const createRoute = fs.readFileSync("app/api/recharges/route.ts", "utf8");
const verifyRoute = fs.readFileSync("app/api/recharges/[rechargeNo]/bep20/verify/route.ts", "utf8");
const ui = fs.readFileSync("components/account/AccountRechargeContent.tsx", "utf8");

test("V3 reserves a four-decimal fingerprint with a reuse quarantine", () => {
  assert.match(migration, /reserve_account_recharge_usdt_fingerprint_v3/);
  assert.match(migration, /numeric\(36, 4\)/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(createRoute, /20 \* 60 \* 1000/);
  assert.match(createRoute, /reserve_account_recharge_usdt_fingerprint_v3/);
});

test("V3 credits requested CNY instead of recalculating from actual USDT", () => {
  assert.match(migration, /credited_cny := target_recharge\.requested_cny_amount/);
  assert.match(migration, /credit_policy', 'requested_cny_exact'/);
  assert.doesNotMatch(
    migration.slice(migration.indexOf("create or replace function public.complete_account_recharge_usdt_cny_v1")),
    /credited_cny\s*:=\s*trunc\(target_recharge\.actual_received_usdt\s*\*/
  );
});

test("manual TxHash fallback requires the exact fingerprint and respects expiry", () => {
  assert.match(verifyRoute, /RECHARGE_AMOUNT_MISMATCH/);
  assert.match(verifyRoute, /RECHARGE_PAYMENT_EXPIRED/);
  assert.match(verifyRoute, /compareRechargeDecimals\(evidence\.actualReceivedUsdt, expectedUsdtAmount\) !== 0/);
  assert.match(ui, /精确支付/);
});
