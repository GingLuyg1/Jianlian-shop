import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createLiuhaoyiMd5Signature,
  isExpectedLiuhaoyiMerchant,
  liuhaoyiChannelForType,
  parseLiuhaoyiQuery,
  verifyLiuhaoyiMd5Signature,
} from "../../lib/payments/providers/liuhaoyi-core.mjs";
import { buildLiuhaoyiSubmitForm, normalizeLiuhaoyiSubmitForm } from "../../lib/payments/providers/liuhaoyi-submit.mjs";
import { submitPaymentForm } from "../../lib/payments/submit-payment-form.mjs";
import { isReusablePaymentSession } from "../../lib/payments/payment-session-reuse.mjs";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const merchantKey = "unit-test-key-only";
const input = {
  apiBaseUrl: new URL("https://provider.example.test/"),
  merchantId: "merchant-test",
  merchantKey,
  channelCode: "wechat",
  sessionNo: "PS-TEST-001",
  notifyUrl: "https://shop.example.test/api/payments/callback/wechat",
  returnUrl: "https://shop.example.test/payment?recharge=RC-TEST-001",
  subject: "Jianlian recharge RC-TEST-001",
  money: "1.00",
};

function referencePluginSign(parameters, key) {
  const content = Object.keys(parameters)
    .filter((name) => name !== "sign" && name !== "sign_type" && parameters[name] !== "")
    .sort()
    .map((name) => `${name}=${parameters[name]}`)
    .join("&");
  return createHash("md5").update(content + key, "utf8").digest("hex");
}

test("submit.php 微信和支付宝表单均使用官方 V1 字段与插件一致的 MD5", () => {
  for (const [channelCode, type] of [["wechat", "wxpay"], ["alipay", "alipay"]]) {
    const form = buildLiuhaoyiSubmitForm({ ...input, channelCode });
    assert.equal(form.action, "https://provider.example.test/submit.php");
    assert.equal(form.method, "POST");
    assert.deepEqual(Object.keys(form.fields).sort(), [
      "pid", "type", "out_trade_no", "notify_url", "return_url", "name", "money", "sign_type", "sign",
    ].sort());
    assert.equal(form.fields.type, type);
    assert.equal(form.fields.out_trade_no, input.sessionNo);
    assert.equal(form.fields.money, "1.00");
    assert.equal(form.fields.sign_type, "MD5");
    assert.equal(form.fields.sign, referencePluginSign(form.fields, merchantKey));
    assert.equal(form.fields.sign, createLiuhaoyiMd5Signature(form.fields, merchantKey));
    assert.equal(verifyLiuhaoyiMd5Signature(form.fields, merchantKey), true);
    assert.equal(JSON.stringify(form).includes(merchantKey), false);
    assert.equal("clientip" in form.fields, false);
    assert.equal("device" in form.fields, false);
  }
});

