import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260916170000_account_recharge_completed_at_forward_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const expectedMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260915190000_account_recharge_completed_at_atomic_completion.sql",
    import.meta.url,
  ),
  "utf8",
);
const expiryGuardMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionDefinition(source, name) {
  const match = source.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  assert.ok(match, `${name} definition must exist`);
  return match[0];
}

function normalize(source) {
  return source.replace(/\s+/g, "").toLowerCase();
}

const repaired = functionDefinition(
  migration,
  "credit_account_recharge_balance",
);
const expected = functionDefinition(
  expectedMigration,
  "credit_account_recharge_balance",
);

test("forward repair fails closed against the observed stale Production baseline", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /set local statement_timeout = '60s'/);
  assert.match(
    migration,
    /credit_account_recharge_balance\(text,text,numeric,text\)/,
  );
  assert.match(migration, /v_security_definer is distinct from true/);
  assert.match(
    migration,
    /v_config is distinct from array\['search_path=public'\]::text\[\]/,
  );
  assert.match(migration, /FUNCTION_BASELINE_MISMATCH/);
  assert.match(migration, /FORWARD_REPAIR_ALREADY_PRESENT/);
});

test("replacement is exactly the previously reviewed CNY target definition", () => {
  assert.equal(normalize(repaired), normalize(expected));
  assert.equal(
    (migration.match(/create or replace function public\./gi) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.credit_auto_matched_account_recharge_bep20_v3/i,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.(?:complete_payment_session|complete_account_recharge|complete_order_payment)/i,
  );
});

test("future first credit writes completed_at atomically with paid state and ledger", () => {
  assert.match(repaired, /security definer[\s\S]*set search_path = public/);
  assert.match(repaired, /update public\.profiles[\s\S]*set balance = v_after/);
  assert.match(
    repaired,
    /update public\.account_recharges[\s\S]*status = 'paid'[\s\S]*paid_at = coalesce\(paid_at, now\(\)\),[\s\S]*completed_at = coalesce\(completed_at, now\(\)\),[\s\S]*callback_status = 'success'/,
  );
  assert.match(repaired, /insert into public\.balance_transactions/);
});

test("existing completed ledger returns before balance, timestamp, and ledger writes", () => {
  const ledgerLookup = repaired.indexOf("select * into v_transaction");
  const replayStart = repaired.indexOf("if found then", ledgerLookup);
  const replayEnd = repaired.indexOf("select * into v_profile", replayStart);
  assert.ok(ledgerLookup >= 0 && replayStart > ledgerLookup && replayEnd > replayStart);
  const replay = repaired.slice(replayStart, replayEnd);
  assert.match(replay, /return v_transaction/);
  assert.doesNotMatch(
    replay,
    /completed_at|update public\.profiles|update public\.account_recharges|insert into public\.balance_transactions/,
  );
});

test("amount, currency, terminal-state, and row-lock safeguards remain intact", () => {
  assert.match(repaired, /for update/);
  assert.match(repaired, /status in \('closed','expired','failed','refunded'\)/);
  assert.match(
    repaired,
    /round\(coalesce\(p_received_amount, 0\)::numeric, 6\) <> round\(coalesce\(v_recharge\.payable_amount, v_recharge\.amount, 0\)::numeric, 6\)/,
  );
  assert.match(
    repaired,
    /upper\(coalesce\(p_currency, v_recharge\.currency, 'CNY'\)\) <> upper\(coalesce\(v_recharge\.currency, 'CNY'\)\)/,
  );
});

test("migration has no historical backfill or direct business-data statement", () => {
  const outsideFunction = migration
    .replace(repaired, "")
    .replace(/do \$\$[\s\S]*?end \$\$;/i, "");
  assert.doesNotMatch(
    outsideFunction,
    /(?:update|insert into|delete from|truncate)\s+public\.(?:account_recharges|profiles|balance_transactions)/i,
  );
  assert.doesNotMatch(migration, /where\s+completed_at\s+is\s+null/i);
  assert.doesNotMatch(migration, /RC20260916080210BNPKAJ|PS20260916080210CNQE37/);
});

test("same-signature replacement preserves ACL instead of rewriting grants", () => {
  assert.doesNotMatch(migration, /\b(?:grant|revoke)\b/i);
  assert.match(
    repaired,
    /credit_account_recharge_balance\([\s\S]*p_recharge_no text,[\s\S]*p_provider_trade_no text,[\s\S]*p_received_amount numeric,[\s\S]*p_currency text default 'CNY'/,
  );
  assert.match(repaired, /returns public\.balance_transactions/);
});

test("later expiry migration delegates to credit function without replacing it", () => {
  assert.match(
    expiryGuardMigration,
    /public\.credit_account_recharge_balance\(/,
  );
  assert.doesNotMatch(
    expiryGuardMigration,
    /create or replace function public\.credit_account_recharge_balance\(/i,
  );
  assert.match(
    expiryGuardMigration,
    /provider transaction is already used by another payment session/,
  );
  assert.match(
    expiryGuardMigration,
    /where ar\.provider_trade_no = nullif\(p_provider_transaction_id, ''\)/,
  );
});
