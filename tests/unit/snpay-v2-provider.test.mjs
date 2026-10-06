import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  constants,
  generateKeyPairSync,
  sign as rsaSign,
} from "node:crypto";

import {
  createSnpayClient,
  createSnpaySignature,
  normalizeSnpayPaidAt,
  parseSnpayCallbackBody,
  selectSnpayPaymentArtifact,
  snpayCanonicalString,
  snpayChannelForType,
  snpayTypeForChannel,
  verifySnpaySignedPayload,
} from "../../lib/payments/providers/snpay-core.mjs";
import { callbackSessionNoCandidate } from "../../lib/payments/callback-session-bootstrap.mjs";
import { evaluateProviderRecoveryEvidence } from "../../lib/payments/provider-contracts.mjs";

const NOW = Date.parse("2026-10-06T03:00:00.000Z");
const TEST_MERCHANT_ID = "900001";
const merchantKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const platformKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const foreignKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function signed(parameters, privateKey = platformKeys.privateKey) {
  const payload = { ...parameters, sign_type: "RSA" };
  payload.sign = rsaSign("RSA-SHA256", Buffer.from(snpayCanonicalString(payload), "utf8"), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING,
  }).toString("base64");
  return payload;
}

function responsePayload(request, overrides = {}) {
  const payload = {
    code: 0,
    pid: TEST_MERCHANT_ID,
    timestamp: String(Math.floor(NOW / 1000)),
    out_trade_no: request.out_trade_no ?? "PS_TEST_12345678",
    trade_no: request.trade_no ?? "SN_TEST_123",
    type: request.type ?? "alipay",
    money: request.money ?? "1.00",
    status: "1",
    endtime: "2026-10-06 10:59:00",
    pay_info: "https://pay.example.test/checkout",
    ...overrides,
  };
  return signed(payload, overrides.__privateKey ?? platformKeys.privateKey);
}

function mockFetch(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (options.networkError) throw new Error("simulated network failure");
    if (options.abortUntilSignal) {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    }
    if (options.httpStatus) return new Response("{}", { status: options.httpStatus });
    if (options.invalidJson) return new Response("not-json", { status: 200 });
    const request = Object.fromEntries(new URLSearchParams(String(init.body)).entries());
    assert.equal(verifySnpaySignedPayload(request, merchantKeys.publicKey, { now: NOW }), true);
    const overrides = typeof options.overrides === "function" ? options.overrides(request, String(url)) : (options.overrides ?? {});
    const payload = responsePayload(request, overrides);
    if (options.tamperSignature) payload.money = "999.00";
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}

function client(options = {}) {
  const mock = mockFetch(options);
  return {
    mock,
    value: createSnpayClient({
      merchantId: TEST_MERCHANT_ID,
      apiBaseUrl: "https://www.snpay.cn",
      merchantPrivateKey: merchantKeys.privateKey,
      platformPublicKey: platformKeys.publicKey,
      fetchImpl: mock.fetchImpl,
      now: () => NOW,
      timeoutMs: options.timeoutMs ?? 2_000,
    }),
  };
}

const createInput = {
  sessionNo: "PS_TEST_12345678",
  channelCode: "alipay",
  notifyUrl: "https://jianlian.shop/api/payments/callback/alipay",
  returnUrl: "https://jianlian.shop/payment?recharge=RC1",
  subject: "Jianlian recharge RC1",
  amount: 1,
  clientIp: "203.0.113.10",
};

const queryInput = {
  providerOrderNo: "SN_TEST_123",
  sessionNo: "PS_TEST_12345678",
  channelCode: "alipay",
  amount: 1,
};

test("canonical signing sorts ASCII keys and excludes sign/sign_type/empty values", () => {
  assert.equal(snpayCanonicalString({ z: "2", sign: "x", sign_type: "RSA", a: "1", empty: "", spaces: "  ", nil: null, list: [] }), "a=1&z=2");
});

test("request signature verifies with matching RSA public key", () => {
  const payload = { pid: TEST_MERCHANT_ID, timestamp: String(Math.floor(NOW / 1000)), sign_type: "RSA" };
  payload.sign = createSnpaySignature(payload, merchantKeys.privateKey);
  assert.equal(verifySnpaySignedPayload(payload, merchantKeys.publicKey, { now: NOW }), true);
});

test("tampered signed field fails RSA verification", () => {
  const payload = signed({ pid: TEST_MERCHANT_ID, timestamp: String(Math.floor(NOW / 1000)), money: "1.00" });
  payload.money = "2.00";
  assert.equal(verifySnpaySignedPayload(payload, platformKeys.publicKey, { now: NOW }), false);
});

