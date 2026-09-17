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

const loadChannel = section(
  callbackService,
  "async function loadChannel",
  "async function findCallbackSession",
);

test("callback channel loader selects the public maximum amount configuration", () => {
  assert.match(loadChannel, /\.select\("[^"]*configured,public_config"\)/);
  assert.match(loadChannel, /normalizeChannelRow\(data as Record<string, unknown>\)/);
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

test("disabled configured Liuhaoyi channels remain loadable for historical callbacks", () => {
  assert.doesNotMatch(loadChannel, /\.eq\("enabled",\s*true\)/);
  assert.doesNotMatch(loadChannel, /if\s*\(\s*!channel\.enabled|if\s*\(\s*!channel\.configured/);
  assert.match(loadChannel, /if \(!channel\) throw new Error\("支付渠道不存在"\)/);
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
  assert.doesNotMatch(loadChannel, /usdt_bep20|crypto_address/);
});
