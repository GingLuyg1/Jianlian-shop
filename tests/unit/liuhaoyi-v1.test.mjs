import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLiuhaoyiSignContent,
  createLiuhaoyiMd5Signature,
  liuhaoyiTypeForChannel,
  verifyLiuhaoyiMd5Signature,
} from "../../lib/payments/providers/liuhaoyi-core.mjs";
import {
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
    sign_type: "MD5",
  };
  assert.equal(
    buildLiuhaoyiSignContent(request),
    "money=2000.00&name=Test Order&notify_url=https://shop.example.test/api/payments/callback/alipay&out_trade_no=PS202609140001&pid=merchant-demo&return_url=https://shop.example.test/payment?order=ORD001&type=alipay"
  );
  assert.equal(createLiuhaoyiMd5Signature(request, merchantKey), "8161c8e722d9895c191aadea03dd4c75");
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
  assert.equal(isLiuhaoyiPaymentMethod("balance"), false);
  assert.equal(isLiuhaoyiPaymentMethod("usdt_bep20"), false);
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
  assert.match(callbackService, /if \(!verified\)[\s\S]*signature_failed[\s\S]*return providerResponse/);
  assert.match(sessionService, /status: "failed"[\s\S]*\.neq\("status", "paid"\)/);
});

test("六号易回调使用 GET、统一 completePayment，并显式处理重复通知", () => {
  const callbackRoute = source("app/api/payments/callback/[channel]/route.ts");
  const callbackService = source("lib/payments/payment-callback-service.ts");
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  assert.match(callbackRoute, /export async function GET/);
  assert.match(callbackService, /if \(session\.status === "paid"\)[\s\S]*"duplicate"/);
  assert.match(callbackService, /await completePayment\(/);
  assert.match(provider, /result\.ok \? "success" : "fail"/);
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
  assert.match(sessions, /assertLiuhaoyiPaymentAmount\(business\.payableAmount\)/);
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
