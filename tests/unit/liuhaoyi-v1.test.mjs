import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { getPaymentChannelValidationError } from "../../lib/payments/manual-channel-readiness.mjs";
import {
  derivePaymentClientDevice,
  normalizePaymentClientDevice,
} from "../../lib/payments/request-client-device.mjs";

import {
  buildLiuhaoyiSignContent,
  createLiuhaoyiMd5Signature,
  extractLiuhaoyiCreateIdentity,
  isExpectedLiuhaoyiMerchant,
  liuhaoyiCallbackResponseBody,
  liuhaoyiChannelForType,
  liuhaoyiTypeForChannel,
  normalizeLiuhaoyiSessionPresentation,
  selectLiuhaoyiPaymentArtifact,
  verifyLiuhaoyiMd5Signature,
} from "../../lib/payments/providers/liuhaoyi-core.mjs";
import {
  assertLiuhaoyiAmountBreakdown,
  assertLiuhaoyiPaymentAmount,
  isLiuhaoyiAmountOverLimit,
  isLiuhaoyiPaymentMethod,
} from "../../lib/payments/liuhaoyi-limits.mjs";

const merchantKey = "test-secret";
const callback = {
  pid: "merchant-demo",
  trade_no: "LHY202609140001",
  out_trade_no: "PS202609140001",
  type: "alipay",
  name: "Test Order",
  money: "2000.00",
  trade_status: "TRADE_SUCCESS",
  param: "order",
  sign_type: "MD5",
};

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("六号易 MD5 签名按 ASCII 字段顺序稳定生成且不 URL encode", () => {
  const request = {
    type: "alipay",
    pid: "merchant-demo",
    out_trade_no: "PS202609140001",
    notify_url: "https://shop.example.test/api/payments/callback/alipay",
    return_url: "https://shop.example.test/payment?order=ORD001",
    name: "Test Order",
    money: "2000.00",
    device: "pc",
    sign_type: "MD5",
  };
  assert.equal(
    buildLiuhaoyiSignContent(request),
    "device=pc&money=2000.00&name=Test Order&notify_url=https://shop.example.test/api/payments/callback/alipay&out_trade_no=PS202609140001&pid=merchant-demo&return_url=https://shop.example.test/payment?order=ORD001&type=alipay"
  );
  assert.equal(createLiuhaoyiMd5Signature(request, merchantKey), "1223a790162006c8a19168559af99476");
});

test("支付创建 User-Agent 仅派生受控的六号易 device 枚举", () => {
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140"), "pc");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1"), "mobile");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"), "mobile");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 (iPhone) Mobile MicroMessenger/8.0.50"), "wechat");
  assert.equal(derivePaymentClientDevice("Mozilla/5.0 (Linux; Android 15) AlipayClient/10.6.0"), "alipay");
  assert.equal(normalizePaymentClientDevice("jump"), "pc");
  assert.equal(normalizePaymentClientDevice("attacker-controlled"), "pc");

  const provider = source("lib/payments/providers/liuhaoyi.ts");
  for (const route of [
    "app/api/orders/route.ts",
    "app/api/recharges/route.ts",
    "app/api/payments/create/route.ts",
  ]) {
    assert.match(source(route), /derivePaymentClientDevice\(request\.headers\.get\("user-agent"\)\)/);
  }
  assert.match(provider, /device: clientDevice/);
  assert.match(provider, /metadata: \{ provider: "liuhaoyi", clientDevice \}/);
  assert.doesNotMatch(provider, /userAgent|user-agent/i);
});

test("正确回调签名通过，错误或篡改后的签名拒绝", () => {
  const signed = { ...callback, sign: createLiuhaoyiMd5Signature(callback, merchantKey) };
  assert.equal(verifyLiuhaoyiMd5Signature(signed, merchantKey), true);
  assert.equal(verifyLiuhaoyiMd5Signature({ ...signed, sign: "0".repeat(32) }, merchantKey), false);
  assert.equal(verifyLiuhaoyiMd5Signature({ ...signed, money: "1999.99" }, merchantKey), false);
});

