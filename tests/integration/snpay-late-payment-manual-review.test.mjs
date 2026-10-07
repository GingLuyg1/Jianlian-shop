import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import ts from "typescript";
import * as core from "../../lib/payments/providers/snpay-core.mjs";
import * as policy from "../../lib/recharges/snpay-late-payment-policy.mjs";
import * as bootstrap from "../../lib/payments/callback-session-bootstrap.mjs";
import * as observations from "../../lib/payments/callback-observability.mjs";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const ROOT = new URL("../../", import.meta.url);
function load(file, imports) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, ROOT), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error("UNEXPECTED_IMPORT:" + name);
  }, module, module.exports);
  return module.exports;
}

function fixture() {
  const now = Date.now();
  const created = new Date(now - 1600000).toISOString(), expires = new Date(now - 700000).toISOString();
  return {
    recharge: { id: "r-test", recharge_no: "RC-TEST", user_id: "u-test", provider: "snpay", channel_code: "alipay",
      currency: "CNY", status: "expired", amount: "1.00", requested_amount: "1.00", payable_amount: "1.00",
      credited_amount: "0", completed_at: null, created_at: created, expires_at: expires,
      metadata: { externalCheckoutFee: "0.03" } },
    sessions: [{ id: "s-test", session_no: "PS_TEST_12345678", business_type: "recharge", business_id: "r-test",
      business_no: "RC-TEST", user_id: "u-test", provider: "snpay", channel_code: "alipay", currency: "CNY",
      status: "expired", payable_amount: "1.00", provider_order_no: "SN_TEST_123", created_at: created, expires_at: expires }],
    ledger: [], balance: 28,
  };
}