test("foreign RSA key fails response verification", () => {
  const payload = signed({ pid: TEST_MERCHANT_ID, timestamp: String(Math.floor(NOW / 1000)) });
  assert.equal(verifySnpaySignedPayload(payload, foreignKeys.publicKey, { now: NOW }), false);
});

test("response timestamp must be exactly ten Unix-second digits", () => {
  const payload = signed({ pid: TEST_MERCHANT_ID, timestamp: "123" });
  assert.equal(verifySnpaySignedPayload(payload, platformKeys.publicKey, { now: NOW }), false);
});

test("stale signed response timestamp fails closed", () => {
  const payload = signed({ pid: TEST_MERCHANT_ID, timestamp: String(Math.floor(NOW / 1000) - 301) });
  assert.equal(verifySnpaySignedPayload(payload, platformKeys.publicKey, { now: NOW }), false);
});

test("future signed response timestamp fails closed", () => {
  const payload = signed({ pid: TEST_MERCHANT_ID, timestamp: String(Math.floor(NOW / 1000) + 301) });
  assert.equal(verifySnpaySignedPayload(payload, platformKeys.publicKey, { now: NOW }), false);
});

test("channel mapping covers Alipay and WeChat only", () => {
  assert.equal(snpayTypeForChannel("alipay"), "alipay");
  assert.equal(snpayTypeForChannel("wechat"), "wxpay");
  assert.equal(snpayChannelForType("wxpay"), "wechat");
});

test("unsupported channel fails closed", () => {
  assert.throws(() => snpayTypeForChannel("usdt_bep20"), /不支持/);
});

test("trusted paid time parses documented local timestamp into an instant", () => {
  assert.equal(normalizeSnpayPaidAt("2026-10-06 10:59:00"), "2026-10-06T02:59:00.000Z");
});

test("malformed trusted paid time is rejected", () => {
  assert.equal(normalizeSnpayPaidAt("tomorrow"), null);
  assert.equal(normalizeSnpayPaidAt("2026-02-31 10:00:00"), null);
});

test("callback body parser accepts x-www-form-urlencoded", () => {
  assert.deepEqual(parseSnpayCallbackBody("out_trade_no=PS_TEST_12345678&type=alipay"), { out_trade_no: "PS_TEST_12345678", type: "alipay" });
});

test("callback body parser accepts JSON without evaluating values", () => {
  assert.deepEqual(parseSnpayCallbackBody('{"out_trade_no":"PS_TEST_12345678"}'), { out_trade_no: "PS_TEST_12345678" });
});

test("safe HTTPS payment artifact becomes redirect", () => {
  assert.equal(selectSnpayPaymentArtifact({ pay_info: "https://pay.example.test/a" }).paymentType, "redirect");
});

test("opaque QR payload remains local QR data", () => {
  assert.equal(selectSnpayPaymentArtifact({ pay_info: "provider-qr-payload" }).paymentType, "qrcode");
});

test("known app scheme becomes a deep link", () => {
  assert.equal(selectSnpayPaymentArtifact({ pay_info: "alipays://platformapi/startapp" }).paymentType, "deeplink");
});

test("unsafe script payment URL is rejected", () => {
  assert.throws(() => selectSnpayPaymentArtifact({ pay_info: "javascript:alert(1)" }), /不安全/);
  assert.throws(() => selectSnpayPaymentArtifact({ pay_info: "https://user:password@pay.example.test/a" }), /不安全/);
});

test("Alipay create uses exact V2 endpoint and returns verified provider identity", async () => {
  const { value, mock } = client();
  const result = await value.createPayment(createInput);
  assert.equal(mock.calls[0].url, "https://www.snpay.cn/api/pay/create");
  assert.equal(result.providerOrderNo, "SN_TEST_123");
  assert.equal(result.paymentType, "redirect");
});

test("WeChat create maps channel to wxpay", async () => {
  const { value, mock } = client({ overrides: (request) => ({ type: request.type, pay_info: "weixin://wxpay/test" }) });
  const result = await value.createPayment({ ...createInput, channelCode: "wechat", notifyUrl: "https://jianlian.shop/api/payments/callback/wechat" });
  assert.equal(Object.fromEntries(new URLSearchParams(mock.calls[0].init.body)).type, "wxpay");
  assert.equal(result.paymentType, "deeplink");
});

