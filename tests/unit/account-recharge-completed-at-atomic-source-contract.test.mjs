import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260915190000_account_recharge_completed_at_atomic_completion.sql",
    import.meta.url,
  ),
  "utf8",
);
const originalCny = readFileSync(
  new URL(
    "../../supabase/migrations/20260623_payment_balance_transactions_compatibility.sql",
    import.meta.url,
  ),
  "utf8",
);
const originalBep20 = readFileSync(
  new URL(
    "../../supabase/migrations/20260815120000_account_recharge_bep20_auto_credit_v3.sql",
    import.meta.url,
  ),
  "utf8",
);
const manualReview = readFileSync(
  new URL("../../lib/recharges/review-service.ts", import.meta.url),
  "utf8",
);

function functionDefinition(source, name) {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const match = source.match(pattern);
  assert.ok(match, `${name} definition must exist`);
  return match[0];
}

function withoutCompletedAt(source) {
  return source
    .replace(/\s*completed_at\s*=\s*coalesce\(completed_at,\s*now\(\)\),?/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const cny = functionDefinition(migration, "credit_account_recharge_balance");
const bep20 = functionDefinition(
  migration,
  "credit_auto_matched_account_recharge_bep20_v3",
);

test("migration fails closed on completed_at and function prerequisites", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  assert.match(migration, /account_recharges'::regclass[\s\S]*a\.attname = 'completed_at'/);
  assert.match(migration, /completed_at_type <> 'timestamp with time zone'/);
  assert.match(
    migration,
    /to_regprocedure\('public\.credit_account_recharge_balance\(text,text,numeric,text\)'\) is null/,
  );
  assert.match(
    migration,
    /to_regprocedure\('public\.credit_auto_matched_account_recharge_bep20_v3\(uuid,text\)'\) is null/,
  );
  assert.doesNotMatch(migration, /alter table|add column|drop column/i);
});

test("CNY first credit atomically records completed_at with balance and ledger", () => {
  assert.match(cny, /update public\.profiles[\s\S]*set balance = v_after/);
  assert.match(cny, /update public\.account_recharges[\s\S]*status = 'paid'/);
  assert.match(cny, /paid_at = coalesce\(paid_at, now\(\)\),[\s\S]*completed_at = coalesce\(completed_at, now\(\)\)/);
  assert.match(cny, /insert into public\.balance_transactions/);
  assert.equal(
    (cny.match(/completed_at\s*=\s*coalesce\(completed_at,\s*now\(\)\)/g) ?? []).length,
    1,
  );
});

test("CNY idempotent replay returns before all completion writes", () => {
  const existingLedger = cny.indexOf("select * into v_transaction");
  const replayReturn = cny.indexOf("if found then", existingLedger);
  const profileWrite = cny.indexOf("update public.profiles", replayReturn);
  assert.ok(existingLedger >= 0 && replayReturn > existingLedger && profileWrite > replayReturn);
  const replayBranch = cny.slice(replayReturn, profileWrite);
  assert.match(replayBranch, /return v_transaction/);
  assert.doesNotMatch(replayBranch, /completed_at|update public\.profiles|insert into public\.balance_transactions/);
});

test("BEP20 V3 first auto-credit records completed_at and replay does not touch it", () => {
  assert.match(bep20, /update public\.profiles[\s\S]*set balance = after_balance/);
  assert.match(bep20, /insert into public\.balance_transactions/);
  assert.match(bep20, /update public\.account_recharges[\s\S]*status = 'paid'/);
  assert.match(bep20, /paid_at = coalesce\(paid_at, now\(\)\),[\s\S]*completed_at = coalesce\(completed_at, now\(\)\)/);

  const ledgerRead = bep20.indexOf("select * into existing_transaction");
  const replayStart = bep20.indexOf("if found then", ledgerRead);
  const eligibility = bep20.indexOf("if target_recharge.status", replayStart);
  const replayBranch = bep20.slice(replayStart, eligibility);
  assert.match(replayBranch, /'alreadyCredited', true/);
  assert.doesNotMatch(replayBranch, /completed_at|update public\.profiles|insert into public\.balance_transactions/);
});

test("only completed_at changed inside both preserved function definitions", () => {
  assert.equal(
    withoutCompletedAt(cny),
    withoutCompletedAt(functionDefinition(originalCny, "credit_account_recharge_balance")),
  );
  assert.equal(
    withoutCompletedAt(bep20),
    withoutCompletedAt(functionDefinition(originalBep20, "credit_auto_matched_account_recharge_bep20_v3")),
  );
});

test("wrappers remain untouched and ACLs stay restricted", () => {
  assert.doesNotMatch(migration, /create or replace function public\.complete_account_recharge\(/i);
  assert.doesNotMatch(migration, /create or replace function public\.complete_payment_session\(/i);
  assert.match(cny, /security definer[\s\S]*set search_path = public/);
  assert.match(bep20, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(
    migration.replace(/\s+/g, " "),
    /revoke execute on function public\.credit_account_recharge_balance\(text,text,numeric,text\) from public; revoke execute on function public\.credit_account_recharge_balance\(text,text,numeric,text\) from anon; grant execute on function public\.credit_account_recharge_balance\(text,text,numeric,text\) to service_role;/,
  );
  assert.match(
    migration.replace(/\s+/g, " "),
    /revoke all on function public\.credit_auto_matched_account_recharge_bep20_v3\(uuid,text\) from public, anon, authenticated; grant execute on function public\.credit_auto_matched_account_recharge_bep20_v3\(uuid,text\) to service_role;/,
  );
});

test("manual review already promotes paid recharge with completed_at", () => {
  const repair = manualReview.slice(
    manualReview.indexOf("async function repairPaidCompletion"),
    manualReview.indexOf("async function resolveTransitionResult"),
  );
  assert.match(repair, /status: "succeeded"/);
  assert.match(repair, /completed_at: recharge\.completed_at \?\? recharge\.paid_at \?\? timestamp/);
});

test("migration contains no historical completed_at backfill", () => {
  const outsideFunctions = migration
    .replace(cny, "")
    .replace(bep20, "");
  assert.doesNotMatch(outsideFunctions, /update\s+public\.account_recharges/i);
  assert.doesNotMatch(migration, /where\s+completed_at\s+is\s+null/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.account_recharges/i);
});