test("submit form preserves async notify and status-only return URLs", () => {
  const recharge = buildLiuhaoyiSubmitForm(input);
  const order = buildLiuhaoyiSubmitForm({
    ...input,
    channelCode: "alipay",
    returnUrl: "https://shop.example.test/payment?order=ORD-TEST-001",
  });
  assert.equal(recharge.fields.notify_url, input.notifyUrl);
  assert.equal(recharge.fields.return_url, input.returnUrl);
  assert.equal(order.fields.return_url, "https://shop.example.test/payment?order=ORD-TEST-001");
  assert.match(source("lib/payments/providers/liuhaoyi.ts"), /const notifyUrl = new URL\(`\/api\/payments\/callback\/\$\{input\.channel\.code\}`/);
  assert.match(source("lib/payments/providers/liuhaoyi.ts"), /`\/payment\?order=\$\{encodeURIComponent\(input\.businessNo\)\}`/);
  assert.match(source("lib/payments/providers/liuhaoyi.ts"), /`\/payment\?recharge=\$\{encodeURIComponent\(input\.businessNo\)\}`/);
  assert.doesNotMatch(source("app/payment/page.tsx"), /window\.location\.assign/);
});

test("submit form is normalized and never adds merchant key or arbitrary fields", () => {
  const form = buildLiuhaoyiSubmitForm(input);
  assert.deepEqual(normalizeLiuhaoyiSubmitForm(form), form);
  assert.equal(normalizeLiuhaoyiSubmitForm({ ...form, action: "http://provider.example.test/submit.php" }), null);
  assert.equal(normalizeLiuhaoyiSubmitForm({ ...form, fields: { ...form.fields, merchantKey } }), null);
  assert.equal(normalizeLiuhaoyiSubmitForm({ ...form, fields: { ...form.fields, sign: "bad" } }), null);
  assert.equal(normalizeLiuhaoyiSubmitForm({ ...form, method: "GET" }), null);
});

test("submit and mapi orders share the same callback field and signature normalization", () => {
  const submit = buildLiuhaoyiSubmitForm(input);
  for (const sessionNo of [submit.fields.out_trade_no, "PS-MAPI-TEST-001"]) {
    const callback = {
      pid: input.merchantId,
      trade_no: "PROVIDER-TRADE-001",
      out_trade_no: sessionNo,
      type: submit.fields.type,
      name: submit.fields.name,
      money: submit.fields.money,
      trade_status: "TRADE_SUCCESS",
      sign_type: "MD5",
    };
    const signed = { ...callback, sign: createLiuhaoyiMd5Signature(callback, merchantKey) };
    const parsed = parseLiuhaoyiQuery(new URLSearchParams(signed));
    assert.equal(isExpectedLiuhaoyiMerchant(parsed, input.merchantId), true);
    assert.equal(liuhaoyiChannelForType(parsed.type), "wechat");
    assert.equal(parsed.out_trade_no, sessionNo);
    assert.equal(parsed.money, "1.00");
    assert.equal(verifyLiuhaoyiMd5Signature(parsed, merchantKey), true);
  }
});

test("browser sends a POST form only on explicit call, without URL query or HTML interpolation", () => {
  const form = buildLiuhaoyiSubmitForm(input);
  const created = [];
  const submitted = [];
  const doc = {
    body: { appendChild(element) { created.push(element); } },
    createElement(tag) {
      return tag === "form"
        ? { tag, children: [], appendChild(child) { this.children.push(child); }, submit() { submitted.push(this); } }
        : { tag };
    },
  };
  assert.equal(submitPaymentForm(form, doc), true);
  assert.equal(submitted.length, 1);
  assert.equal(created[0].method, "POST");
  assert.equal(created[0].action, form.action);
  assert.equal(created[0].children.length, 9);
  assert.equal(created[0].children.find((field) => field.name === "sign")?.value, form.fields.sign);
  assert.equal(created[0].children.some((field) => field.value === merchantKey), false);
  assert.equal(submitPaymentForm({ ...form, method: "GET" }, doc), false);
  assert.equal(submitted.length, 1);
});

test("submit strategy is server-only, opt-in, session-pinned and preserves mapi default", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  const service = source("lib/payments/payment-session-service.ts");
  const rechargeUi = source("components/account/AccountRechargeContent.tsx");
  const checkout = source("app/checkout/page.tsx");
  const paymentPage = source("app/payment/page.tsx");
  assert.match(provider, /LIUHAOYI_CHECKOUT_MODE \?\? "mapi"/);
  assert.match(provider, /if \(config\.checkoutMode === "submit"\)/);
  assert.match(provider, /new URL\("mapi\.php", config\.apiBaseUrl\)/);
  assert.match(provider, /checkoutMode: "submit", submitForm/);
  assert.match(service, /metadata: \{ initializing: false, \.\.\.\(providerResult\.metadata \?\? \{\}\) \}/);
  assert.match(service, /metadata\.checkoutMode === "submit"/);
  assert.match(service, /submitForm\.fields\.out_trade_no === row\.session_no/);
  assert.match(rechargeUi, /submitPaymentForm\(result\.submitForm\)/);
  assert.match(checkout, /submitPaymentForm\(result\.paymentSession\.submitForm\)/);
  assert.match(paymentPage, /onClick=\{\(\) => submitPaymentForm\(session\.submitForm\)\}/);
  assert.equal(paymentPage.includes("window.location.assign"), false);
});

test("expired sessions are not reused or reopened; callback and financial services remain shared", () => {
  const now = new Date("2026-09-17T00:30:00.000Z");
  const session = {
    business_type: "recharge", business_id: "id-1", business_no: "RC-1", user_id: "user-1",
    channel_code: "wechat", provider: "liuhaoyi", status: "pending", expires_at: "2026-09-17T00:30:00.000Z",
  };
  assert.equal(isReusablePaymentSession(session, {
    businessType: "recharge", businessId: "id-1", businessNo: "RC-1", userId: "user-1",
    channelCode: "wechat", provider: "liuhaoyi",
  }, now), false);
  const service = source("lib/payments/payment-session-service.ts");
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  const callbackRoute = source("app/api/payments/callback/[channel]/route.ts");
  const callbackService = source("lib/payments/payment-callback-service.ts");
  assert.match(service, /SESSION_EXPIRED/);
  assert.match(source("app/payment/page.tsx"), /sessionPaymentBlocked/);
  assert.match(callbackRoute, /export async function GET/);
  assert.match(provider, /async function verifyCallback/);
  assert.match(provider, /async function parseCallback/);
  assert.match(callbackService, /await completePayment\(/);
  assert.equal(provider.match(/async function parseCallback/g)?.length, 1);
});