test("create uses form encoding, ten-digit seconds and normal fetch TLS", async () => {
  const { value, mock } = client();
  await value.createPayment(createInput);
  const call = mock.calls[0];
  const fields = Object.fromEntries(new URLSearchParams(call.init.body));
  assert.match(call.init.headers["content-type"], /application\/x-www-form-urlencoded/);
  assert.match(fields.timestamp, /^\d{10}$/);
  assert.equal(fields.sign_type, "RSA");
  assert.equal("agent" in call.init, false);
});

test("create rejects an invalid response signature", async () => {
  const { value } = client({ tamperSignature: true });
  await assert.rejects(value.createPayment(createInput), { code: "SNPAY_RESPONSE_SIGNATURE_INVALID" });
});

test("create rejects merchant identity mismatch", async () => {
  const { value } = client({ overrides: { pid: "9999" } });
  await assert.rejects(value.createPayment(createInput), { code: "SNPAY_MERCHANT_MISMATCH" });
});

test("create rejects merchant order identity mismatch", async () => {
  const { value } = client({ overrides: { out_trade_no: "PS_FOREIGN_12345678" } });
  await assert.rejects(value.createPayment(createInput), { code: "SNPAY_ORDER_IDENTITY_MISMATCH" });
});

test("create rejects amount mismatch when amount is returned", async () => {
  const { value } = client({ overrides: { money: "2.00" } });
  await assert.rejects(value.createPayment(createInput), { code: "SNPAY_AMOUNT_MISMATCH" });
});

test("create rejects channel mismatch", async () => {
  const { value } = client({ overrides: { type: "wxpay" } });
  await assert.rejects(value.createPayment(createInput), { code: "SNPAY_CHANNEL_MISMATCH" });
});

test("create rejects missing provider order identity", async () => {
  const { value } = client({ overrides: { trade_no: "" } });
  await assert.rejects(value.createPayment(createInput), { code: "SNPAY_PROVIDER_ORDER_MISSING" });
});

test("paid query requires verified business response and normalizes paid", async () => {
  const { value, mock } = client();
  const result = await value.queryPayment(queryInput);
  assert.equal(mock.calls[0].url, "https://www.snpay.cn/api/pay/query");
  assert.equal(result.paid, true);
  assert.equal(result.status, "paid");
  assert.equal(result.paidAt, "2026-10-06T02:59:00.000Z");
});

test("unpaid query normalizes to pending without trusted paid time", async () => {
  const { value } = client({ overrides: { status: "0", endtime: "" } });
  const result = await value.queryPayment(queryInput);
  assert.equal(result.paid, false);
  assert.equal(result.status, "pending");
  assert.equal(result.paidAt, null);
});

test("query rejects invalid response signature", async () => {
  const { value } = client({ tamperSignature: true });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_RESPONSE_SIGNATURE_INVALID" });
});

