import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as channelReadiness from "../../lib/payments/manual-channel-readiness.mjs";

const root = new URL("../../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

function loadRechargeUtils() {
  const compiled = ts.transpileModule(source("lib/payments/recharge-utils.ts"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  const require = (specifier) => {
    if (specifier === "@/lib/payments/manual-channel-readiness.mjs") {
      return channelReadiness;
    }
    if (specifier === "@/lib/recharges/status-machine") {
      return { normalizeRechargeStatus: (value) => value };
    }
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports);
  return loaded.exports;
}

const { normalizeChannelRow, normalizeProvider } = loadRechargeUtils();

function channelRow(overrides = {}) {
  return {
    channel: "alipay",
    code: "alipay",
    provider: "snpay",
    provider_name: "snpay",
    currency: "CNY",
    enabled: true,
    configured: true,
    min_amount: 1,
    minimum_amount: 1,
    fee_rate: 0,
    network: null,
    public_config: {
      review_mode: "provider",
      maximum_amount: 2000,
    },
    sort_order: 10,
    ...overrides,
  };
}

test("SNPAY remains the normalized provider for compatible Alipay and WeChat channels", () => {
  assert.equal(normalizeProvider("snpay", "alipay"), "snpay");
  assert.equal(normalizeProvider("snpay", "wechat"), "snpay");

  const alipay = normalizeChannelRow(channelRow());
  const wechat = normalizeChannelRow(channelRow({ channel: "wechat", code: "wechat" }));
  assert.equal(alipay?.provider, "snpay");
  assert.equal(alipay?.status, "active");
  assert.equal(wechat?.provider, "snpay");
  assert.equal(wechat?.status, "active");
});

test("enabled SNPAY Alipay is public-ready while disabled SNPAY Alipay remains hidden", () => {
  const enabled = normalizeChannelRow(channelRow());
  const disabled = normalizeChannelRow(channelRow({ enabled: false }));

  assert.equal(enabled?.enabled, true);
  assert.equal(enabled?.status, "active");
  assert.equal(disabled?.provider, "snpay");
  assert.equal(disabled?.enabled, false);
  assert.equal(disabled?.status, "disabled");
  assert.deepEqual([enabled, disabled].filter((channel) => channel?.status === "active"), [enabled]);
});

test("normalization rejects unknown and channel-incompatible providers without legacy fallback", () => {
  assert.equal(normalizeProvider("unknown_provider", "alipay"), null);
  assert.equal(normalizeProvider("snpay", "usdt_bep20"), null);
  assert.equal(normalizeChannelRow(channelRow({ provider: "unknown_provider", provider_name: "unknown_provider" })), null);
  assert.equal(normalizeChannelRow(channelRow({
    channel: "usdt_bep20",
    code: "usdt_bep20",
    provider: "snpay",
    provider_name: "snpay",
    currency: "USDT",
    network: "BSC",
  })), null);
});

test("USDT-BEP20 normalization remains unchanged", () => {
  const usdt = normalizeChannelRow(channelRow({
    channel: "usdt_bep20",
    code: "usdt_bep20",
    provider: "crypto_address",
    provider_name: "crypto_address",
    currency: "USDT",
    network: "BSC",
    min_amount: 10,
    minimum_amount: 10,
    public_config: {
      review_mode: "manual",
      maximum_amount: 100000,
      payment_address: "test-address",
      token_contract: "test-contract",
      payment_instructions: "test-only",
    },
  }));

  assert.equal(usdt?.provider, "crypto_address");
  assert.equal(usdt?.network, "BEP20");
  assert.equal(usdt?.enabled, true);
});

test("recharge creation and payment-session creation pin the normalized channel provider", () => {
  const rechargeRoute = source("app/api/recharges/route.ts");
  const paymentSessionService = source("lib/payments/payment-session-service.ts");
  const providerContracts = source("lib/payments/provider-contracts.mjs");
  const normalized = normalizeChannelRow(channelRow());

  assert.equal(normalized?.provider, "snpay");
  assert.match(rechargeRoute, /provider:\s*input\.channel\.provider/);
  assert.match(paymentSessionService, /p_provider:\s*input\.channel\.provider/);
  assert.match(providerContracts, /export function pinPaymentSessionProvider/);
});

test("Liuhaoyi-only recharge rules and generic provider capability gates remain intact", () => {
  const rechargeRoute = source("app/api/recharges/route.ts");
  const paymentSessionService = source("lib/payments/payment-session-service.ts");
  const channelRoute = source("app/api/recharges/channels/route.ts");

  assert.match(rechargeRoute, /channel\.provider === "liuhaoyi"/);
  assert.match(rechargeRoute, /getPaymentProviderCapabilities\(channel\.provider\)/);
  assert.match(rechargeRoute, /providerSupportsChannel/);
  assert.match(paymentSessionService, /getPaymentProviderCapabilities\(channel\.provider\)/);
  assert.match(paymentSessionService, /providerSupportsChannel/);
  assert.match(channelRoute, /capability\.supportsCreate && providerSupportsChannel/);
});

test("normalization regression harness has no provider network or funding write path", () => {
  const implementation = source("lib/payments/recharge-utils.ts");
  assert.doesNotMatch(implementation, /https?:\/\//);
  assert.doesNotMatch(implementation, /fetch\s*\(/);
  assert.doesNotMatch(implementation, /balance_transactions|credit_balance|complete_payment/i);
});