async function harness(scenario = {}, work = async h => h.call()) {
  const data = fixture();
  scenario.mutate?.(data);
  const before = structuredClone(data);
  const audits = [], rpcCalls = [];
  let queryCalls = 0, writeCalls = 0, realNetwork = 0;
  const originalFetch = globalThis.fetch, originalError = console.error;
  const envNames = ["SNPAY_MERCHANT_ID", "SNPAY_PRIVATE_KEY_FILE", "SNPAY_PLATFORM_PUBLIC_KEY_FILE", "SNPAY_SITE_URL", "SNPAY_API_BASE"];
  const priorEnv = Object.fromEntries(envNames.map(k => [k, process.env[k]]));
  Object.assign(process.env, { SNPAY_MERCHANT_ID: "900001", SNPAY_PRIVATE_KEY_FILE: "test-private.pem",
    SNPAY_PLATFORM_PUBLIC_KEY_FILE: "test-platform.pem", SNPAY_SITE_URL: "https://site.example.invalid",
    SNPAY_API_BASE: "https://www.snpay.cn" });
  console.error = () => {};
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://www.snpay.cn/api/pay/query" || init.method !== "POST") {
      realNetwork++; throw Error("UNMOCKED_NETWORK_FORBIDDEN");
    }
    queryCalls++;
    if (scenario.networkError) throw Error("network");
    const request = Object.fromEntries(new URLSearchParams(init.body));
    assert.equal(core.verifySnpaySignedPayload(request, keys.publicKey), true);
    const paidAt = new Date(Date.now() - 30000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const payload = { code: 0, pid: "900001", timestamp: String(Math.floor(Date.now() / 1000)), sign_type: "RSA",
      out_trade_no: "PS_TEST_12345678", trade_no: "SN_TEST_123", type: "alipay", money: "1.00", status: "1", endtime: paidAt,
      ...scenario.payload };
    payload.sign = core.createSnpaySignature(payload, keys.privateKey);
    if (scenario.badSignature) payload.money = "9.00";
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const client = {
    from(table) {
      const values = { account_recharges: [data.recharge], payment_sessions: data.sessions, balance_transactions: data.ledger };
      assert.ok(Object.hasOwn(values, table));
      const builder = { select: () => builder, eq: () => builder,
        maybeSingle: async () => ({ data: values[table][0], error: null }),
        then: resolve => Promise.resolve({ data: values[table], error: null }).then(resolve),
        update() { writeCalls++; throw Error("TS_UPDATE_FORBIDDEN"); },
        insert() { writeCalls++; throw Error("TS_INSERT_FORBIDDEN"); } };
      return builder;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      assert.equal(name, "complete_account_recharge_late_payment_manual_v1");
      if (scenario.rpcError) return { error: { message: "must-not-leak-secret" } };
      const idempotent = data.ledger.length === 1;
      if (!idempotent) {
        data.balance += args.p_amount;
        data.ledger.push({ user_id: data.recharge.user_id, business_type: "account_recharge", business_id: "RC-TEST",
          direction: "credit", status: "completed", amount: args.p_amount });
        Object.assign(data.recharge, { status: "succeeded", credited_amount: args.p_amount,
          completed_at: new Date().toISOString(), exception_type: policy.LATE_PAYMENT_EXCEPTION });
        data.sessions[0].status = "paid";
      }
      return { data: { ok: true, idempotent }, error: null };
    },
  };
  const provider = load("lib/payments/providers/snpay.ts", {
    "node:fs": { readFileSync(name) {
      if (name === "test-private.pem") return keys.privateKey;
      if (name === "test-platform.pem") return keys.publicKey;
      throw Error("REAL_KEY_FILE_FORBIDDEN");
    } }, "@/lib/payments/providers/snpay-core.mjs": core,
  }).snpayProvider;
  const service = load("lib/recharges/snpay-late-payment-service.ts", {
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => client },
    "@/lib/payments/providers/snpay": { snpayProvider: provider },
    "@/lib/recharges/snpay-late-payment-policy.mjs": policy,
  });
  const auditWriter = async input => {
    audits.push(input);
    return { ok: !scenario.auditFail && !(scenario.completionAuditFail && input.metadata?.phase === "completion") };
  };
  const adminHandler = load("lib/recharges/snpay-late-payment-admin.ts", {
    crypto: { randomUUID: () => "request-test" },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/admin/audit-log-service": { writeAdminAuditLog: auditWriter },
    "@/lib/recharges/snpay-late-payment-service": service,
    "@/lib/recharges/snpay-late-payment-policy.mjs": policy,
  });
  const route = load("app/api/admin/recharges/[rechargeId]/actions/route.ts", {
    crypto: { randomUUID: () => "request-test" },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/auth/require-admin": { getServerAdminContext: async () => scenario.nonAdmin
      ? { ok: false, message: "unauthorized", status: 403 } : { ok: true, user: { id: "admin-test" } } },
    "@/lib/recharges/snpay-late-payment-admin": adminHandler,
    "@/lib/admin/audit-log-service": { writeAdminAuditLog: auditWriter },
    "@/lib/recharges/review-service": {},
  });
  const call = () => route.POST(new Request("https://site.example.invalid/api/admin/recharges/r-test/actions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve_late_payment", reason: scenario.reason ?? "核验过期付款本金", ...scenario.clientFields }),
  }), { params: { rechargeId: "r-test" } });
  try { await work({ call, data, before, audits, rpcCalls, provider, counts: () => ({ queryCalls, writeCalls, realNetwork }) }); }
  finally {
    globalThis.fetch = originalFetch; console.error = originalError;
    for (const key of envNames) { if (priorEnv[key] === undefined) delete process.env[key]; else process.env[key] = priorEnv[key]; }
    assert.equal(realNetwork, 0); assert.equal(writeCalls, 0);
  }
}

test("admin -> service -> REAL SNPAY adapter/RSA core -> atomic RPC; 1.00 not 1.03", async () => {
  await harness({ clientFields: { amount: 1.03, paid_at: "2099-01-01T00:00:00Z" } }, async h => {
    const response = await h.call(); assert.equal(response.status, 200);
    assert.equal(h.data.balance, 29); assert.equal(h.data.ledger.length, 1);
    assert.equal(h.data.ledger[0].amount, 1); assert.equal(h.rpcCalls[0].args.p_amount, 1);
    assert.notEqual(h.rpcCalls[0].args.p_paid_at, "2099-01-01T00:00:00Z");
    assert.equal(h.counts().queryCalls, 1);
    assert.deepEqual(h.audits.map(x => x.metadata.phase), ["approval_intent", "completion"]);
    assert.doesNotMatch(JSON.stringify(h.audits), /BEGIN PRIVATE|"sign"|pay_info|payment_url/);
  });
});

