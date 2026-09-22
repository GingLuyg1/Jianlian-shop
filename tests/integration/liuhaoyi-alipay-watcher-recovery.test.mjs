import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import { runLiuhaoyiAlipayWatcher } from "../../lib/payments/liuhaoyi-alipay-watcher.mjs";
import { evaluateLiuhaoyiAlipayRechargeRecovery, liuhaoyiPaidTimeMs }
  from "../../lib/payments/liuhaoyi-recovery-policy.mjs";

const nowMs = Date.parse("2026-09-17T03:10:00.000Z");
const sessionNo = "PS20260917ALIPAYINTEGRATION";
const envBase = {
  LIUHAOYI_ALIPAY_WATCHER_ENABLED: "true",
  LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://ci-only.supabase.invalid",
  SUPABASE_SECRET_KEY: "TEST_ONLY_SUPABASE_KEY",
  PAYMENT_RECONCILIATION_SECRET: "TEST_ONLY_INTERNAL_SECRET",
  JIANLIAN_INTERNAL_BASE_URL: "http://127.0.0.1:3001",
};

function normalizeProviderPaymentStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "confirmed", "paid"].includes(normalized)) return "paid";
  if (["created", "waiting", "unpaid", "pending"].includes(normalized)) return "pending";
  if (["processing", "confirming", "in_progress"].includes(normalized)) return "processing";
  if (["expired", "timeout", "timed_out"].includes(normalized)) return "expired";
  if (["closed", "cancelled", "canceled"].includes(normalized)) return "closed";
  if (["failed", "error", "rejected"].includes(normalized)) return "failed";
  return "processing";
}

function loadRecoveryService({ client, provider, completePayment }) {
  const source = readFileSync(
    new URL("../../lib/payments/liuhaoyi-alipay-recovery-service.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: "liuhaoyi-alipay-recovery-service.ts",
  }).outputText;
  const loaded = { exports: {} };
  const testRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "@/lib/payments/complete-payment-service") return { completePayment };
    if (specifier === "@/lib/payments/liuhaoyi-recovery-policy.mjs") {
      return { evaluateLiuhaoyiAlipayRechargeRecovery, liuhaoyiPaidTimeMs };
    }
    if (specifier === "@/lib/payments/providers") {
      return { normalizeProviderPaymentStatus, resolveProviderForExistingSession: () => provider };
    }
    if (specifier === "@/lib/supabase/service-role") return { getSupabaseServiceRoleClient: () => client };
    throw new Error(`UNEXPECTED_TEST_IMPORT:${specifier}`);
  };
  new Function("require", "module", "exports", compiled)(testRequire, loaded, loaded.exports);
  return loaded.exports.runLiuhaoyiAlipayRechargeRecovery;
}

function loadLiuhaoyiProvider() {
  const source = readFileSync(
    new URL("../../lib/payments/providers/liuhaoyi.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: "liuhaoyi.ts",
  }).outputText;
  const loaded = { exports: {} };
  const testRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "@/lib/payments/liuhaoyi-limits.mjs") return {};
    if (specifier === "@/lib/payments/providers/liuhaoyi-core.mjs") return {};
    if (specifier === "@/lib/payments/request-client-device.mjs") return {};
    if (specifier === "@/lib/payments/provider-contracts.mjs") return {};
    if (specifier === "@/lib/payments/providers/liuhaoyi-submit.mjs") return {};
    throw new Error(`UNEXPECTED_PROVIDER_TEST_IMPORT:${specifier}`);
  };
  new Function("require", "module", "exports", compiled)(testRequire, loaded, loaded.exports);
  return loaded.exports.liuhaoyiProvider;
}

const liuhaoyiProvider = loadLiuhaoyiProvider();

function initialDatabase() {
  return {
    payment_sessions: [{
      id: "00000000-0000-4000-8000-000000000301", session_no: sessionNo,
      business_type: "recharge", business_id: "00000000-0000-4000-8000-000000000201",
      business_no: "RC-ALIPAY-INTEGRATION", user_id: "00000000-0000-4000-8000-000000000101",
      channel_code: "alipay", provider: "liuhaoyi", provider_order_no: "LHY-ALIPAY-INTEGRATION",
      provider_transaction_id: null, status: "pending", payable_amount: "1.00", currency: "CNY",
      expires_at: "2026-09-17T03:20:00.000Z", created_at: "2026-09-17T03:00:00.000Z",
      updated_at: "2026-09-17T03:00:00.000Z",
    }],
    account_recharges: [{
      id: "00000000-0000-4000-8000-000000000201", recharge_no: "RC-ALIPAY-INTEGRATION",
      user_id: "00000000-0000-4000-8000-000000000101", status: "pending",
      expires_at: "2026-09-17T03:20:00.000Z", credited_amount: "0.00", completed_at: null,
      updated_at: "2026-09-17T03:00:00.000Z",
    }],
    balance_transactions: [], payment_reconciliations: [],
  };
}

