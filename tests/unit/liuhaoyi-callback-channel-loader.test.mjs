import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getPaymentChannelValidationError } from "../../lib/payments/manual-channel-readiness.mjs";

const callbackService = readFileSync(
  new URL("../../lib/payments/payment-callback-service.ts", import.meta.url),
  "utf8",
);
const rechargeUtils = readFileSync(
  new URL("../../lib/payments/recharge-utils.ts", import.meta.url),
  "utf8",
);

function section(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

const sessionLookup = section(
  callbackService,
  "async function findCallbackSession",
  "async function isExpiredRechargePayment",
);

test("callback resolves the persisted session before provider verification", () => {
  assert.match(callbackService, /const session = await findCallbackSession\(service, sessionNoCandidate\)/);
  assert.match(sessionLookup, /\.select\("id,session_no,[^"]*channel_code,provider,[^"]*"\)/);
  assert.match(sessionLookup, /\.eq\("session_no", sessionNo\)/);
  assert.match(callbackService, /callbackProvider = resolveProviderForExistingSession\(session\)/);
  assert.doesNotMatch(callbackService, /loadChannel\(|channel\.provider/);
});

test("Liuhaoyi Alipay and WeChat normalize with maximum_amount 2000", () => {
  for (const channel of ["alipay", "wechat"]) {
    assert.equal(
      getPaymentChannelValidationError({
        channel,
        provider: "liuhaoyi",
        currency: "CNY",
        feeRate: 0,
        minimumAmount: 1,
        maximumAmount: 2000,
        network: null,
      }),
      null,
    );
  }
  assert.match(
    rechargeUtils,
    /const maximumAmountInput = publicConfig\.maximum_amount[\s\S]*getPaymentChannelValidationError\([\s\S]*maximumAmount: maximumAmountInput/,
  );
});

test("missing public_config reproduces the rejected CNY fallback maximum", () => {
  assert.match(rechargeUtils, /currency === "USDT" \? 100000 : 1000000/);
  assert.match(
    getPaymentChannelValidationError({
      channel: "alipay",
      provider: "liuhaoyi",
      currency: "CNY",
      feeRate: 0,
      minimumAmount: 1,
      maximumAmount: 1_000_000,
      network: null,
    }) ?? "",
    /exceeds the Liuhaoyi maximum amount/,
  );
});

test("disabled or changed current channel settings cannot replace the historical callback provider", () => {
  assert.doesNotMatch(callbackService, /\.from\("payment_channels"\)/);
  assert.doesNotMatch(sessionLookup, /enabled|configured|public_config/);
  assert.match(callbackService, /if \(session\.channel_code !== channelCode\)/);
});

test("expired paid recharge callback records manual review before completion", () => {
  const expiredBranch = callbackService.slice(
    callbackService.indexOf("if (expiredRechargePayment) {", callbackService.indexOf("if (session.status")),
    callbackService.indexOf("const transition = assertPaymentStatusTransition(session.status, \"paid\")"),
  );
  assert.match(expiredBranch, /differenceType: "provider_paid_local_unpaid"/);
  assert.match(expiredBranch, /result: "manual_review"/);
  assert.match(expiredBranch, /return observedResponse\(providerResponse/);
  assert.doesNotMatch(expiredBranch, /completePayment\(|credit|balance/i);
});

test("normal callback verification and USDT paths are unchanged", () => {
  assert.match(callbackService, /const verified = await callbackProvider\.verifyCallback/);
  assert.match(callbackService, /const completion = await completePayment\(/);
  assert.doesNotMatch(sessionLookup, /usdt_bep20|crypto_address/);
});
