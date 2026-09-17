import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFakePaymentProvider } from "./helpers/fake-payment-provider.mjs";
import {
  paymentArtifactFromCreateResult,
  describePaymentFeeSemantics,
  evaluateProviderRecoveryEvidence,
  pinPaymentSessionProvider,
  providerAmountWithinLimits,
  providerFailoverDecision,
  providerSupportsChannel,
} from "../../lib/payments/provider-contracts.mjs";
import { derivePaymentClientDevice } from "../../lib/payments/request-client-device.mjs";
import { callbackSessionIdentityMatches, callbackSessionNoCandidate } from "../../lib/payments/callback-session-bootstrap.mjs";

const capability = {
  minimumAmount: 1,
  maximumAmount: 2000,
  supportedChannels: ["alipay", "wechat"],
  supportedCurrencies: ["CNY"],
};

test("shared device contract recognizes desktop and mobile browsers", () => {
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 Windows Chrome/130"), "pc");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 Macintosh Safari/17"), "pc");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 iPhone Safari/17"), "mobile");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 Android Chrome/130"), "mobile");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 MicroMessenger"), "wechat");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 AlipayClient"), "alipay");
});

test("provider capability combines channel and provider limits", () => {
  assert.equal(providerSupportsChannel(capability, "wechat", "CNY"), true);
  assert.equal(providerSupportsChannel(capability, "usdt_bep20", "USDT"), false);
  assert.equal(providerAmountWithinLimits(capability, { minimumAmount: 1, maximumAmount: 2000 }, 2000), true);
  assert.equal(providerAmountWithinLimits(capability, { minimumAmount: 1, maximumAmount: 2000 }, 2000.01), false);
  assert.equal(providerAmountWithinLimits(capability, { minimumAmount: 1, maximumAmount: 2000 }, 0), false);
});

test("external provider buyer fee never enters site payable or credited principal", () => {
  assert.deepEqual(describePaymentFeeSemantics({
    principalAmount: 1,
    siteFee: 0,
    payableAmount: 1,
    creditedAmount: 1,
    providerExternalFee: 0.03,
  }), {
    principalAmount: 1,
    siteFee: 0,
    payableAmount: 1,
    creditedAmount: 1,
    providerExternalFee: 0.03,
  });
  assert.equal(describePaymentFeeSemantics({ principalAmount: 1, siteFee: 0, payableAmount: 1.03, creditedAmount: 1 }), null);
});

test("artifacts keep QR payload and deep links distinct from HTTPS redirects", () => {
  assert.deepEqual(paymentArtifactFromCreateResult({ paymentType: "redirect", paymentUrl: "https://example.test/pay" }), { type: "redirect", url: "https://example.test/pay" });
  assert.deepEqual(paymentArtifactFromCreateResult({ paymentType: "qrcode", qrCodeValue: "https://example.test/qr" }), { type: "qrcode", payload: "https://example.test/qr" });
  assert.deepEqual(paymentArtifactFromCreateResult({ paymentType: "deeplink", deepLinkUrl: "weixin://wxpay/abc" }), { type: "deeplink", url: "weixin://wxpay/abc" });
  assert.equal(paymentArtifactFromCreateResult({ paymentType: "redirect", paymentUrl: "weixin://wxpay/abc" }), null);
  assert.equal(paymentArtifactFromCreateResult({ paymentType: "redirect", paymentUrl: "https://user:password@example.test/pay" }), null);
});

test("existing session pins provider and forbids automatic live failover", () => {
  assert.equal(pinPaymentSessionProvider({ provider: "liuhaoyi" }, "future_provider"), "liuhaoyi");
  assert.equal(pinPaymentSessionProvider({}, "future_provider"), null);
  assert.equal(providerFailoverDecision({ orderMayExist: true, createRejectedBeforeSubmission: true }), "no_auto_failover");
  assert.equal(providerFailoverDecision({ orderMayExist: false, createRejectedBeforeSubmission: true }), "manual_new_session_only");
});