test("支付宝和微信映射为六号易协议 type，其他支付方式不受该 Provider 管辖", () => {
  assert.equal(liuhaoyiTypeForChannel("alipay"), "alipay");
  assert.equal(liuhaoyiTypeForChannel("wechat_pay"), "wxpay");
  assert.equal(liuhaoyiChannelForType("alipay"), "alipay");
  assert.equal(liuhaoyiChannelForType("wxpay"), "wechat");
  assert.throws(() => liuhaoyiChannelForType("wechat"), /不支持/);
  assert.equal(isLiuhaoyiPaymentMethod("balance"), false);
  assert.equal(isLiuhaoyiPaymentMethod("usdt_bep20"), false);
});

test("¥100 的网站本金、零手续费、应付金额和 API money 均精确为 100.00", () => {
  assert.equal(assertLiuhaoyiAmountBreakdown("100.00", "0.00", "100.00"), "100.00");
  assert.throws(() => assertLiuhaoyiAmountBreakdown("100.00", "3.00", "103.00"), /不得.*手续费/);
  assert.match(source("lib/payments/providers/liuhaoyi.ts"), /money = assertLiuhaoyiAmountBreakdown\(input\.requestedAmount, input\.feeAmount, input\.payableAmount\)/);
  assert.match(getPaymentChannelValidationError({ channel: "alipay", provider: "liuhaoyi", currency: "CNY", feeRate: 0.03, minimumAmount: 1, maximumAmount: 2000, network: null }), /must not add a local Liuhaoyi fee/);
});

test("¥2000 可以创建，超过 ¥2000 在后端公共校验中拒绝", () => {
  assert.equal(assertLiuhaoyiPaymentAmount("2000"), "2000.00");
  assert.equal(assertLiuhaoyiPaymentAmount(2000), "2000.00");
  assert.equal(isLiuhaoyiAmountOverLimit("2000.01"), true);
  assert.throws(() => assertLiuhaoyiPaymentAmount("2000.01"), /最高支持/);
});