for (const [name, scenario, queries] of [
  ["unpaid", { payload: { status: "0" } }, 1],
  ["not found", { payload: { code: -1 } }, 1],
  ["bad signature", { badSignature: true }, 1],
  ["bad timestamp", { payload: { timestamp: "123" } }, 1],
  ["merchant mismatch", { payload: { pid: "99999" } }, 1],
  ["session mismatch", { payload: { out_trade_no: "PS_FOREIGN_12345678" } }, 1],
  ["trade mismatch", { payload: { trade_no: "SN_FOREIGN_123" } }, 1],
  ["channel mismatch", { payload: { type: "wxpay" } }, 1],
  ["money mismatch / checkout fee", { payload: { money: "1.03" } }, 1],
  ["paid time absent", { payload: { endtime: "" } }, 1],
  ["paid before expiry", { payload: { endtime: new Date(Date.now() - 1000000).toISOString().replace(/\.\d{3}Z$/, "Z") } }, 1],
  ["network failure", { networkError: true }, 1],
  ["credited conflict", { mutate: d => { d.recharge.credited_amount = 1; } }, 0],
  ["ledger exists", { mutate: d => { d.ledger.push({ status: "completed" }); } }, 0],
  ["multiple persisted orders", { mutate: d => { d.sessions.push({ ...d.sessions[0], id: "other", provider_order_no: "OTHER" }); } }, 0],
  ["provider order missing", { mutate: d => { d.sessions[0].provider_order_no = null; } }, 0],
  ["non SNPAY", { mutate: d => { d.recharge.provider = "liuhaoyi"; } }, 0],
  ["non admin", { nonAdmin: true }, 0],
  ["empty reason", { reason: " " }, 0],
  ["credential in reason", { reason: "sb_secret_TEST_ONLY" }, 0],
  ["intent audit failure", { auditFail: true }, 0],
]) {
  test(`${name}: fail closed before accounting; no mutation`, async () => harness(scenario, async h => {
    assert.ok((await h.call()).status >= 400);
    assert.equal(h.rpcCalls.length, 0); assert.equal(h.counts().queryCalls, queries);
    assert.deepEqual(h.data, h.before);
    if (!scenario.nonAdmin) assert.ok(h.audits.some(x => x.result === "failed"));
    else assert.ok(h.audits.some(x => x.result === "denied"));
  }));
}

test("repeat manual approval re-queries and reports idempotent", async () => harness({}, async h => {
  assert.equal((await h.call()).status, 200);
  const response = await h.call(); assert.equal(response.status, 200);
  assert.equal((await response.json()).idempotent, true);
  assert.equal(h.data.balance, 29); assert.equal(h.data.ledger.length, 1); assert.equal(h.counts().queryCalls, 2);
}));

test("uncertain RPC result blocks UI retry and does not leak raw errors", async () => harness({ rpcError: true }, async h => {
  const response = await h.call(); const body = await response.json();
  assert.equal(body.outcome, "uncertain"); assert.equal(body.requiresManualReconciliation, true);
  assert.doesNotMatch(JSON.stringify(body), /must-not-leak/); assert.equal(h.rpcCalls.length, 1);
}));

test("post-commit admin audit failure is uncertain; atomic credit is not repeated", async () => harness({ completionAuditFail: true }, async h => {
  const response = await h.call(); const body = await response.json();
  assert.equal(body.outcome, "uncertain"); assert.equal(body.requiresManualReconciliation, true);
  assert.equal(h.data.balance, 29); assert.equal(h.data.ledger.length, 1);
  assert.equal(h.rpcCalls.length, 1); assert.ok(h.audits.some(x => x.result === "partial"));
}));