test("generic recovery evidence fails closed on identity, money, ledger and expiry", () => {
  const session = { userId: "user-1", businessNo: "RC1", businessType: "recharge", channelCode: "wechat", provider: "fake_test_only", currency: "CNY", payableAmount: 1, status: "pending", expiresAt: "2026-09-17T10:30:00Z" };
  const recharge = { userId: "user-1", rechargeNo: "RC1", channelCode: "wechat", currency: "CNY", status: "pending", expiresAt: "2026-09-17T10:30:00Z" };
  const provider = { provider: "fake_test_only", channelCode: "wechat", found: true, paid: true, providerTransactionIdPresent: true, amount: 1, currency: "CNY", providerPaidAt: "2026-09-17T10:00:00Z" };
  const check = (changes = {}) => evaluateProviderRecoveryEvidence({ session, recharge, provider, ledgerCount: 0, ...changes });
  assert.equal(check().eligible, true);
  assert.equal(check({ session: { ...session, userId: "other" } }).eligible, false);
  assert.equal(check({ session: { ...session, provider: "other" } }).eligible, false);
  assert.equal(check({ provider: { ...provider, amount: 2 } }).eligible, false);
  assert.equal(check({ provider: { ...provider, paid: false } }).eligible, false);
  assert.equal(check({ provider: { ...provider, providerTransactionIdPresent: false } }).eligible, false);
  assert.equal(check({ provider: { ...provider, providerPaidAt: "2026-09-17T10:31:00Z" } }).eligible, false);
  assert.equal(check({ ledgerCount: 1 }).eligible, false);
});

test("test-only provider conformance: create, paid query, verified callback and no credit method", async () => {
  const provider = createFakePaymentProvider();
  const input = { sessionNo: "PS_TEST_1", channel: { code: "wechat" }, currency: "CNY", payableAmount: 1 };
  const created = await provider.createPayment(input);
  assert.equal(paymentArtifactFromCreateResult(created).type, "qrcode");
  assert.equal((await provider.queryPayment(input.sessionNo)).paid, false);
  provider.markPaid(input.sessionNo);
  const query = await provider.queryPayment(input.sessionNo);
  assert.equal(query.paid, true);
  assert.equal(query.amount, 1);
  assert.equal(query.providerChannel, "wechat");
  const callback = { sessionNo: input.sessionNo, channel: "wechat", amount: 1, signature: "test-only-secret" };
  assert.equal(await provider.verifyCallback(callback), true);
  assert.equal((await provider.parseCallback(callback)).status, "paid");
  assert.equal(await provider.verifyCallback({ ...callback, signature: "bad" }), false);
  await assert.rejects(provider.parseCallback({ ...callback, amount: 2 }), /MISMATCH/);
  assert.equal("creditBalance" in provider, false);
  assert.equal("completePayment" in provider, false);
  assert.equal(JSON.stringify(query).includes("test-only-secret"), false);
});

test("fake provider stays out of production registry", () => {
  const registry = readFileSync(new URL("../../lib/payments/providers.ts", import.meta.url), "utf8");
  assert.doesNotMatch(registry, /fake-payment-provider|fake_test_only/);
});

test("callback bootstrap accepts only bounded session identity, not payment evidence", () => {
  assert.equal(callbackSessionNoCandidate({ out_trade_no: "PS_TEST_123", money: "999", trade_status: "TRADE_SUCCESS" }), "PS_TEST_123");
  assert.equal(callbackSessionNoCandidate({ out_trade_no: "RC_TEST_123" }), null);
  assert.equal(callbackSessionNoCandidate({ out_trade_no: "PS_TEST_123", sign: "secret" }), "PS_TEST_123");
  assert.equal(callbackSessionNoCandidate({ out_trade_no: "PS" + "x".repeat(158) }), null);
  assert.equal(callbackSessionNoCandidate({ out_trade_no: ["PS_TEST_123"] }), null);
});

test("provider switch retains the historical session adapter and rejects foreign callback", async () => {
  const oldProvider = createFakePaymentProvider({ secret: "old-test-secret" });
  const newProvider = createFakePaymentProvider({ secret: "new-test-secret" });
  const session = { session_no: "PS_TEST_123", provider: "fake_test_only", channel_code: "wechat" };
  await oldProvider.createPayment({ sessionNo: session.session_no, channel: { code: "wechat" }, currency: "CNY", payableAmount: 1 });
  oldProvider.markPaid(session.session_no);
  const currentChannelProvider = newProvider; // Simulate a channel default changed after session creation.
  const registry = { fake_test_only: oldProvider, future_provider: currentChannelProvider };
  const callback = { out_trade_no: session.session_no, sessionNo: session.session_no, channel: "wechat", amount: 1, signature: "old-test-secret" };
  const selected = registry[session.provider];
  assert.equal(callbackSessionNoCandidate(callback), session.session_no);
  assert.equal(await selected.verifyCallback(callback), true);
  assert.equal(callbackSessionIdentityMatches({ session, parsed: await selected.parseCallback(callback), channelCode: "wechat" }), true);
  assert.equal(await currentChannelProvider.verifyCallback(callback), false);
  assert.equal(await selected.verifyCallback({ ...callback, signature: "new-test-secret" }), false);
});

