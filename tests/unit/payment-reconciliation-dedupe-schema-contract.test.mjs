import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260915173000_payment_reconciliations_dedupe_unique_compatibility.sql",
    import.meta.url,
  ),
  "utf8",
);
const reconciliation = readFileSync(
  new URL("../../lib/payments/reconciliation-service.ts", import.meta.url),
  "utf8",
);
const callback = readFileSync(
  new URL("../../lib/payments/payment-callback-service.ts", import.meta.url),
  "utf8",
);

test("reconciliation dedupe index is a non-partial single-column UNIQUE index", () => {
  assert.match(
    migration,
    /create unique index payment_reconciliations_dedupe_unique\s+on public\.payment_reconciliations\(dedupe_key\);/i,
  );
  const createIndex = migration.slice(
    migration.lastIndexOf("create unique index payment_reconciliations_dedupe_unique"),
  );
  assert.doesNotMatch(createIndex, /where\s+dedupe_key\s+is\s+not\s+null/i);
});

test("migration fails closed on duplicate data or an unexpected existing index", () => {
  assert.match(migration, /group by pr\.dedupe_key\s+having count\(\*\) > 1/i);
  assert.match(migration, /if v_duplicate_keys > 0 then\s+raise exception/i);
  assert.match(migration, /v_index_first_attnum <> v_dedupe_attnum/);
  assert.match(migration, /v_index_predicate is null[\s\S]*return;/);
  assert.match(migration, /<> 'dedupe_keyisnotnull'[\s\S]*raise exception/);
  assert.doesNotMatch(migration, /delete\s+from|update\s+public\.payment_reconciliations/i);
});

test("both reconciliation writers use the dedupe_key conflict contract", () => {
  assert.match(reconciliation, /\.upsert\(row, \{ onConflict: "dedupe_key" \}\)/);
  assert.match(
    callback,
    /\.from\("payment_reconciliations"\)\.upsert\([\s\S]*\{ onConflict: "dedupe_key" \}/,
  );
});

test("two identical expired callbacks reuse one reconciliation without crediting", () => {
  const sessionId = "session-id";
  const providerTradeNo = "provider-trade-no";
  const dedupeKey = [
    "callback",
    sessionId,
    "provider_paid_local_unpaid",
    providerTradeNo,
    1,
    "CNY",
  ].join(":");
  const reconciliations = new Map();
  const upsert = (checkedAt) => reconciliations.set(dedupeKey, {
    dedupeKey,
    result: "manual_review",
    differenceType: "provider_paid_local_unpaid",
    checkedAt,
  });

  upsert("first");
  upsert("second");

  assert.equal(reconciliations.size, 1);
  assert.equal(reconciliations.get(dedupeKey)?.checkedAt, "second");

  const expiredBranch = callback.slice(
    callback.indexOf("if (expiredRechargePayment) {", callback.indexOf("if (session.status")),
    callback.indexOf('const transition = assertPaymentStatusTransition(session.status, "paid")'),
  );
  assert.match(expiredBranch, /result: "manual_review"/);
  assert.match(expiredBranch, /differenceType: "provider_paid_local_unpaid"/);
  assert.doesNotMatch(expiredBranch, /completePayment\(|credit|balance/i);
});

test("the compatibility migration and callback branch do not alter USDT or expired recharge status", () => {
  assert.doesNotMatch(migration, /usdt|balance_transactions|account_recharges/i);
  assert.doesNotMatch(migration, /\bpaid\b|completePayment|credit/i);
  assert.doesNotMatch(callback, /expiredRechargePayment[\s\S]{0,1200}status:\s*"paid"/);
});
