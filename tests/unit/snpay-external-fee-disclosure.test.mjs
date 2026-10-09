import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as readiness from "../../lib/payments/manual-channel-readiness.mjs";
import * as contracts from "../../lib/payments/provider-contracts.mjs";
import * as expiry from "../../lib/payments/recharge-expiry.mjs";
import * as rate from "../../lib/payments/recharge-rate.mjs";
import * as onlinePolicy from "../../lib/payments/online-payment-policy.mjs";

const root = new URL("../../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");
const unexpected = (name) => { throw new Error(`Unmocked dependency: ${name}`); };
const noNetwork = () => { throw new Error("Real network/payment request forbidden"); };

// Execute the actual TS/TSX modules; dependencies are explicit and fail closed.
// No effects, event handlers, Provider methods, or real database calls run here.
function load(path, dependencies) {
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  const require = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : unexpected(name);
  new Function("require", "module", "exports", "fetch", compiled)(require, module, module.exports, noNetwork);
  return module.exports;
}

const forbiddenProvider = new Proxy({}, { get: noNetwork });
const registry = load("lib/payments/providers.ts", {
  "@/lib/payments/providers/liuhaoyi": { liuhaoyiProvider: forbiddenProvider },
  "@/lib/payments/providers/snpay": { snpayProvider: forbiddenProvider },
});
const utils = load("lib/payments/recharge-utils.ts", {
  "@/lib/payments/manual-channel-readiness.mjs": readiness,
  "@/lib/recharges/status-machine": { normalizeRechargeStatus: (status) => status },
});
const channels = load("lib/payments/channels.ts", {
  "@/lib/i18n/money": { formatCurrency: (value, currency) => `${currency === "CNY" ? "¥" : "USDT "}${Number(value).toFixed(2)}` },
});

function row(code = "alipay", provider = "snpay") {
  return {
    channel: code, code, provider, provider_name: provider,
    currency: "CNY", enabled: true, configured: true,
    min_amount: 1, minimum_amount: 1, fee_rate: 0,
    public_config: { review_mode: "provider", maximum_amount: 2000 },
    sort_order: 10,
  };
}
const usdtRow = {
  ...row("usdt_bep20", "crypto_address"), currency: "USDT", network: "BSC",
  public_config: { review_mode: "manual", payment_address: "test-only-address",
    token_contract: "test-only-contract", payment_instructions: "test-only" },
};

async function publicChannels(rows) {
  let readCalls = 0;
  const query = {
    select() { return this; }, eq() { return this; },
    order() { readCalls++; return Promise.resolve({ data: rows, error: null }); },
  };
  const route = load("app/api/recharges/channels/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ status: options?.status ?? 200, body }) } },
    "node:crypto": { randomUUID: () => "test-request" },
    "@/lib/payments/manual-channel-readiness.mjs": readiness,
    "@/lib/payments/recharge-utils": utils,
    "@/lib/payments/providers": registry,
    "@/lib/payments/provider-contracts.mjs": contracts,
    "@/lib/supabase/server": {
      hasSupabaseServerConfig: () => true,
      getSupabaseServerClient: () => ({ from: (table) => {
        assert.equal(table, "payment_channels"); return query;
      } }),
    },
  });
  const result = await route.GET();
  assert.equal(result.status, 200);
  assert.equal(readCalls, 1);
  // JSON serialization is part of the public payload contract.
  return JSON.parse(JSON.stringify(result.body)).channels;
}

function renderRecharge(channel, options = {}) {
  const states = [[channel], channel.code, false, null, "1", "", null, false,
    [], false, null, 1, 0, null, null, false, 0];
  let stateIndex = 0;
  if (options.amount) states[4] = options.amount;
  const hooks = {
    ...React,
    useState: (initial) => {
      const index = stateIndex++;
      return [index < states.length ? states[index] : initial,
        options.events ? (value) => options.events.push([index, value]) : noNetwork];
    },
    useEffect: () => {}, useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
  };
  const box = ({ children }) => React.createElement("div", null, children);
  const input = ({ value, placeholder }) => React.createElement("input", { value, placeholder, readOnly: true });
  const button = ({ children, disabled, onClick }) => {
    if (options.buttons) options.buttons.push({ children, disabled, onClick });
    return React.createElement("button", { disabled }, children);
  };
  const feeSummary = load("components/payments/ExternalCashierFeeSummary.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "@/lib/payments/online-payment-policy.mjs": onlinePolicy,
  });
  const ui = load("components/account/AccountRechargeContent.tsx", {
    react: hooks,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: box, __esModule: true },
    "next/navigation": { useRouter: () => ({ push: noNetwork }) },
    sonner: { toast: { error: noNetwork } },
    "@/components/layout/PublicLayout": { default: box, __esModule: true },
    "@/components/ui/button": { Button: button },
    "@/components/ui/card": { Card: box, CardContent: box },
    "@/components/ui/dialog": { Dialog: ({ open, children }) => open ? children : null,
      DialogContent: box, DialogHeader: box, DialogTitle: box },
    "@/components/ui/input": { Input: input },
    "@/lib/payments/channels": channels,
    "@/lib/payments/submit-payment-form.mjs": { submitPaymentForm: noNetwork },
    "@/lib/payments/recharge-expiry.mjs": expiry,
    "@/lib/payments/recharge-utils": utils,
    "@/lib/payments/recharge-rate.mjs": rate,
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/lib/support/open-public-support": { openPublicSupport: noNetwork },
    "@/components/payments/ExternalCashierFeeSummary": feeSummary,
  });
  return renderToStaticMarkup(ui.default());
}