test("金额不一致进入 reconciliation，验签失败和 Provider 失败不会标记 paid", () => {
  const callbackService = source("lib/payments/payment-callback-service.ts");
  const sessionService = source("lib/payments/payment-session-service.ts");
  assert.match(callbackService, /if \(!amountEqual\(session\.payable_amount, parsed\.amount, session\.currency\)\)/);
  assert.match(callbackService, /differenceType: "amount_mismatch"/);
  assert.match(callbackService, /if \(!verified\)[\s\S]*signature_failed[\s\S]*return observedResponse\(providerResponse/);
  assert.match(sessionService, /status: "failed"[\s\S]*\.neq\("status", "paid"\)/);
});

test("六号易回调使用 GET、统一 completePayment，并显式处理重复通知", () => {
  const callbackRoute = source("app/api/payments/callback/[channel]/route.ts");
  const callbackService = source("lib/payments/payment-callback-service.ts");
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  assert.match(callbackRoute, /export async function GET/);
  assert.match(callbackService, /if \(session\.status === "paid"\)[\s\S]*"duplicate"/);
  assert.match(callbackService, /await completePayment\(/);
  assert.equal(liuhaoyiCallbackResponseBody(true), "success");
  assert.equal(liuhaoyiCallbackResponseBody(false), "fail");
  assert.match(provider, /liuhaoyiCallbackResponseBody\(result\.ok\)/);
});

test("合法签名也必须通过独立 pid 校验，错误 pid 被拒绝", () => {
  const wrongPid = { ...callback, pid: "another-merchant" };
  const signed = { ...wrongPid, sign: createLiuhaoyiMd5Signature(wrongPid, merchantKey) };
  assert.equal(verifyLiuhaoyiMd5Signature(signed, merchantKey), true);
  assert.equal(isExpectedLiuhaoyiMerchant(signed, "merchant-demo"), false);
  assert.equal(isExpectedLiuhaoyiMerchant(callback, "merchant-demo"), true);
  assert.match(source("lib/payments/providers/liuhaoyi.ts"), /isExpectedLiuhaoyiMerchant\(parameters, config\.merchantId\)/);
});

test("已签名但 type 或 trade_status 不合法的回调不能进入完成流程", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  assert.throws(() => liuhaoyiChannelForType("wechat"), /不支持/);
  assert.match(provider, /callbackChannel !== expectedChannel[\s\S]*LIUHAOYI_CHANNEL_MISMATCH/);
  assert.match(provider, /parameters\.trade_status !== "TRADE_SUCCESS"[\s\S]*LIUHAOYI_STATUS_INVALID/);
});

test("订单与充值均有服务端上限校验且复用统一 payment session", () => {
  const orders = source("app/api/orders/route.ts");
  const recharges = source("app/api/recharges/route.ts");
  const sessions = source("lib/payments/payment-session-service.ts");
  assert.match(orders, /\["balance", "usdt_bep20", "alipay", "wechat_pay"\]/);
  assert.match(orders, /paymentMethod === "wechat_pay" \? "wechat" : paymentMethod/);
  assert.match(orders, /assertLiuhaoyiPaymentAmount/);
  assert.match(recharges, /assertLiuhaoyiPaymentAmount/);
  assert.match(recharges, /createPaymentSession\(/);
  assert.match(sessions, /assertLiuhaoyiAmountBreakdown\(business\.requestedAmount, business\.feeAmount, business\.payableAmount\)/);
});

test("回调金额以发送本金对应的 Session payable_amount 为唯一预期值", () => {
  const callbackService = source("lib/payments/payment-callback-service.ts");
  const creditMigration = source("supabase/migrations/20260623_payment_balance_transactions_compatibility.sql");
  assert.match(callbackService, /amountEqual\(session\.payable_amount, parsed\.amount, session\.currency\)/);
  assert.match(creditMigration, /v_after := v_before \+ coalesce\(v_recharge\.amount, 0\)/);
});

test("out_trade_no 使用全局唯一 session_no，并由 callback 与 reconciliation 稳定反查", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  const callbackService = source("lib/payments/payment-callback-service.ts");
  const reconciliation = source("lib/payments/reconciliation-service.ts");
  const coreMigration = source("supabase/migrations/20260623_payment_provider_core.sql");
  assert.match(provider, /out_trade_no: input\.sessionNo/);
  assert.match(callbackService, /query = query\.eq\("session_no", parsed\.sessionNo\)/);
  assert.match(reconciliation, /session\.provider === "liuhaoyi"[\s\S]*session\.sessionNo[\s\S]*session\.providerOrderNo \?\? session\.sessionNo/);
  assert.match(coreMigration, /session_no text not null unique/);
  assert.match(coreMigration, /payment_sessions_active_business_unique/);
});

test("mapi trade_no becomes the bounded providerOrderNo persisted by payment sessions", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  const sessionService = source("lib/payments/payment-session-service.ts");
  const createPayment = provider.slice(
    provider.indexOf("async function createPayment"),
    provider.indexOf("async function queryPayment"),
  );
  assert.deepEqual(
    extractLiuhaoyiCreateIdentity({
      code: 1,
      trade_no: "LHY202609150001",
      payurl: "https://provider.example.test/pay",
    }),
    { providerOrderNo: "LHY202609150001" },
  );
  assert.deepEqual(extractLiuhaoyiCreateIdentity({ code: 1, payurl: "https://provider.example.test/pay" }), {});
  assert.equal(extractLiuhaoyiCreateIdentity({ trade_no: "T".repeat(200) }).providerOrderNo.length, 160);
  assert.match(createPayment, /extractLiuhaoyiCreateIdentity\(payload\)/);
  assert.match(createPayment, /\.\.\.createIdentity/);
  assert.match(sessionService, /provider_order_no: providerResult\.providerOrderNo \?\? null/);
  assert.match(createPayment, /if \(!paymentArtifact\.paymentUrl && !paymentArtifact\.qrCodeValue && !paymentArtifact\.deepLinkUrl\)/);
  assert.doesNotMatch(createPayment, /if \(!createIdentity/);
});

test("六号易 payurl、qrcode 与 urlscheme 保持各自展示语义", () => {
  assert.deepEqual(
    selectLiuhaoyiPaymentArtifact({ qrcode: "https://provider.example.test/cashier/123" }),
    {
      paymentType: "qrcode",
      qrCodeValue: "https://provider.example.test/cashier/123",
    },
  );
  assert.deepEqual(
    selectLiuhaoyiPaymentArtifact({
      payurl: "https://provider.example.test/preferred",
      qrcode: "https://provider.example.test/fallback",
    }),
    { paymentType: "redirect", paymentUrl: "https://provider.example.test/preferred" },
  );
  assert.deepEqual(
    selectLiuhaoyiPaymentArtifact({ qrcode: "weixin://wxpay/test" }),
    { paymentType: "qrcode", qrCodeValue: "weixin://wxpay/test" },
  );
  assert.deepEqual(
    selectLiuhaoyiPaymentArtifact({ urlscheme: "weixin://dl/business/?ticket=test" }),
    { paymentType: "deeplink", deepLinkUrl: "weixin://dl/business/?ticket=test" },
  );
  assert.deepEqual(selectLiuhaoyiPaymentArtifact({ qrcode: "http://provider.example.test/insecure" }), { paymentType: "redirect" });
  assert.deepEqual(selectLiuhaoyiPaymentArtifact({ payurl: "javascript:alert(1)", urlscheme: "intent://unsafe" }), { paymentType: "redirect" });
});

test("旧六号易 session 仅在读取时把 qr_code_url 识别为二维码内容", () => {
  assert.deepEqual(
    normalizeLiuhaoyiSessionPresentation({
      provider: "liuhaoyi",
      channelCode: "wechat",
      paymentType: "qrcode",
      qrCodeUrl: "https://provider.example.test/legacy-cashier",
    }),
    {
      paymentType: "qrcode",
      paymentUrl: undefined,
      qrCodeUrl: undefined,
      qrCodeValue: "https://provider.example.test/legacy-cashier",
    },
  );
  assert.deepEqual(
    normalizeLiuhaoyiSessionPresentation({
      provider: "another_provider",
      channelCode: "wechat",
      paymentType: "qrcode",
      qrCodeUrl: "https://images.example.test/real-qr.png",
    }),
    {
      paymentType: "qrcode",
      paymentUrl: undefined,
      qrCodeUrl: "https://images.example.test/real-qr.png",
    },
  );
});

test("六号易二维码内容在本地渲染为 SVG 且不作为图片 URL 请求", () => {
  const qrCodeValue = `https://liuhao.net/pay/jspay/${"T".repeat(512)}/`;
  const markup = renderToStaticMarkup(createElement(QRCodeSVG, {
    value: qrCodeValue,
    size: 208,
    level: "L",
    marginSize: 4,
  }));
  assert.match(markup, /^<svg/);
  assert.doesNotMatch(markup, /<img/i);
  assert.doesNotMatch(markup, /src=/i);
});

test("return_url 只返回订单或充值展示页，不具备完成或入账能力", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  const paymentPage = source("app/payment/page.tsx");
  assert.match(provider, /`\/payment\?order=/);
  assert.match(provider, /`\/payment\?recharge=/);
  assert.doesNotMatch(paymentPage, /completePayment|complete_account_recharge|deliverDigitalOrder/);
});

