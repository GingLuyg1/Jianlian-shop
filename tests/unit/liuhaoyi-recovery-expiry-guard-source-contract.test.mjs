import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql", import.meta.url),
  "utf8",
);
const callback = readFileSync(
  new URL("../../lib/payments/payment-callback-service.ts", import.meta.url),
  "utf8",
);
const reconciliation = readFileSync(
  new URL("../../lib/payments/reconciliation-service.ts", import.meta.url),
  "utf8",
);
const completedAtMigration = readFileSync(
  new URL("../../supabase/migrations/20260915190000_account_recharge_completed_at_atomic_completion.sql", import.meta.url),
  "utf8",
);
const originalSessionMigration = readFileSync(
  new URL("../../supabase/migrations/20260708_order_payment_currency_snapshot_fix.sql", import.meta.url),
  "utf8",
);
const originalRechargeMigration = readFileSync(
  new URL("../../supabase/migrations/20260623_payment_provider_core.sql", import.meta.url),
  "utf8",
);

function fn(name) {
  const match = migration.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ));
  assert.ok(match, `${name} must exist`);
  return match[0];
}

function extract(source, name) {
  const match = source.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ));
  assert.ok(match, `${name} original must exist`);
  return match[0];
}

function normalize(source) {
  return source.replace(/--[^\n]*/g, "").replace(/\s+/g, "").toLowerCase();
}

function withoutSessionGuard(source) {
  return source.replace(
    /\s*if v_session\.business_type in \('recharge', 'account_recharge'\)[\s\S]*?raise exception 'expired recharge payment session cannot be completed';\s*end if;/i,
    "",
  );
}

function withoutRechargeGuard(source) {
  return source.replace(
    /\s*if v_recharge\.expires_at is not null and v_recharge\.expires_at <= now\(\) then[\s\S]*?raise exception 'expired account recharge cannot be credited';\s*end if;/i,
    "",
  );
}

test("migration is forward-only, guarded, and preserves function signatures and ACL", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  assert.match(migration, /payment_sessions\.expires_at must be timestamp with time zone/);
  assert.match(migration, /account_recharges\.expires_at must be timestamp with time zone/);
  assert.match(migration, /pg_catalog\.pg_get_functiondef/);
  assert.match(migration, /complete_payment_session definition does not match the expected baseline/);
  assert.match(migration, /complete_account_recharge definition does not match the expected baseline/);
  assert.match(migration, /complete_payment_session\(uuid,text,numeric,text,timestamp with time zone\)/);
  assert.match(migration, /complete_account_recharge\(uuid,text,numeric,text\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = public/);
  assert.match(migration, /from public, anon, authenticated;[\s\S]*to service_role;/);
  assert.doesNotMatch(migration, /alter table|delete from|truncate/i);
});

test("session paid idempotency precedes status and recharge expiry guards", () => {
  const source = fn("complete_payment_session");
  const paid = source.indexOf("if v_session.status = 'paid'");
  const status = source.indexOf("if v_session.status in ('expired','closed','failed')");
  const expiry = source.indexOf("v_session.expires_at <= now()");
  const completion = source.indexOf("public.complete_account_recharge(");
  assert.ok(paid > 0 && status > paid && expiry > status && completion > expiry);
  assert.match(source, /from public\.payment_sessions[\s\S]*for update/);
});

test("recharge paid idempotency precedes expiry guard and all credit writes", () => {
  const source = fn("complete_account_recharge");
  const paid = source.indexOf("if v_recharge.status = 'paid'");
  const expiry = source.indexOf("v_recharge.expires_at <= now()");
  const credit = source.indexOf("public.credit_account_recharge_balance(");
  assert.ok(paid > 0 && expiry > paid && credit > expiry);
  assert.match(source, /from public\.account_recharges[\s\S]*for update/);
});

test("only the two expiry guards change the preserved completion functions", () => {
  assert.equal(
    normalize(withoutSessionGuard(fn("complete_payment_session"))),
    normalize(extract(originalSessionMigration, "complete_payment_session")),
  );
  assert.equal(
    normalize(withoutRechargeGuard(fn("complete_account_recharge"))),
    normalize(extract(originalRechargeMigration, "complete_account_recharge")),
  );
});

