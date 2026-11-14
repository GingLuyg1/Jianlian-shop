import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as lucide from "lucide-react";
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
  const states = { paymentChannels: [channel], selectedChannelCode: channel.code,
    channelsLoading: false, channelsError: null, amountText: options.amount ?? "1",
    customerNote: "", submitMessage: null, isSubmitting: false, records: [],
    recordsLoading: false, recordViewKey: "0:1", recordsError: null, recordPage: 1,
    recordCount: 0, dailyRate: null, rateError: null, amountLimitDialogOpen: false,
    historyNowTick: 0, historyTab: "recharges" };
  const hookNames = [];
  const ast = ts.createSourceFile("recharge.tsx", source("components/account/AccountRechargeContent.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(ast) === "useState") hookNames.push(node.name.elements[0].getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let stateIndex = 0;
  const hooks = {
    ...React,
    useState: (initial) => {
      const index = stateIndex++;
      const name = hookNames[index];
      return [Object.hasOwn(states, name) ? states[name] : typeof initial === "function" ? initial() : initial,
        options.events ? (value) => options.events.push([name, value]) : noNetwork];
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
    "lucide-react": lucide,
    "react/jsx-runtime": jsxRuntime,
    "@/components/account/RechargeEmptyState": { default: box, __esModule: true },
    "@/components/account/RecordLoginState": { default: box, __esModule: true },
    "@/components/account/BalanceTransactionRecords": { default: box, __esModule: true },
    "@/components/account/RechargeRecordTabs": { default: box, __esModule: true },
    "@/components/account/RechargeWalletIllustration": { default: box, __esModule: true },
    "@/components/account/RecordLoadingPlaceholder": { default: box, __esModule: true },
    "@/hooks/use-account-record-identity": { useAccountRecordIdentity: () => ({ status: "signed-in", epoch: 0 }) },
    "@/lib/account/record-preload": { accountRecordPreload: { peek: () => null, getSnapshot: () => ({ epoch: 0 }), countHint: () => undefined, load: noNetwork }, AccountRecordsError: class extends Error {} },
    "@/lib/catalog/public-recharge-channels": { peekPublicRechargeChannels: () => [channel], loadPublicRechargeChannels: noNetwork },
    "@/components/layout/public-content": { publicMainPanelHeightClassName: "" },
    "./RechargeChannelGrid.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }), __esModule: true },
    "@/lib/payments/online-payment-policy.mjs": onlinePolicy,
    "@/lib/account/record-presentation": { rechargeCreditedCny: () => "—", rechargeDisplayNumber: () => "000000" },
    "@/hooks/use-payment-card-tilt": { usePaymentCardTilt: () => ({}) },
    "@/hooks/use-mobile-storefront": { useMobileStorefront: () => ({ isMobile: false, mobilePreview: false, showToggle: false, toggleMobilePreview: () => {} }) },
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
  const create = buttons.find(button => String(JSON.stringify(button.children)).includes("创建充值单"));
  assert.equal(create.disabled, false);
  await create.onClick(); // Primary action explains the limit, without dispatch.
  assert.deepEqual(events, [["amountLimitDialogOpen", true]]);
});

test("actual recharge page separates 100 principal from estimated 3 fee and 103 cashier total", async () => {
  const [channel] = await publicChannels([row()]);
  const html = renderRecharge(channel, { amount: "100" });
  assert.match(html, /充值金额/);
  assert.match(html, /value="100"/);
  assert.match(html, /¥3\.00/);
  assert.match(html, /预计应付[\s\S]*¥103\.00/);
  assert.match(html, /预计到账金额[\s\S]*¥100\.00/);
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
  test(`enabled SNPAY ${code}: public GET preserves disclosure while compact UI retains fee estimates`, async () => {
    const [channel] = await publicChannels([row(code)]);
    assert.equal(channel.code, code);
    assert.equal(channel.provider, "snpay");
    assert.equal(channel.providerExternalFeeDisclosure, registry.providerCapabilities.snpay.providerExternalFeeDisclosure);
    const html = renderRecharge(channel);
    assert.ok(!html.includes(channel.providerExternalFeeDisclosure), "requested UI removes the long pre-create paragraph");
    assert.match(html, /平台手续费（3%）[\s\S]*¥0\.03/);
    assert.match(source("app/payment/page.tsx"), /providerExternalFeeDisclosure/);
    assert.match(html, /预计到账金额[\s\S]*¥1\.00/);
    assert.match(html, /预计应付[\s\S]*?¥1\.03/);
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

test("Liuhaoyi public payload preserves disclosure and compact UI preserves fee and arrival", async () => {
  const expected = "支付平台可能额外收取约 3% 通道手续费；实际付款金额以支付页面为准，本站本金不增加该费用。";
  assert.equal(registry.providerCapabilities.liuhaoyi.providerExternalFeeDisclosure, expected);
  const [channel] = await publicChannels([row("alipay", "liuhaoyi")]);
  assert.equal(channel.providerExternalFeeDisclosure, expected);
  const html = renderRecharge(channel);
  assert.ok(!html.includes(expected));
  assert.match(html, /预计应付[\s\S]*¥1\.03/);
  assert.match(html, /预计到账金额[\s\S]*¥1\.00/);
  assert.match(source("app/payment/page.tsx"), /providerExternalFeeDisclosure/);
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
