import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260729_bep20_underpayment_manual_early_confirmation.sql", import.meta.url),
  "utf8",
);

function decimalParts(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return {
    units: BigInt(`${whole}${fraction}`),
    scale: BigInt(10) ** BigInt(fraction.length),
  };
}

function positiveProductRoundedToCents(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const numerator = a.units * b.units * BigInt(100);
  const denominator = a.scale * b.scale;
  const cents = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

test("2.99 USDT at the frozen 7.2 rate credits exactly 21.53 CNY", () => {
  assert.equal(positiveProductRoundedToCents("2.99", "7.2"), "21.53");
  assert.match(migration, /v_credited_cny := round\(v_received_usdt \* v_chain\.exchange_rate, 2\)/);
  assert.doesNotMatch(migration, /Math\.round|Number\(/);
});

test("migration source contract preserves chain evidence and excludes payment completion or delivery", () => {
  const settlement = migration.match(
    /create function public\.settle_bep20_underpayment_to_wallet\([\s\S]*?revoke all on function public\.settle_bep20_underpayment_to_wallet/i,
  )?.[0] ?? "";

  assert.match(settlement, /v_claim\.order_id is distinct from v_order\.id/);
  assert.match(settlement, /v_transaction_count <> 1/);
  assert.match(settlement, /v_transaction\.block_timestamp > v_deadline/);
  assert.match(settlement, /v_provider_transaction_id := v_tx_hash \|\| ':' \|\| v_transaction\.log_index::text/);
  assert.match(settlement, /provider_transaction_id = v_provider_transaction_id/);
  assert.match(settlement, /provider_trade_no = v_provider_transaction_id/);
  assert.match(settlement, /v_chain\.order_amount is distinct from v_order\.total_amount/);
  assert.match(settlement, /v_payment_session\.wallet_address\) is distinct from lower\(v_chain\.receive_address\)/);
  assert.match(settlement, /v_order_payment\.order_amount is distinct from v_order\.total_amount/);
  assert.match(settlement, /v_chain\.confirmed_at is null/);
  assert.match(settlement, /v_payment_session\.payable_amount is distinct from v_chain\.expected_amount/);
  assert.match(settlement, /v_order_payment\.payable_amount is distinct from v_chain\.expected_amount/);
  assert.match(settlement, /v_order_payment\.received_amount is distinct from v_chain\.confirmed_amount/);
  assert.doesNotMatch(settlement, /round\((?:v_payment_session|v_order_payment)\.(?:payable_amount|received_amount), 6\)/);
  assert.match(settlement, /v_order\.payment_expires_at is null/);
  assert.match(settlement, /v_payment_session\.expires_at is null/);
  assert.match(settlement, /v_chain\.expires_at is null/);
  assert.match(settlement, /v_deadline := least\(/);
  assert.doesNotMatch(settlement, /select min\(x\.deadline\)|unnest\(array/);
  assert.match(settlement, /status = 'closed'/);
  assert.match(settlement, /status = 'cancelled', payment_status = 'failed'/);
  assert.match(settlement, /failure_reason = 'underpayment_credited_to_wallet'/);
  assert.doesNotMatch(settlement, /delete\s+from\s+public\.chain_transaction/i);
  assert.doesNotMatch(settlement, /complete_payment_session\s*\(/i);
  assert.doesNotMatch(settlement, /deliver_digital_order\s*\(/i);
});

test("manual early settlement is explicit while automatic settlement remains expiry-only", () => {
  assert.match(migration, /p_irreversible_confirmed boolean default false/);
  assert.match(migration, /drop function if exists public\.settle_bep20_underpayment_to_wallet\(uuid,integer,text,text,text,uuid\);/i);
  assert.match(migration, /v_source = 'manual_admin' and p_irreversible_confirmed is distinct from true/);
  assert.match(migration, /BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED/);
  assert.match(migration, /v_source = 'automatic_service' and v_now <= v_deadline/);
  assert.match(migration, /BEP20_UNDERPAYMENT_NOT_EXPIRED/);
  assert.match(migration, /v_transaction\.block_timestamp > v_deadline/);
  assert.match(migration, /'irreversible_confirmed', p_irreversible_confirmed/);
  assert.match(migration, /'manual_before_deadline', v_manual_before_deadline/);
});
