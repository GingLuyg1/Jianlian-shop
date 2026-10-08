import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as core from "../../lib/payments/providers/snpay-core.mjs";
import * as readiness from "../../lib/payments/manual-channel-readiness.mjs";
import * as expiry from "../../lib/payments/payment-expiry.mjs";
import * as contracts from "../../lib/payments/provider-contracts.mjs";
import * as limits from "../../lib/payments/liuhaoyi-limits.mjs";
import * as liuhaoyi from "../../lib/payments/providers/liuhaoyi-core.mjs";
import * as submit from "../../lib/payments/providers/liuhaoyi-submit.mjs";
import * as reuse from "../../lib/payments/payment-session-reuse.mjs";
import { buildRechargePublicFailure } from "../../lib/payments/recharge-api-failure.mjs";

const source = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const status = loadTs("lib/recharges/status-machine.ts", {});
const keys = () => generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const merchant = keys(), platform = keys(), foreign = keys();
const NOW = Date.now();
const config = {
  merchantId: "900001", apiBaseUrl: "https://provider.example.test",
  merchantPrivateKey: merchant.privateKey, platformPublicKey: platform.publicKey,
  now: () => NOW,
};
const input = {
  sessionNo: "PS_TEST_DIAGNOSTIC", channelCode: "alipay", amount: 1,
  notifyUrl: "https://site.example.test/callback", returnUrl: "https://site.example.test/return",
  subject: "test recharge", clientIp: "192.0.2.10",
};
function signed(payload, privateKey = platform.privateKey) {
  const value = { ...payload, sign_type: "RSA", timestamp: String(Math.floor(NOW / 1000)) };
  return { ...value, sign: core.createSnpaySignature(value, privateKey) };
}
function fixture(payload) {
  const calls = [], logs = [];
  const fetchImpl = async (url, init) => {
    assert.equal(new URL(url).hostname, "provider.example.test");
    assert.equal(init.method, "POST");
    calls.push({ path: new URL(url).pathname });
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  return { calls, logs, fetchImpl, client: core.createSnpayClient({ ...config, fetchImpl }) };
}
async function rejected(payload, operation = "create") {
  const f = fixture(payload);
  const previous = console.error;
  console.error = (...args) => f.logs.push(args);
  try {
    await assert.rejects(operation === "create" ? f.client.createPayment(input) : f.client.queryPayment({
      providerOrderNo: "PROVIDER_TEST_ORDER", sessionNo: input.sessionNo, channelCode: "alipay", amount: 1,
    }), (error) => { f.error = error; return error.code === "SNPAY_API_REJECTED"; });
  } finally { console.error = previous; }
  assert.equal(f.calls.length, 1);
  return f;
}

test("HTTP success business rejection retains bounded primitive code and generic error", async () => {
  for (const code of [1001, "NO_CHANNEL"]) {
    const { error } = await rejected({ code, msg: "通道不可用" });
    assert.equal(error.providerBusinessCode, String(code));
    assert.equal(error.providerBusinessMessageSafe, "通道不可用");
    assert.equal(error.message, "SNPAY 拒绝了请求");
  }
});

test("business code rejects objects, non-finite values, unsafe syntax and oversized input", () => {
  for (const code of [{ key: "secret" }, [1], Infinity, "x".repeat(33), "sign=abc", "<code>", "sb_secret_fake", "eyJfake"]) {
    assert.equal(core.getSnpayBusinessErrorDiagnostics({ code: "SNPAY_API_REJECTED", providerBusinessCode: code }).providerBusinessCode, undefined);
  }
  assert.deepEqual(core.getSnpayBusinessErrorDiagnostics({ code: "LIUHAOYI_ERROR", providerBusinessCode: 1 }), {});
});

test("message candidates use the first safe string across msg/message/error/errmsg", async () => {
  for (const field of ["msg", "message", "error", "errmsg"]) {
    const { error } = await rejected({ code: 1, [field]: "  商户支付通道未配置  " });
    assert.equal(error.providerBusinessMessageSafe, "商户支付通道未配置");
  }
  const { error } = await rejected({ code: 1, msg: { unsafe: true }, message: "", error: "合法原因", errmsg: "later" });
  assert.equal(error.providerBusinessMessageSafe, "合法原因");
});

test("message strips control and bidi characters and bounds oversized Unicode text", async () => {
  const { error } = await rejected({ code: 1, msg: " \u0000通\n道\r不可用\u202e " });
  assert.equal(error.providerBusinessMessageSafe, "通道不可用");
  const long = await rejected({ code: 1, msg: "错误".repeat(200) });
  assert.equal(Array.from(long.error.providerBusinessMessageSafe).length, 200);
});

test("HTML, JSON, authenticated URL, canonical fields and key material never enter diagnostics", async () => {
  for (const msg of ["<b>error</b>", '{"sign":"fake"}', "https://pay.example.test/?token=secret", "sign=FAKE_SIGNATURE", "timestamp=1234567890&pid=900001", merchant.privateKey, platform.publicKey, "sb_secret_TEST_VALUE"]) {
    const { error } = await rejected({ code: 1, msg });
    assert.equal(error.providerBusinessMessageSafe, undefined);
  }
  const token = "A".repeat(80);
  const { error } = await rejected({ code: 1, msg: `错误 ${token}` });
  assert.equal(error.providerBusinessMessageSafe, "错误 [redacted]");
  const result = await rejected({ code: 1, msg: "https://host.test/?key=fake", errmsg: "安全原因" });
  assert.equal(result.error.providerBusinessMessageSafe, "安全原因");
});

test("unsigned and invalid-signed business errors both fail closed as untrusted diagnostics", async () => {
  for (const payload of [{ code: 1, msg: "denied" }, signed({ code: 1, msg: "denied" }, foreign.privateKey)]) {
    assert.equal((await rejected(payload)).error.providerErrorResponseSignatureVerified, false);
  }
});

test("valid signed business error is verified for diagnostics but never accepted as success", async () => {
  const { error, logs } = await rejected(signed({ code: 1, msg: "denied" }));
  assert.equal(error.providerErrorResponseSignatureVerified, true);
  assert.equal(logs[0][1].providerErrorResponseSignatureVerified, true);
});

test("business diagnostics logs are a strict field allowlist for create and query", async () => {
  for (const operation of ["create", "query"]) {
    const payload = signed({ code: 1, msg: "denied", secret: "not-for-logs", trade_no: "not-for-metadata" });
    const { error, logs } = await rejected(payload, operation);
    const fields = logs[0][1];
    assert.deepEqual(Object.keys(fields).sort(), ["provider", "operation", "localErrorCode", "providerBusinessCode", "providerMessageSafe", "providerErrorResponseSignatureVerified", "httpStatus", "durationMs"].sort());
    assert.equal(fields.operation, operation);
    assert.equal(fields.httpStatus, 200);
    assert.ok(Number.isFinite(fields.durationMs) && fields.durationMs >= 0);
    const serialized = JSON.stringify({ error, logs });
    for (const sensitive of [payload.sign, "not-for-logs", "not-for-metadata", merchant.privateKey, platform.publicKey]) assert.equal(serialized.includes(sensitive), false);
    assert.equal("payload" in error, false);
    assert.equal("sign" in error, false);
  }
});

test("successful business response still requires verified RSA and fresh timestamp", async () => {
  const stale = { ...signed({ code: 0 }), timestamp: "0000000000" };
  stale.sign = core.createSnpaySignature(stale, platform.privateKey);
  for (const payload of [{ code: 0 }, signed({ code: 0 }, foreign.privateKey), stale]) {
    const f = fixture(payload);
    await assert.rejects(f.client.createPayment(input), (error) => error.code !== "SNPAY_API_REJECTED");
  }
});

function loadTs(path, deps, processFixture = process) {
  const module = { exports: {} };
  const code = ts.transpileModule(source(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", "process", code)((id) => {
    if (id in deps) return deps[id];
    throw new Error(`Unexpected isolated dependency: ${id}`);
  }, module, module.exports, processFixture);
  return module.exports;
}

async function serviceHarness(providerCode = "snpay", payload = signed({ code: 1007, msg: "支付通道未配置", secret: "not-for-metadata" })) {
  const f = fixture(payload);
  const provider = loadTs("lib/payments/providers/snpay.ts", {
    "server-only": {},
    "node:fs": { readFileSync: (path) => path === "private-test-file" ? merchant.privateKey : platform.publicKey },
    "@/lib/payments/providers/snpay-core.mjs": { ...core, createSnpayClient: (configuration) => core.createSnpayClient({ ...configuration, fetchImpl: f.fetchImpl, now: () => NOW }) },
  }, { env: { SNPAY_MERCHANT_ID: config.merchantId, SNPAY_API_BASE: config.apiBaseUrl, SNPAY_SITE_URL: "https://site.example.test", SNPAY_PRIVATE_KEY_FILE: "private-test-file", SNPAY_PLATFORM_PUBLIC_KEY_FILE: "public-test-file" } });
  const writes = [], rpcCalls = [];
  const originalMetadata = { initializing: true, provider: providerCode, reservationTag: "keep-me" };
  const db = {
    rpc: async (name, parameters) => {
      assert.equal(name, "reserve_payment_session");
      rpcCalls.push(parameters);
      return { data: { created: true, retryGuardVersion: 1, session: { metadata: originalMetadata } }, error: null };
    },
    from: (table) => {
      assert.ok(["account_recharges", "payment_sessions", "payment_channels"].includes(table), `Forbidden funding table: ${table}`);
      let patch;
      const q = {};
      for (const method of ["select", "eq", "neq", "in", "gt", "order", "limit", "or"]) q[method] = () => q;
      q.update = (value) => { assert.equal(table, "payment_sessions"); patch = value; return q; };
      q.maybeSingle = async () => ({ data: table === "account_recharges" ? {
        id: "test-recharge-id", recharge_no: "RC_TEST_DIAGNOSTIC", user_id: "test-user", status: "pending", requested_amount: 1, fee_amount: 0, payable_amount: 1, currency: "CNY", channel_code: "alipay", expires_at: new Date(NOW + 3600000).toISOString(),
      } : table === "payment_channels" ? {
        channel: "alipay", code: "alipay", provider: providerCode, provider_name: providerCode,
        currency: "CNY", enabled: true, configured: true, network: null, min_amount: 1, minimum_amount: 1, fee_rate: 0, public_config: { review_mode: "provider", maximum_amount: 2000 },
      } : null, error: null });
      q.then = (resolve, reject) => { if (patch) writes.push(patch); return Promise.resolve({ error: null }).then(resolve, reject); };
      return q;
    },
  };
  const deps = {
    "server-only": {}, "@/lib/payments/payment-errors": { getSafeErrorMessage: (e, fallback) => e instanceof Error ? e.message : fallback },
    "@/lib/payments/payment-expiry.mjs": expiry, "@/lib/payments/provider-contracts.mjs": contracts,
    "@/lib/payments/liuhaoyi-limits.mjs": limits, "@/lib/payments/providers/liuhaoyi-core.mjs": liuhaoyi,
    "@/lib/payments/providers/liuhaoyi-submit.mjs": submit, "@/lib/payments/providers/snpay-core.mjs": core,
    "@/lib/payments/payment-session-reuse.mjs": reuse, "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => db },
    "@/lib/payments/providers": {
      getPaymentProviderCapabilities: () => ({ supportsCreate: true, supportedChannels: ["alipay"], supportedCurrencies: ["CNY"], minimumAmount: 1, maximumAmount: 2000 }),
      resolveProviderForNewPayment: () => providerCode === "snpay" ? provider.snpayProvider : { createPayment: async () => { throw Object.assign(new Error("legacy generic error"), { code: "LIUHAOYI_TEST_ERROR" }); } },
    },
  };
  deps["@/lib/payments/recharge-utils"] = loadTs("lib/payments/recharge-utils.ts", { "@/lib/payments/manual-channel-readiness.mjs": readiness, "@/lib/recharges/status-machine": status });
  const service = loadTs("lib/payments/payment-session-service.ts", deps);
  const previous = console.error;
  console.error = (...args) => f.logs.push(args);
  try {
    await assert.rejects(service.createPaymentSession({ businessType: "recharge", businessNo: "RC_TEST_DIAGNOSTIC", userId: "test-user", channelCode: "alipay", clientIp: "192.0.2.10" }), (error) => {
      f.error = error;
      return error.code === (providerCode === "snpay" ? "SNPAY_API_REJECTED" : "LIUHAOYI_TEST_ERROR");
    });
  } finally { console.error = previous; }
  return { ...f, writes, rpcCalls, originalMetadata };
}

test("actual provider/service chain persists only safe failed-session diagnostics and preserves metadata", async () => {
  const f = await serviceHarness();
  assert.equal(f.calls.length, 1);
  assert.equal(f.error.providerBusinessCode, "1007");
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].status, "failed");
  assert.equal(f.writes[0].last_error, "SNPAY 拒绝了请求");
  assert.deepEqual(f.writes[0].metadata, {
    ...f.originalMetadata, initializing: false, errorCode: "SNPAY_API_REJECTED",
    providerBusinessCode: "1007", providerBusinessMessageSafe: "支付通道未配置", providerErrorResponseSignatureVerified: true,
  });
  assert.equal(f.originalMetadata.initializing, true);
  assert.equal(f.rpcCalls.length, 1);
  assert.equal(f.rpcCalls[0].p_provider, "snpay");
  const serialized = JSON.stringify({ writes: f.writes, logs: f.logs });
  for (const value of [merchant.privateKey, platform.publicKey, "not-for-metadata"]) assert.equal(serialized.includes(value), false);
  assert.equal("provider_order_no" in f.writes[0], false);
  assert.equal("payment_url" in f.writes[0], false);
});

test("Liuhaoyi failure metadata and generic last_error retain their existing behavior", async () => {
  const f = await serviceHarness("liuhaoyi");
  assert.equal(f.calls.length, 0);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].metadata, { initializing: false, errorCode: "LIUHAOYI_TEST_ERROR" });
  assert.equal(f.writes[0].last_error, "legacy generic error");
});

test("unsigned business rejection persists diagnostics as unverified and never enters funding tables", async () => {
  const f = await serviceHarness("snpay", { code: 1007, msg: "支付通道未配置" });
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].status, "failed");
  assert.equal(f.writes[0].metadata.providerErrorResponseSignatureVerified, false);
  assert.equal(f.writes[0].metadata.providerBusinessCode, "1007");
  assert.equal(f.calls.length, 1);
});

test("public recharge response remains generic and excludes all business diagnostics", () => {
  const failure = buildRechargePublicFailure("service", "test-request");
  assert.equal(failure.status, 503);
  assert.equal(failure.body.code, "RECHARGE_SERVICE_UNAVAILABLE");
  assert.deepEqual(Object.keys(failure.body).sort(), ["code", "error", "requestId"]);
  assert.doesNotMatch(JSON.stringify(failure), /providerBusiness|signature|支付通道未配置/);
});