function isolatedClient(seed = initialDatabase()) {
  const tables = structuredClone(seed);
  const mutations = { update: 0, insert: 0, upsert: 0, rpc: 0 };
  const rowsFor = (table, filters) => (tables[table] ?? []).filter((row) =>
    filters.every(([column, value]) => row[column] === value));
  const from = (table) => {
    const filters = []; let selectOptions = {};
    const builder = {
      select(_columns, options = {}) { selectOptions = options; return builder; },
      eq(column, value) { filters.push([column, value]); return builder; },
      async maybeSingle() {
        const rows = rowsFor(table, filters);
        return { data: rows.length === 1 ? structuredClone(rows[0]) : null, error: null };
      },
      async update() { mutations.update++; throw new Error("DRY_RUN_UPDATE_FORBIDDEN"); },
      async insert() { mutations.insert++; throw new Error("DRY_RUN_INSERT_FORBIDDEN"); },
      async upsert() { mutations.upsert++; throw new Error("DRY_RUN_UPSERT_FORBIDDEN"); },
      then(resolve, reject) {
        const rows = rowsFor(table, filters);
        return Promise.resolve({ data: selectOptions.head ? null : structuredClone(rows),
          count: selectOptions.count === "exact" ? rows.length : null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { client: { from, async rpc() { mutations.rpc++; throw new Error("DRY_RUN_RPC_FORBIDDEN"); } },
    mutations, snapshot: () => structuredClone(tables) };
}

function providerPayload(kind) {
  const paid = { code: 1, status: 1, money: "1.00", trade_no: "LHY-ALIPAY-INTEGRATION",
    type: "alipay", out_trade_no: sessionNo, endtime: "2026-09-17 11:09:00" };
  if (kind === "unpaid") return { ...paid, status: 0, endtime: null };
  if (kind === "not_found") return { code: 0 };
  if (kind === "missing_status") { const { status, ...payload } = paid; return payload; }
  if (kind === "missing_identity") {
    const { trade_no, out_trade_no, ...payload } = paid; return payload;
  }
  if (kind === "invalid_amount") return { ...paid, money: "not-a-decimal" };
  if (kind === "amount_mismatch") return { ...paid, money: "1.01" };
  if (kind === "identity_mismatch") {
    return { ...paid, trade_no: "LHY-OTHER", out_trade_no: "PS-OTHER" };
  }
  return paid;
}

function routePayload(result) {
  return { mode: result.mode, session_no: result.sessionNo, session_found: result.sessionFound,
    recharge_found: result.rechargeFound, provider_found: result.providerFound,
    provider_paid: result.providerPaid, provider_type_match: result.providerTypeMatch,
    amount_match: result.amountMatch, paid_within_expiry: result.paidWithinExpiry,
    local_already_credited: result.localAlreadyCredited, ledger_count: result.ledgerCount,
    eligible: result.eligible, would_complete: result.wouldComplete, completed: result.completed,
    idempotent: result.idempotent, manual_review: result.manualReview, reason: result.reason };
}

async function runScenario(kind, { args = [], executeEnabled = false } = {}) {
  const database = isolatedClient(); const before = database.snapshot();
  const calls = { providerQuery: 0, completion: 0, realNetwork: 0 }; let lastServiceResult = null;
  const completePayment = async () => { calls.completion++; return { idempotent: false }; };
  const recovery = loadRecoveryService({ client: database.client, provider: liuhaoyiProvider, completePayment });
  const providerFetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.origin !== "https://provider.invalid" || target.pathname !== "/api.php") {
      calls.realNetwork++;
      throw new Error(`REAL_NETWORK_FORBIDDEN:${target.origin}`);
    }
    assert.equal(target.searchParams.get("act"), "order");
    assert.equal(target.searchParams.get("pid"), "TEST_ONLY_MERCHANT");
    assert.equal(target.searchParams.get("key"), "TEST_ONLY_PROVIDER_KEY");
    assert.equal(target.searchParams.get("out_trade_no"), sessionNo);
    assert.equal(init.method, "GET");
    assert.ok(init.signal instanceof AbortSignal);
    calls.providerQuery++;
    if (kind === "network_error") throw new Error("TEST_NETWORK_ERROR");
    if (kind === "timeout") {
      const signal = init.signal;
      await new Promise((_, reject) => {
        if (!(signal instanceof AbortSignal)) return reject(new Error("PROVIDER_ABORT_SIGNAL_MISSING"));
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
    if (kind === "non_json") {
      return new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response(JSON.stringify(providerPayload(kind)), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.hostname === "ci-only.supabase.invalid") {
      assert.equal(target.pathname, "/rest/v1/payment_sessions");
      assert.equal(target.searchParams.get("provider"), "eq.liuhaoyi");
      assert.equal(target.searchParams.get("channel_code"), "eq.alipay");
      assert.equal(target.searchParams.get("business_type"), "eq.recharge");
      assert.equal(target.searchParams.get("currency"), "eq.CNY");
      assert.equal(target.searchParams.get("status"), "eq.pending");
      const row = before.payment_sessions[0];
      return new Response(JSON.stringify([{ session_no: row.session_no, status: row.status,
        created_at: row.created_at, expires_at: row.expires_at }]),
      { status: 200, headers: { "content-range": "0-0/1" } });
    }
    if (["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
      assert.equal(target.pathname, "/api/internal/payments/liuhaoyi-alipay-recharge-recovery");
      assert.equal(init.method, "POST");
      try {
        const body = JSON.parse(String(init.body ?? "{}"));
        lastServiceResult = await recovery({ sessionNo: body.sessionNo, execute: body.execute === true,
          queryTimeoutMs: body.queryTimeoutMs }, database.client);
        return new Response(JSON.stringify(routePayload(lastServiceResult)), { status: 200 });
      } catch { return new Response(JSON.stringify({ error: "safe_test_failure" }), { status: 500 }); }
    }
    calls.realNetwork++;
    throw new Error(`REAL_NETWORK_FORBIDDEN:${target.origin}`);
  };
  const output = [];
  const providerEnv = {
    LIUHAOYI_MERCHANT_ID: "TEST_ONLY_MERCHANT",
    LIUHAOYI_MERCHANT_KEY: "TEST_ONLY_PROVIDER_KEY",
    LIUHAOYI_API_BASE_URL: "https://provider.invalid/",
    LIUHAOYI_SITE_URL: "https://shop.invalid/",
    LIUHAOYI_TIMEOUT_MS: "6000",
  };
  const previousFetch = globalThis.fetch;
  const previousEnv = Object.fromEntries(Object.keys(providerEnv).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, providerEnv);
    globalThis.fetch = providerFetch;
    const watcher = await runLiuhaoyiAlipayWatcher({ env: { ...envBase,
      LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED: executeEnabled ? "true" : "false" },
    args, nowMs, fetchImpl, write: (line) => output.push(JSON.parse(line)) });
    return { watcher, output, calls, lastServiceResult, before, after: database.snapshot(),
      mutations: database.mutations };
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function assertZeroMutation(run) {
  assert.deepEqual(run.after.payment_sessions, run.before.payment_sessions);
  assert.deepEqual(run.after.account_recharges, run.before.account_recharges);
  assert.deepEqual(run.after.balance_transactions, run.before.balance_transactions);
  assert.deepEqual(run.after.payment_reconciliations, run.before.payment_reconciliations);
  assert.deepEqual(run.mutations, { update: 0, insert: 0, upsert: 0, rpc: 0 });
  assert.equal(run.calls.completion, 0); assert.equal(run.calls.realNetwork, 0);
}

test("Alipay unpaid candidate traverses watcher, worker and service with zero mutation", async () => {
  const run = await runScenario("unpaid");
  assert.equal(run.watcher.status, "finished"); assert.equal(run.watcher.processed_count, 1);
  assert.equal(run.calls.providerQuery, 1); assert.equal(run.lastServiceResult.reason, "provider_not_paid");
  assert.equal(run.lastServiceResult.mode, "dry_run"); assertZeroMutation(run);
});

test("Alipay paid candidate reports would-complete but dry-run never credits", async () => {
  const run = await runScenario("paid");
  assert.equal(run.calls.providerQuery, 1); assert.equal(run.lastServiceResult.eligible, true);
  assert.equal(run.lastServiceResult.wouldComplete, true); assert.equal(run.lastServiceResult.completed, false);
  assertZeroMutation(run);
});

test("Alipay provider-not-found and network errors fail safe without mutation", async (t) => {
  await t.test("provider_not_found", async () => { const run = await runScenario("not_found");
    assert.equal(run.calls.providerQuery, 1); assert.equal(run.lastServiceResult.reason, "provider_not_found");
    assertZeroMutation(run); });
  await t.test("network_error", async () => { const run = await runScenario("network_error");
    assert.equal(run.calls.providerQuery, 1); assert.equal(run.watcher.status, "partial_failure");
    assertZeroMutation(run); });
});

test("Alipay hanging provider query reaches a real AbortSignal timeout and watcher exits", async () => {
  const started = Date.now(); const run = await runScenario("timeout"); const elapsed = Date.now() - started;
  assert.equal(run.calls.providerQuery, 1); assert.equal(run.watcher.status, "partial_failure");
  assert.ok(elapsed >= 5_500, `timeout fired too early: ${elapsed}ms`);
  assert.ok(elapsed < 8_000, `watcher did not stop within item timeout: ${elapsed}ms`);
  assertZeroMutation(run);
});

test("Alipay malformed provider evidence fails closed with zero mutation", async (t) => {
  for (const [kind, reason] of [["non_json", null], ["missing_status", "provider_not_paid"],
    ["missing_identity", "provider_trade_no_missing"], ["invalid_amount", "amount_mismatch"]]) {
    await t.test(kind, async () => { const run = await runScenario(kind);
      assert.equal(run.calls.providerQuery, 1);
      if (reason) assert.equal(run.lastServiceResult.reason, reason);
      else assert.equal(run.watcher.status, "partial_failure");
      assertZeroMutation(run); });
  }
});

test("Alipay amount and identity mismatches are rejected at service and database boundary", async (t) => {
  await t.test("amount_mismatch", async () => { const run = await runScenario("amount_mismatch");
    assert.equal(run.lastServiceResult.reason, "amount_mismatch"); assert.equal(run.lastServiceResult.amountMatch, false);
    assertZeroMutation(run); });
  await t.test("identity_mismatch", async () => { const run = await runScenario("identity_mismatch");
    assert.match(run.lastServiceResult.reason, /provider_order_no_mismatch|out_trade_no_mismatch/);
    assertZeroMutation(run); });
});

test("Alipay execute path still requires both CLI and environment gates", async () => {
  const envOnly = await runScenario("paid", { executeEnabled: true });
  assert.equal(envOnly.lastServiceResult.mode, "dry_run"); assert.equal(envOnly.calls.completion, 0);
  const cliOnly = await runScenario("paid", { args: ["--execute"], executeEnabled: false });
  assert.equal(cliOnly.watcher.status, "execute_not_enabled"); assert.equal(cliOnly.calls.providerQuery, 0);
  assert.equal(cliOnly.calls.completion, 0);
  const both = await runScenario("paid", { args: ["--execute"], executeEnabled: true });
  assert.equal(both.lastServiceResult.mode, "execute"); assert.equal(both.calls.providerQuery, 1);
  assert.equal(both.calls.completion, 1); assert.equal(both.calls.realNetwork, 0);
});

test("CI PostgreSQL acceptance uses database-level reconciliation and ledger uniqueness", () => {
  const schema = readFileSync(
    new URL("../../scripts/ci/payment-watcher-minimal-schema.sql", import.meta.url),
    "utf8",
  );
  const acceptance = readFileSync(
    new URL("../../scripts/ci/payment-watcher-real-db.sh", import.meta.url),
    "utf8",
  );
  assert.match(schema, /create unique index payment_reconciliations_dedupe_unique\s+on public\.payment_reconciliations\(dedupe_key\);/i);
  assert.match(schema, /create unique index balance_transactions_business_unique[\s\S]*business_type,business_id/i);
  assert.match(schema, /ci_payment_watcher_database_identity[\s\S]*jianlian-payment-watcher-ephemeral-v1/i);
  assert.doesNotMatch(schema, /payment_session_id uuid references public\.payment_sessions/i);
  assert.match(schema, /payment_sessions_provider_order_unique[\s\S]*provider_order_no/i);
  assert.match(acceptance, /prepare_fixture alipay_reconciliation_dedupe 43 alipay/);
  assert.equal((acceptance.match(/on conflict \(dedupe_key\) do update/g) ?? []).length, 2);
  assert.match(acceptance, /CI_PAYMENT_WATCHER_DB_CONFIRMED[\s\S]*CI_DATABASE_IDENTITY_UNCONFIRMED/);
  assert.match(acceptance, /payment_reconciliations[\s\S]*dedupe_key='alipay-recovery:[^']+:provider_paid_local_unpaid:[^']+'[\s\S]*<> 1/);
  assert.match(acceptance, /balance_transactions[\s\S]*RC-CI-alipay_reconciliation_dedupe[\s\S]*<> 1/);
  assert.match(acceptance, /assert_exactly_once alipay_reconciliation_dedupe 43/);
  assert.match(acceptance, /trap cleanup EXIT/);
});
