import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const rechargeRoute = file("app/api/recharges/route.ts");
const sessionService = file("lib/payments/payment-session-service.ts");
const bep20Service = file("lib/payments/bep20-chain-service.ts");
const watcher = file("lib/payments/liuhaoyi-wechat-watcher.mjs");
const recovery = file("lib/payments/liuhaoyi-wechat-recovery-service.ts");
const paymentPage = file("app/payment/page.tsx");
const bep20Summary = file("components/account/orders/Bep20OrderPaymentSummary.tsx");
const migration = file("supabase/migrations/20260918120000_payment_expiry_15_minutes.sql");
const createOrderMigration = file("supabase/migrations/20260710_create_order_with_item_compatibility.sql");
const expirationListMigration = file("supabase/migrations/20260717_order_expiration_list_rpc_compatibility.sql");
const expirationExecutionMigration = file("supabase/migrations/20260724_order_expiration_chain_session_consistency.sql");

test("all new recharge types use the shared 15-minute window", () => {
  assert.match(rechargeRoute, /createPaymentExpiryWindow\(\)/);
  assert.match(rechargeRoute, /const expiresAt = paymentWindow\.expiresAt/);
  assert.match(rechargeRoute, /const createdAt = paymentWindow\.createdAt/);
  assert.doesNotMatch(rechargeRoute, /20\s*\*\s*60\s*\*\s*1000/);
});

test("generic and BEP20 store sessions use shared expiry without provider extension", () => {
  assert.match(sessionService, /createPaymentExpiryWindow\(\)\.expiresAt/);
  assert.match(sessionService, /expires_at: expiresAt/);
  assert.doesNotMatch(sessionService, /expires_at:\s*providerResult\.expiresAt/);
  assert.match(bep20Service, /createPaymentExpiryWindow\(\)\.expiresAt/);
  assert.doesNotMatch(bep20Service, /BSC_PAYMENT_EXPIRE_MINUTES/);
});

test("existing persisted session expiry is reused and never recalculated", () => {
  assert.match(sessionService, /if \(reusable\)[\s\S]*?return toSessionResponse\(existing\)/);
  assert.match(sessionService, /businessType === "recharge" && business\.expiresAt\s*\? business\.expiresAt/);
});

test("order migration is insert-only, forward-only, and makes no historical data writes", () => {
  assert.match(migration, /tg_op = 'INSERT'/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /Existing rows are never recalculated/i);
  assert.doesNotMatch(migration, /update\s+public\.(?:orders|payment_sessions|account_recharges)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(?:balance_transactions|payment_sessions|account_recharges)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(?:orders|payment_sessions|account_recharges)/i);
});

test("migration accepts the Production state where both objects are missing", () => {
  assert.match(migration, /named_function_count = 0 and named_trigger_count = 0/i);
  assert.match(migration, /existing_state := 'missing'/i);
});

test("migration accepts only the known legacy 30-minute object state", () => {
  assert.match(migration, /existing_state := 'legacy_30_minutes'/i);
  assert.match(migration, /new\.payment_expires_at is null[\s\S]*?trigger_type = 23/i);
  assert.match(migration, /before insert or update/i);
  assert.match(migration, /function_trigger_count <> 1/i);
  assert.match(migration, /trigger_function_oid <> function_oid/i);
  assert.match(migration, /trigger_enabled <> 'O'/i);
});

test("already-current 15-minute state is idempotent and post-checked", () => {
  assert.match(migration, /existing_state := 'current_15_minutes'/i);
  assert.match(migration, /expected exactly one zero-argument function/i);
  assert.match(migration, /expected exactly one named trigger/i);
  assert.match(migration, /trigger_type <> 7/i);
  assert.match(migration, /trigger is not the unique enabled BEFORE INSERT trigger/i);
});

test("unknown, partial, or structurally invalid states fail closed", () => {
  assert.match(migration, /partial or ambiguous state/i);
  assert.match(migration, /function or trigger definition is unknown/i);
  assert.match(migration, /public\.orders\.payment_expires_at is missing/i);
  assert.match(migration, /raise exception/i);
});

test("the authoritative trigger is BEFORE INSERT only", () => {
  assert.match(
    migration,
    /create trigger trg_orders_set_payment_expiration\s+before insert on public\.orders/i,
  );
  assert.doesNotMatch(
    migration.match(/create trigger trg_orders_set_payment_expiration[\s\S]*?;/i)?.[0] ?? "",
    /update/i,
  );
});

test("authoritative trigger overrides the create-order RPC 30-minute proposal", () => {
  const installedFunction = migration.match(
    /create or replace function public\.set_order_payment_expiration\(\)[\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";

  assert.match(createOrderMigration, /now\(\) \+ interval '30 minutes'/i);
  assert.match(installedFunction, /tg_op = 'INSERT'/i);
  assert.match(installedFunction, /new\.payment_expires_at :=[\s\S]*?interval '15 minutes'/i);
  assert.doesNotMatch(installedFunction, /new\.payment_expires_at is null/i);
});

test("UPDATE cannot recalculate a persisted expiry", () => {
  assert.match(migration, /if tg_op = 'INSERT'/i);
  assert.doesNotMatch(
    migration.match(/create trigger trg_orders_set_payment_expiration[\s\S]*?;/i)?.[0] ?? "",
    /update/i,
  );
});

test("historical order rows remain unchanged", () => {
  assert.doesNotMatch(migration, /update\s+public\.orders/i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:expire_unpaid_order|list_expirable_unpaid_orders)/i);
});

test("historical NULL-expiry fallback remains 30 minutes", () => {
  assert.match(
    expirationExecutionMigration,
    /coalesce\(v_order\.payment_expires_at, v_order\.created_at \+ interval '30 minutes'\)/i,
  );
  assert.match(
    expirationListMigration,
    /coalesce\(o\.payment_expires_at, o\.created_at \+ interval '30 minutes'\)/i,
  );
  assert.doesNotMatch(migration, /create or replace function public\.(?:expire_unpaid_order|list_expirable_unpaid_orders)/i);
});

test("watcher and recovery continue using persisted expiry without extending it", () => {
  assert.match(watcher, /expires_at:\s*"gt\." \+ new Date\(nowMs\)\.toISOString\(\)/);
  assert.match(recovery, /paidAtMs <= Date\.parse\(String\(session\.expiresAt/);
  assert.match(recovery, /paidAtMs <= Date\.parse\(String\(recharge\?\.expiresAt/);
});

test("payment UI counts down from persisted expiry and renewal copy says 15 minutes", () => {
  assert.match(paymentPage, /secondsLeft\(session\?\.expiresAt/);
  assert.match(paymentPage, /secondsLeft\(recharge\?\.expiresAt/);
  assert.match(bep20Summary, /新的 15 分钟支付会话/);
  assert.doesNotMatch(bep20Summary, /新的 30 分钟支付会话/);
});