test("query rejects amount mismatch", async () => {
  const { value } = client({ overrides: { money: "2.00" } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_AMOUNT_MISMATCH" });
});

test("query rejects merchant order mismatch", async () => {
  const { value } = client({ overrides: { out_trade_no: "PS_FOREIGN_12345678" } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_ORDER_IDENTITY_MISMATCH" });
});

test("query rejects provider order mismatch", async () => {
  const { value } = client({ overrides: { trade_no: "SN_FOREIGN" } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_PROVIDER_ORDER_MISMATCH" });
});

test("query rejects provider channel mismatch", async () => {
  const { value } = client({ overrides: { type: "wxpay" } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_CHANNEL_MISMATCH" });
});

test("paid query rejects missing or malformed paid_at", async () => {
  const { value } = client({ overrides: { endtime: "not-a-time" } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_PAID_AT_INVALID" });
});

test("query rejects unknown provider status", async () => {
  const { value } = client({ overrides: { status: "mystery" } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_STATUS_INVALID" });
});

function callbackPayload(overrides = {}) {
  return signed({
    code: 0,
    pid: TEST_MERCHANT_ID,
    timestamp: String(Math.floor(NOW / 1000)),
    out_trade_no: "PS_TEST_12345678",
    trade_no: "SN_TEST_123",
    type: "alipay",
    money: "1.00",
    trade_status: "TRADE_SUCCESS",
    endtime: "2026-10-06 10:59:00",
    ...overrides,
  });
}

function formBody(payload) {
  return new URLSearchParams(Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, String(value)]))).toString();
}

test("valid signed callback verifies before parsing paid evidence", () => {
  const { value } = client();
  const body = formBody(callbackPayload());
  assert.equal(value.verifyCallback(body, { channelCode: "alipay" }), true);
  const parsed = value.parseCallback(body, { channelCode: "alipay" });
  assert.equal(parsed.status, "paid");
  assert.equal(parsed.sessionNo, "PS_TEST_12345678");
});

test("callback signature failure is fail closed", () => {
  const { value } = client();
  const payload = callbackPayload();
  payload.money = "9.00";
  const body = formBody(payload);
  assert.equal(value.verifyCallback(body, { channelCode: "alipay" }), false);
  assert.throws(() => value.parseCallback(body, { channelCode: "alipay" }), { code: "SNPAY_CALLBACK_SIGNATURE_INVALID" });
});

test("callback merchant mismatch is rejected even with a valid signature", () => {
  const { value } = client();
  const body = formBody(callbackPayload({ pid: "9999" }));
  assert.equal(value.verifyCallback(body, { channelCode: "alipay" }), false);
});

test("callback channel mismatch is rejected even with a valid signature", () => {
  const { value } = client();
  const body = formBody(callbackPayload({ type: "wxpay" }));
  assert.equal(value.verifyCallback(body, { channelCode: "alipay" }), false);
});

test("callback replay parses the same immutable evidence without side effects", () => {
  const { value } = client();
  const body = formBody(callbackPayload());
  assert.deepEqual(value.parseCallback(body, { channelCode: "alipay" }), value.parseCallback(body, { channelCode: "alipay" }));
});

test("callback amount is parsed from signed provider evidence", () => {
  const { value } = client();
  assert.equal(value.parseCallback(formBody(callbackPayload()), { channelCode: "alipay" }).amount, 1);
});

test("callback missing provider transaction identity is rejected", () => {
  const { value } = client();
  assert.throws(() => value.parseCallback(formBody(callbackPayload({ trade_no: "" })), { channelCode: "alipay" }), { code: "SNPAY_PROVIDER_ORDER_MISSING" });
});

test("callback stale timestamp is rejected", () => {
  const { value } = client();
  const body = formBody(callbackPayload({ timestamp: String(Math.floor(NOW / 1000) - 301) }));
  assert.equal(value.verifyCallback(body, { channelCode: "alipay" }), false);
});

test("real AbortSignal timeout stops a hung request", async () => {
  const { value } = client({ abortUntilSignal: true, timeoutMs: 1_000 });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_TIMEOUT" });
});

test("network errors are normalized without leaking details", async () => {
  const { value } = client({ networkError: true });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_NETWORK_ERROR" });
});

test("HTTP errors fail closed before parsing payment evidence", async () => {
  const { value } = client({ httpStatus: 503 });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_HTTP_ERROR" });
});

test("business errors fail closed even when HTTP is successful", async () => {
  const { value } = client({ overrides: { code: 1001 } });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_API_REJECTED" });
});

test("malformed JSON fails closed", async () => {
  const { value } = client({ invalidJson: true });
  await assert.rejects(value.queryPayment(queryInput), { code: "SNPAY_RESPONSE_INVALID" });
});

test("form callback bootstrap extracts only a bounded session candidate", () => {
  assert.equal(callbackSessionNoCandidate("out_trade_no=PS_TEST_12345678&money=999&sign=untrusted"), "PS_TEST_12345678");
  assert.equal(callbackSessionNoCandidate("out_trade_no=RC_TEST_12345678"), null);
});

test("callback pipeline pins persisted provider and uses canonical completion only", () => {
  const source = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
  assert.match(source, /callbackProvider = resolveProviderForExistingSession\(session\)/);
  assert.match(source, /callbackSessionIdentityMatches/);
  assert.match(source, /await completePayment\(/);
  assert.doesNotMatch(source, /creditBalance|balance_transactions.*insert/s);
});

test("SNPAY cannot complete a Liuhaoyi session or mutate session provider", () => {
  const callback = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
  const bootstrap = readFileSync(new URL("../../lib/payments/callback-session-bootstrap.mjs", import.meta.url), "utf8");
  const sessionService = readFileSync(new URL("../../lib/payments/payment-session-service.ts", import.meta.url), "utf8");
  assert.match(bootstrap, /session\.provider === parsed\.provider/);
  assert.match(callback, /provider: session\.provider/);
  assert.match(sessionService, /p_provider: input\.channel\.provider/);
  assert.doesNotMatch(sessionService, /provider:\s*providerResult/);
});

test("Stage 1 query is registered but automatic SNPAY recovery stays disabled", () => {
  const registry = readFileSync(new URL("../../lib/payments/providers.ts", import.meta.url), "utf8");
  const reconciliation = readFileSync(new URL("../../lib/payments/reconciliation-service.ts", import.meta.url), "utf8");
  assert.match(registry, /snpay: snpayProvider/);
  assert.match(registry, /snpay: noRecovery/);
  assert.match(reconciliation, /!policy\?\.supportsRecovery \|\| !policy\.allowAutoCompletion/);
});

const recoverySession = {
  userId: "user-test",
  businessNo: "RC_TEST",
  businessType: "recharge",
  channelCode: "alipay",
  provider: "snpay",
  currency: "CNY",
  payableAmount: 1,
  status: "pending",
  expiresAt: "2026-10-06T03:00:00.000Z",
};
const recoveryRecharge = {
  userId: "user-test",
  rechargeNo: "RC_TEST",
  channelCode: "alipay",
  currency: "CNY",
  status: "pending",
  expiresAt: "2026-10-06T03:00:00.000Z",
};
const recoveryProvider = {
  provider: "snpay",
  channelCode: "alipay",
  found: true,
  paid: true,
  providerTransactionIdPresent: true,
  amount: 1,
  currency: "CNY",
  providerPaidAt: "2026-10-06T02:59:00.000Z",
};

test("SNPAY paid-before-expiry evidence remains eligible when processed later", () => {
  assert.deepEqual(evaluateProviderRecoveryEvidence({
    session: recoverySession,
    recharge: recoveryRecharge,
    provider: recoveryProvider,
    ledgerCount: 0,
  }), { eligible: true, reason: "evidence_matches" });
});

test("SNPAY paid-after-expiry evidence is rejected", () => {
  assert.deepEqual(evaluateProviderRecoveryEvidence({
    session: recoverySession,
    recharge: recoveryRecharge,
    provider: { ...recoveryProvider, providerPaidAt: "2026-10-06T03:00:01.000Z" },
    ledgerCount: 0,
  }), { eligible: false, reason: "paid_outside_validity" });
});

test("SNPAY missing trusted paid_at is manual-review evidence, not eligibility", () => {
  assert.deepEqual(evaluateProviderRecoveryEvidence({
    session: recoverySession,
    recharge: recoveryRecharge,
    provider: { ...recoveryProvider, providerPaidAt: null },
    ledgerCount: 0,
  }), { eligible: false, reason: "paid_outside_validity" });
});

test("SNPAY wrong currency cannot enter completion eligibility", () => {
  assert.deepEqual(evaluateProviderRecoveryEvidence({
    session: recoverySession,
    recharge: recoveryRecharge,
    provider: { ...recoveryProvider, currency: "USDT" },
    ledgerCount: 0,
  }), { eligible: false, reason: "amount_or_currency_mismatch" });
});

test("SNPAY evidence cannot complete a session pinned to another provider", () => {
  assert.deepEqual(evaluateProviderRecoveryEvidence({
    session: { ...recoverySession, provider: "liuhaoyi" },
    recharge: recoveryRecharge,
    provider: recoveryProvider,
    ledgerCount: 0,
  }), { eligible: false, reason: "channel_or_provider_mismatch" });
});

test("exactly-once callback path retains row locks and provider transaction uniqueness guards", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260926130000_liuhaoyi_paid_before_expiry_completion.sql", import.meta.url), "utf8").toLowerCase();
  assert.match(migration, /create or replace function public\.complete_payment_session/);
  assert.match(migration, /for update/);
  assert.match(migration, /provider_transaction_id = nullif\(p_provider_transaction_id/);
  assert.match(migration, /already_paid|idempotent/);
});

test("SNPAY adapter has safe unsupported close and no refund implementation", () => {
  const source = readFileSync(new URL("../../lib/payments/providers/snpay.ts", import.meta.url), "utf8");
  assert.match(source, /SNPAY_CLOSE_UNSUPPORTED/);
  assert.doesNotMatch(source, /createRefund|queryRefund/);
});

test("SNPAY implementation never disables TLS verification or shells out to curl", () => {
  const core = readFileSync(new URL("../../lib/payments/providers/snpay-core.mjs", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../../lib/payments/providers/snpay.ts", import.meta.url), "utf8");
  for (const source of [core, adapter]) {
    assert.doesNotMatch(source, /rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|curl\s+-k|execSync|spawn/);
  }
});

test("tests contain generated fake keys and no real credential fixture", () => {
  const source = readFileSync(new URL("./snpay-v2-provider.test.mjs", import.meta.url), "utf8");
  assert.match(source, /generateKeyPairSync/);
  assert.doesNotMatch(source, /BEGIN (?:RSA )?PRIVATE KEY/);
  assert.doesNotMatch(source, /\/etc\/jianlian\/snpay-readonly/);
});