test("独立 liuhaoyi Provider 保留 generic_api 占位，并由兼容 Migration 精确迁移", () => {
  const providers = source("lib/payments/providers.ts");
  const migration = source("supabase/migrations/20260914120000_liuhaoyi_provider_identity.sql");
  assert.match(providers, /liuhaoyi: liuhaoyiProvider/);
  assert.match(providers, /generic_api: unavailableProvider\(\)/);
  assert.match(migration, /channel in \('alipay', 'wechat'\)/);
  assert.match(migration, /fee_rate = 0/);
  assert.match(migration, /'\{maximum_amount\}'[\s\S]*'2000'/);
});

test("前端只限制六号易，balance 和 usdt_bep20 大额路径不被误拦截", () => {
  const checkout = source("app/checkout/page.tsx");
  const recharge = source("components/account/AccountRechargeContent.tsx");
  assert.match(checkout, /isLiuhaoyiPaymentMethod\(paymentMethod\) && isLiuhaoyiAmountOverLimit\(orderAmount\)/);
  assert.match(recharge, /isLiuhaoyiRecharge && summary && isLiuhaoyiAmountOverLimit\(summary\.payableAmount\)/);
  assert.equal(isLiuhaoyiPaymentMethod("balance") && isLiuhaoyiAmountOverLimit(5000), false);
  assert.equal(isLiuhaoyiPaymentMethod("usdt_bep20") && isLiuhaoyiAmountOverLimit(5000), false);
});

test("Provider 请求有超时和安全错误处理，且未实现退款", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  assert.match(provider, /AbortController/);
  assert.match(provider, /LIUHAOYI_TIMEOUT_MS/);
  assert.doesNotMatch(provider, /refundPayment|createRefund|\/refund/i);
  assert.doesNotMatch(provider, /console\.(?:log|info|warn|error)/);
});