test("unknown session and channel mismatch reject before completion", async () => {
  const provider = createFakePaymentProvider();
  await provider.createPayment({ sessionNo: "PS_TEST_123", channel: { code: "wechat" }, currency: "CNY", payableAmount: 1 });
  provider.markPaid("PS_TEST_123");
  const callback = { out_trade_no: "PS_TEST_123", sessionNo: "PS_TEST_123", channel: "wechat", amount: 1, signature: "test-only-secret" };
  const sessions = new Map([["PS_TEST_123", { session_no: "PS_TEST_123", provider: "fake_test_only", channel_code: "wechat" }]]);
  const completionCalls = [];
  const process = async (payload, routeChannel) => {
    const candidate = callbackSessionNoCandidate(payload);
    const session = candidate && sessions.get(candidate);
    if (!session || session.channel_code !== routeChannel) return "rejected";
    if (!await provider.verifyCallback(payload)) return "rejected";
    const parsed = await provider.parseCallback(payload);
    if (!callbackSessionIdentityMatches({ session, parsed, channelCode: routeChannel })) return "rejected";
    completionCalls.push(parsed.sessionNo);
    return "complete";
  };
  assert.equal(await process({ ...callback, out_trade_no: "PS_UNKNOWN_123" }, "wechat"), "rejected");
  assert.equal(await process(callback, "alipay"), "rejected");
  assert.equal(await process({ ...callback, signature: "future-test-secret" }, "wechat"), "rejected");
  assert.deepEqual(completionCalls, []);
  assert.equal(await process(callback, "wechat"), "complete");
});

test("production callback, query and recovery source pin existing provider", () => {
  const callback = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
  const query = readFileSync(new URL("../../lib/payments/reconciliation-service.ts", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../../lib/payments/liuhaoyi-wechat-recovery-service.ts", import.meta.url), "utf8");
  assert.match(callback, /\.eq\("session_no", sessionNo\)/);
  assert.match(callback, /resolveProviderForExistingSession\(session\)/);
  assert.match(callback, /SESSION_NOT_FOUND/);
  assert.match(callback, /callbackSessionIdentityMatches/);
  assert.match(query, /resolveProviderForExistingSession\(session\)\.queryPayment/);
  assert.match(recovery, /resolveProviderForExistingSession\(session\)/);
});

test("effective limit and optional fee disclosure are provider capability data", () => {
  const channel = { minimumAmount: 1, maximumAmount: 5000 };
  const channelRoute = readFileSync(new URL("../../app/api/recharges/channels/route.ts", import.meta.url), "utf8");
  assert.equal(providerAmountWithinLimits(capability, channel, 2000), true);
  assert.equal(providerAmountWithinLimits(capability, channel, 2000.01), false);
  assert.equal(providerAmountWithinLimits({ ...capability, maximumAmount: 5000 }, { ...channel, maximumAmount: 1000 }, 1001), false);
  assert.equal(({ providerExternalFeeDisclosure: undefined }).providerExternalFeeDisclosure, undefined);
  assert.equal(describePaymentFeeSemantics({ principalAmount: 1, siteFee: 0, payableAmount: 1, creditedAmount: 1.03, providerExternalFee: 0.03 })?.payableAmount, 1);
  assert.match(channelRoute, /capability\.supportsCreate && providerSupportsChannel/);
  assert.match(channelRoute, /Math\.max\(channel\.minimumAmount, capability\.minimumAmount/);
  assert.match(channelRoute, /Math\.min\(channel\.maximumAmount/);
  assert.match(channelRoute, /providerExternalFeeDisclosure: capability\.providerExternalFeeDisclosure/);
});

test("presentation branches on artifact contract and never redirects QR or return page", () => {
  const rechargeUi = readFileSync(new URL("../../components/account/AccountRechargeContent.tsx", import.meta.url), "utf8");
  const checkout = readFileSync(new URL("../../app/checkout/page.tsx", import.meta.url), "utf8");
  const paymentPage = readFileSync(new URL("../../app/payment/page.tsx", import.meta.url), "utf8");
  assert.match(rechargeUi, /result\.paymentType === "redirect" && result\.paymentUrl/);
  assert.match(checkout, /paymentType === "redirect"/);
  assert.doesNotMatch(rechargeUi, /window\.location\.assign\(result\.qrCode/);
  assert.doesNotMatch(checkout, /window\.location\.assign\(result\.paymentSession\.qrCode/);
  assert.match(paymentPage, /QRCodeSVG/);
  assert.doesNotMatch(paymentPage, /window\.location\.assign/);
});
