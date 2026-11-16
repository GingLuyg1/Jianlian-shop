import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import ts from "typescript";
import * as core from "../../lib/payments/providers/snpay-core.mjs";
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

async function harness(_scenario, work) {
  const data = {
    recharge: {id: "r-test", status: "succeeded", created_at: new Date(Date.now()-60000).toISOString(), expires_at: new Date(Date.now()+60000).toISOString()},
    sessions: [{id: "s-test", session_no: "PS_TEST_12345678", business_type: "recharge", business_id: "r-test", business_no: "RC-TEST", provider: "snpay", channel_code: "alipay", currency: "CNY", payable_amount: "1.00", provider_order_no: "SN_TEST_123", status: "paid", created_at: new Date(Date.now()-60000).toISOString(), expires_at: new Date(Date.now()+60000).toISOString()}],
    balance: 33.20, ledger: [{amount: 1}]
  };
  const names = ["SNPAY_MERCHANT_ID", "SNPAY_PRIVATE_KEY_FILE", "SNPAY_PLATFORM_PUBLIC_KEY_FILE", "SNPAY_SITE_URL", "SNPAY_API_BASE"];
  const prior = Object.fromEntries(names.map(k => [k, process.env[k]]));
  Object.assign(process.env, {SNPAY_MERCHANT_ID: "900001", SNPAY_PRIVATE_KEY_FILE: "test-private.pem", SNPAY_PLATFORM_PUBLIC_KEY_FILE: "test-platform.pem", SNPAY_SITE_URL: "https://site.example.invalid", SNPAY_API_BASE: "https://api.snpay.cn"});
  const provider = load("lib/payments/providers/snpay.ts", {
    "node:fs": {readFileSync(file) {if (file === "test-private.pem") return keys.privateKey; if (file === "test-platform.pem") return keys.publicKey; throw Error("UNEXPECTED_FILE");}},
    "@/lib/payments/providers/snpay-core.mjs": core,
  }).snpayProvider;
  try { return await work({data, provider}); }
  finally {for (const k of names) {if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k];}}
}

for (const method of ["POST", "GET", "GET_REORDERED", "GET_INVALID", "GET_EMPTY", "EXPIRED_IN", "EXPIRED_LATE", "EXPIRED_MISSING", "EXPIRED_INVALID", "FAILED", "CLOSED", "PENDING"]) {
test(`${method} callback traverses canonical handler without duplicate or invalid credit`, async () => harness({}, async h => {

  const scenario = method.startsWith("EXPIRED") || ["FAILED","CLOSED","PENDING"].includes(method);
  const completes = ["EXPIRED_IN", "PENDING"].includes(method);
  if (scenario) {
    h.data.sessions[0].status = method.startsWith("EXPIRED") ? "expired" : method.toLowerCase();
    h.data.recharge.status = h.data.sessions[0].status;
    h.data.balance = 32.20; h.data.ledger = [];
    if (method.startsWith("EXPIRED")) {
      h.data.sessions[0].expires_at = new Date(Date.now()-10000).toISOString();
      h.data.recharge.expires_at = h.data.sessions[0].expires_at;
    }
  }
  const before = structuredClone(h.data), callbackLogs = [];
  let completionCalls = 0;
  const callbackClient = {
    from(table) {
      assert.ok(["payment_sessions", "account_recharges", "payment_callback_logs", "payment_reconciliations"].includes(table));
      const rows = table === "payment_sessions" ? h.data.sessions
        : table === "account_recharges" ? [h.data.recharge] : callbackLogs;
      let patch = null, allowed = () => true;
      const b = { select: () => b, eq: () => b,
        in(_column, statuses) { allowed = x => statuses.includes(x.status); return b; },
        insert(value) { assert.equal(table, "payment_callback_logs"); callbackLogs.push({ id: "log-test", ...value }); return b; },
        update(value) { patch = value; return b; },
        upsert() { return b; },
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
    "@/lib/payments/complete-payment-service": { completePayment: () => { completionCalls++; assert.equal(completes,true); h.data.sessions[0].status="paid"; h.data.recharge.status="paid"; return {ok:true,idempotent:false,businessType:"recharge",businessId:"r-test"}; } },
    "@/lib/payments/payment-errors": { getSafeErrorMessage: () => "safe_error" },
    "@/lib/payments/payment-status-machine": load("lib/payments/payment-status-machine.ts", {}),
    "@/lib/payments/providers": {
      isPaymentChannelCode: c => c === "alipay", normalizeProviderPaymentStatus: s => s,
      resolveProviderForExistingSession: () => h.provider,
    },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => callbackClient },
  });
  const payload = { pid: "900001", timestamp: String(Math.floor(Date.now()/1000)), sign_type: "RSA",
    out_trade_no: "PS_TEST_12345678", trade_no: "SN_TEST_123", type: "alipay", money: "1.00",
    trade_status: "TRADE_SUCCESS", endtime: new Date(Date.now()-30000).toISOString().replace(/\.\d{3}Z$/, "Z") };
  if (method === "EXPIRED_LATE") payload.endtime = new Date(Date.now()-1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  if (method === "EXPIRED_MISSING") delete payload.endtime;
  if (method === "EXPIRED_INVALID") payload.endtime = "invalid-time";
  payload.sign = core.createSnpaySignature(payload, keys.privateKey);
  const oldInfo = console.info; console.info = () => {};
  try {
    if (method === "GET_INVALID") payload.sign = "invalid";
    const entries = Object.entries(payload);
    if (method === "GET_REORDERED") entries.reverse();
    const query = method === "GET_EMPTY" ? "" : new URLSearchParams(entries).toString();
    const request = method === "POST"
      ? new Request("https://site.example.invalid/api/payments/callback/alipay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : new Request("https://site.example.invalid/api/payments/callback/alipay?" + query);
    const response = await callback.handlePaymentCallback(request, "alipay");
    assert.equal(response.status, ["GET_INVALID", "GET_EMPTY", "FAILED", "CLOSED", "EXPIRED_INVALID", "EXPIRED_MISSING"].includes(method) ? 400 : 200);
    if (response.status === 200) assert.equal(await response.text(), "success");
  } finally { console.info = oldInfo; }
  assert.equal(completionCalls, completes ? 1 : 0);
  if (!completes && !scenario) assert.deepEqual(h.data, before);
  if (!completes) { assert.equal(h.data.balance,before.balance); assert.deepEqual(h.data.ledger,before.ledger); assert.equal(h.data.sessions[0].status,before.sessions[0].status); }
  else assert.equal(h.data.sessions[0].status,"paid");
  if (scenario) {
    if (completes) assert.equal(callbackLogs[0].process_result,"success");
    else assert.ok(["processing_failed","signature_failed"].includes(callbackLogs[0].process_result));
  } else if (method === "GET_INVALID") {
    assert.equal(callbackLogs[0].signature_result, "failed");
    assert.equal(callbackLogs[0].process_result, "signature_failed");
  } else if (method === "GET_EMPTY") {
    assert.equal(callbackLogs[0].process_result, "business_not_found");
  } else {
    assert.equal(callbackLogs[0].signature_result, "success");
    assert.equal(callbackLogs[0].process_result, "duplicate");
  }
}));
}