test("recovery and callback share completePayment while database locks preserve one credit", () => {
  assert.match(reconciliation, /source: "reconciliation"/);
  assert.match(callback, /source: "callback"/);
  assert.match(reconciliation, /await completePayment\(/);
  assert.match(callback, /await completePayment\(/);
  assert.match(completedAtMigration, /completed_at = coalesce\(completed_at, now\(\)\)/);
  assert.match(completedAtMigration, /business_type = 'account_recharge'[\s\S]*status = 'completed'/);
});

test("callback-first, worker-first, and concurrent races remain idempotent", () => {
  const session = fn("complete_payment_session");
  const recharge = fn("complete_account_recharge");
  assert.match(callback, /if \(session\.status === "paid"\)[\s\S]*updateCallbackLog\(service, logId, "duplicate"/);
  assert.match(reconciliation, /\.in\("status", \["pending", "processing"\]\)/);
  assert.match(reconciliation, /currentSession = \(await readSession/);
  assert.match(session, /from public\.payment_sessions[\s\S]*for update[\s\S]*if v_session\.status = 'paid'/);
  assert.match(recharge, /from public\.account_recharges[\s\S]*for update[\s\S]*if v_recharge\.status = 'paid'/);
});

test("general reconciliation route cannot opt in to Liuhaoyi recovery", () => {
  const generalRoute = readFileSync(
    new URL("../../app/api/internal/payments/reconcile/route.ts", import.meta.url),
    "utf8",
  );
  const recoveryRoute = readFileSync(
    new URL("../../app/api/internal/payments/liuhaoyi-alipay-recharge-recovery/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(generalRoute, /recoveryMode|alipay_account_recharge_v1/);
  assert.match(recoveryRoute, /runLiuhaoyiAlipayRechargeRecovery/);
  assert.match(recoveryRoute, /if \(!sessionNo\)/);
  assert.match(recoveryRoute, /isExplicitLiuhaoyiRecoveryExecution\(body\?\.execute\)/);
  assert.match(recoveryRoute, /LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED !== "true"/);
});

test("dry-run exits before every reconciliation or payment state write", () => {
  const reconcileOne = reconciliation.slice(
    reconciliation.indexOf("async function reconcileOne"),
    reconciliation.indexOf("function compare("),
  );
  const evidence = reconciliation.slice(
    reconciliation.indexOf("async function persistLiuhaoyiDetectionEvidence"),
    reconciliation.indexOf("function sessionReconcileStatus"),
  );
  const recordSource = reconciliation.slice(
    reconciliation.indexOf("async function record("),
    reconciliation.indexOf("function issue("),
  );
  assert.match(reconcileOne, /else if \(dryRun\)[\s\S]*?recoveryStatus = "dry_run";[\s\S]*?else \{[\s\S]*?attemptAutomaticCompletion/);
  assert.match(evidence, /if \(dryRun\) return;[\s\S]*?\.update\(update\)/);
  assert.match(recordSource, /if \(dryRun\) \{[\s\S]*?return normalizeReconciliationRow[\s\S]*?\.upsert\(row/);
});

test("candidate query is narrow, active, age-gated, expiry-gated, and failure-isolated", () => {
  assert.match(reconciliation, /\.eq\("provider", "liuhaoyi"\)/);
  assert.match(reconciliation, /\.eq\("business_type", "recharge"\)/);
  assert.match(reconciliation, /\.eq\("channel_code", "alipay"\)/);
  assert.match(reconciliation, /\.in\("status", \["pending", "processing"\]\)/);
  assert.match(reconciliation, /\.gt\("expires_at"/);
  assert.match(reconciliation, /LIUHAOYI_RECOVERY_EXPIRY_MARGIN_MS/);
  assert.match(reconciliation, /\.lte\("created_at"/);
  assert.match(reconciliation, /LIUHAOYI_RECOVERY_MINIMUM_AGE_MS/);
  assert.match(reconciliation, /for \(const session of sessions\)[\s\S]*try[\s\S]*output\.errors\.push/);
});

test("query errors return evidence without reaching any completion call", () => {
  const reconcileOne = reconciliation.slice(
    reconciliation.indexOf("async function reconcileOne"),
    reconciliation.indexOf("async function attemptAutomaticCompletion"),
  );
  const queryFailure = reconcileOne.slice(
    reconcileOne.indexOf("try {"),
    reconcileOne.indexOf("let currentSession"),
  );
  assert.match(queryFailure, /result: "query_failed"/);
  assert.match(queryFailure, /return record\(/);
  assert.doesNotMatch(queryFailure, /completePayment|attemptAutomaticCompletion/);
});