test("actual recharge handler opens the limit dialog before any create request", async () => {
  const [channel] = await publicChannels([row()]);
  const events = [], buttons = [];
  renderRecharge(channel, { amount: "2000.01", events, buttons });
  const create = buttons.find(button => button.children === "创建充值");
  assert.equal(create.disabled, false);
  await create.onClick(); // Primary action explains the limit, without dispatch.
  assert.deepEqual(events, [[15, true]]);
});

test("actual recharge page separates 100 principal from estimated 3 fee and 103 cashier total", async () => {
  const [channel] = await publicChannels([row()]);
  const html = renderRecharge(channel, { amount: "100" });
  assert.match(html, /本站本金\/商品金额：¥100\.00/);
  assert.match(html, /约 ¥3\.00/);
  assert.match(html, /付款总额约 ¥103\.00/);
  assert.match(html, /预计到账金额：¥100\.00/);
});

test("SNPAY disclosure separates site fee, approximate provider fee and credited principal", () => {
  const text = registry.getPaymentProviderCapabilities("snpay").providerExternalFeeDisclosure;
  assert.ok(text?.trim());
  assert.match(text, /本站手续费/);
  assert.match(text, /可能额外收取约 3%/);
  assert.match(text, /实际付款金额以支付页面为准/);
  assert.match(text, /额外费用不增加充值本金或到账金额/);
});

for (const code of ["alipay", "wechat"]) {
  test(`enabled SNPAY ${code}: actual public GET preserves disclosure and UI renders it before create`, async () => {
    const [channel] = await publicChannels([row(code)]);
    assert.equal(channel.code, code);
    assert.equal(channel.provider, "snpay");
    assert.equal(channel.providerExternalFeeDisclosure, registry.providerCapabilities.snpay.providerExternalFeeDisclosure);
    const html = renderRecharge(channel);
    const disclosure = html.indexOf(channel.providerExternalFeeDisclosure);
    const create = html.indexOf("创建充值</button>");
    assert.ok(disclosure >= 0 && create > disclosure);
    assert.match(html, /本站手续费：<!-- -->0|本站手续费：0/);
    assert.match(html, /支付平台可能另收通道手续费/);
    assert.match(html, /预计到账金额：¥1\.00/);
    assert.match(html, /预计应付：[\s\S]*?¥1\.00/);
    assert.equal(channel.feeRate, 0);
    assert.deepEqual(channels.calculateRechargeAmounts(channel, 1), {
      amount: 1, fee: 0, payableAmount: 1, arrivalAmount: 1, currency: "CNY", decimals: 2,
    });
  });
}

test("USDT public payload and recharge UI never inherit SNPAY disclosure", async () => {
  const [channel] = await publicChannels([usdtRow]);
  assert.equal(channel.code, "usdt_bep20");
  assert.equal(channel.providerExternalFeeDisclosure, undefined);
  assert.doesNotMatch(renderRecharge(channel), /约 3%|额外费用不增加充值本金|支付平台可能另收通道手续费/);
});

test("Liuhaoyi public payload and pre-create disclosure remain unchanged", async () => {
  const expected = "支付平台可能额外收取约 3% 通道手续费；实际付款金额以支付页面为准，本站本金不增加该费用。";
  assert.equal(registry.providerCapabilities.liuhaoyi.providerExternalFeeDisclosure, expected);
  const [channel] = await publicChannels([row("alipay", "liuhaoyi")]);
  assert.equal(channel.providerExternalFeeDisclosure, expected);
  assert.ok(renderRecharge(channel).includes(expected));
});

test("disclosure is presentation-only: zero site fee, payable and arrival principal unchanged", () => {
  const channel = utils.normalizeChannelRow(row());
  const plain = channels.calculateRechargeAmounts(channel, 1);
  const disclosed = channels.calculateRechargeAmounts({ ...channel,
    providerExternalFeeDisclosure: registry.providerCapabilities.snpay.providerExternalFeeDisclosure }, 1);
  assert.deepEqual(disclosed, plain);
  assert.equal(disclosed.fee, 0);
  assert.equal(disclosed.payableAmount, 1);
  assert.equal(disclosed.arrivalAmount, 1);
  assert.deepEqual(contracts.describePaymentFeeSemantics({ principalAmount: 1, siteFee: 0,
    payableAmount: 1, creditedAmount: 1, providerExternalFee: 0.03 }), {
    principalAmount: 1, siteFee: 0, payableAmount: 1, creditedAmount: 1, providerExternalFee: 0.03,
  });
});