test("signed delayed callback AFTER manual credit traverses canonical callback service without another credit", async () => harness({}, async h => {
  assert.equal((await h.call()).status, 200);
  const before = structuredClone(h.data), callbackLogs = [];
  let completionCalls = 0;
  const callbackClient = {
    from(table) {
      assert.ok(["payment_sessions", "account_recharges", "payment_callback_logs"].includes(table));
      const rows = table === "payment_sessions" ? h.data.sessions
        : table === "account_recharges" ? [h.data.recharge] : callbackLogs;
      let patch = null, allowed = () => true;
      const b = { select: () => b, eq: () => b,
        in(_column, statuses) { allowed = x => statuses.includes(x.status); return b; },
        insert(value) { assert.equal(table, "payment_callback_logs"); callbackLogs.push({ id: "log-test", ...value }); return b; },
        update(value) { patch = value; return b; },
        maybeSingle: async () => ({ data: rows[0], error: null }),
        single: async () => ({ data: rows[0], error: null }),
        then(resolve) {
          if (patch) for (const row of rows.filter(allowed)) Object.assign(row, patch);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return b;
    },
  };
  const callback = load("lib/payments/payment-callback-service.ts", {
    "@/lib/payments/callback-session-bootstrap.mjs": bootstrap,
    "@/lib/payments/callback-observability.mjs": observations,
    "@/lib/payments/complete-payment-service": { completePayment: () => { completionCalls++; throw Error("DUPLICATE_CREDIT_FORBIDDEN"); } },
    "@/lib/payments/payment-errors": { getSafeErrorMessage: () => "safe_error" },
    "@/lib/payments/payment-status-machine": { assertPaymentStatusTransition: () => { throw Error("UNEXPECTED_TRANSITION"); } },
    "@/lib/payments/providers": {
      isPaymentChannelCode: c => c === "alipay", normalizeProviderPaymentStatus: s => s,
      resolveProviderForExistingSession: () => h.provider,
    },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => callbackClient },
  });
  const payload = { pid: "900001", timestamp: String(Math.floor(Date.now()/1000)), sign_type: "RSA",
    out_trade_no: "PS_TEST_12345678", trade_no: "SN_TEST_123", type: "alipay", money: "1.00",
    trade_status: "TRADE_SUCCESS", endtime: new Date(Date.now()-30000).toISOString().replace(/\.\d{3}Z$/, "Z") };
  payload.sign = core.createSnpaySignature(payload, keys.privateKey);
  const oldInfo = console.info; console.info = () => {};
  try {
    const response = await callback.handlePaymentCallback(new Request("https://site.example.invalid/api/payments/callback/alipay", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }), "alipay");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "success");
  } finally { console.info = oldInfo; }
  assert.equal(completionCalls, 0); assert.deepEqual(h.data, before);
  assert.equal(callbackLogs[0].signature_result, "success"); assert.equal(callbackLogs[0].process_result, "duplicate");
}));

test("UI demands reason+confirmation; normal expiry gates and ordinary approve remain terminal", () => {
  const ui = readFileSync(new URL("components/admin/payments/AdminPaymentRecordsPage.tsx", ROOT), "utf8");
  assert.match(ui, /核验过期付款并入账/); assert.match(ui, /不退还支付平台手续费/);
  assert.match(ui, /window\.prompt/); assert.match(ui, /window\.confirm/);
  assert.match(ui, /status === "expired" && recharge\?\.provider === "snpay"/);
  const workflow = readFileSync(new URL("lib/recharges/review-workflow.mjs", ROOT), "utf8");
  assert.match(workflow, /approve: Object.freeze\(\{ from: \["reviewing"\]/);
  const migration = readFileSync(new URL("supabase/migrations/20261007100000_snpay_late_payment_manual_review_v1.sql", ROOT), "utf8");
  assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(migration, /insert into public.recharge_review_events/);
  assert.doesNotMatch(migration, /set expires_at|set created_at|status\s*=\s*'pending'/);
});
