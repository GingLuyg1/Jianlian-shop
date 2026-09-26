import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rechargeUi = readFileSync(new URL("../../components/account/AccountRechargeContent.tsx", import.meta.url), "utf8");
const paymentPage = readFileSync(new URL("../../app/payment/page.tsx", import.meta.url), "utf8");
const rechargeRoute = readFileSync(new URL("../../app/api/recharges/route.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../../app/checkout/page.tsx", import.meta.url), "utf8");
const sessionService = readFileSync(new URL("../../lib/payments/payment-session-service.ts", import.meta.url), "utf8");
const callbackService = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../../lib/payments/providers/liuhaoyi.ts", import.meta.url), "utf8");

test("UI explains the provider 3 percent charge without adding it to local amounts", () => {
  const providerRegistry = readFileSync(new URL("../../lib/payments/providers.ts", import.meta.url), "utf8");
  assert.match(providerRegistry, /providerExternalFeeDisclosure: "支付平台可能额外收取约 3% 通道手续费/);
  assert.match(rechargeUi, /selectedChannel\.providerExternalFeeDisclosure/);
  assert.match(paymentPage, /session\.providerExternalFeeDisclosure/);
  assert.match(checkout, /selectedPaymentChannel\.providerExternalFeeDisclosure/);
  assert.match(rechargeRoute, /summary\.fee !== 0 \|\| summary\.payableAmount !== summary\.amount/);
  assert.match(provider, /assertLiuhaoyiAmountBreakdown\(input\.requestedAmount, input\.feeAmount, input\.payableAmount\)/);
  assert.doesNotMatch(provider, /\*\s*1\.03|1\.03\s*\*/);
});

test("Alipay and WeChat recharge requests preserve the normalized decimal string payload", () => {
  assert.match(
    rechargeUi,
    /amount:\s*isUsdtCnyRecharge\s*\?\s*requestedCnyAmount\s*:\s*amountText/,
  );
  assert.doesNotMatch(
    rechargeUi,
    /amount:\s*isUsdtCnyRecharge\s*\?\s*requestedCnyAmount\s*:\s*summary\?\.amount/,
  );
  assert.match(rechargeRoute, /parsePublicRechargeAmount\(body\.amount, 6\)/);
});

test("recharge history exposes order number, countdown, continue payment and customer service", () => {
  assert.match(rechargeUi, /资金充值记录/);
  assert.doesNotMatch(rechargeUi, /资金变动记录/);
  assert.match(rechargeUi, /待支付剩余时间/);
  assert.match(rechargeUi, /继续支付/);
  assert.match(rechargeUi, /订单编号/);
  assert.match(rechargeUi, /openPublicSupport/);
});

test("late paid callback preserves evidence and routes to manual reconciliation before completion", () => {
  const lateGuard = callbackService.indexOf("expiredRechargePaymentRequiresManualReview");
  const completion = callbackService.indexOf("const completion = await completePayment");
  assert.ok(lateGuard >= 0 && completion > lateGuard);
  assert.match(callbackService, /paidAtMs > sessionExpiryMs/);
  assert.match(callbackService, /paidAtMs > rechargeExpiryMs/);
  assert.match(callbackService, /provider_paid_local_unpaid/);
  assert.match(callbackService, /provider_transaction_id: providerTransactionId/);
  assert.match(callbackService, /provider_trade_no: providerTransactionId/);
  assert.match(callbackService, /CALLBACK_RECHARGE_PAID_AFTER_EXPIRY/);
  assert.doesNotMatch(callbackService, /forceCredit|forcePaid|refundPayment/);
});

test("USDT V3 uses the shared 15 minute payment window", () => {
  assert.match(rechargeRoute, /createPaymentExpiryWindow\(\)/);
  assert.doesNotMatch(rechargeRoute, /20 \* 60 \* 1000/);
});

test("Liuhaoyi redirects only payurl sessions while qrcode remains on the local payment page", () => {
  assert.match(rechargeUi, /result\.paymentType === "redirect" && result\.paymentUrl[\s\S]{0,100}window\.location\.assign\(result\.paymentUrl\)/);
  assert.match(checkout, /result\?\.paymentSession\?\.paymentType === "redirect"[\s\S]{0,160}window\.location\.assign\(result\.paymentSession\.paymentUrl\)/);
  const fallbackPanel = paymentPage.slice(paymentPage.indexOf("function LiuhaoyiRechargePaymentPanel"));
  assert.match(fallbackPanel, /打开付款页面/);
  assert.doesNotMatch(paymentPage, /window\.location\.assign/);
});

test("provider qrcode is rendered locally and is never used as an image source", () => {
  assert.match(paymentPage, /QRCodeSVG/);
  assert.match(paymentPage, /value=\{session\.qrCodeValue\}/);
  assert.match(paymentPage, /data-local-payment-qr="true"/);
  assert.doesNotMatch(paymentPage, /<img src=\{session\.qrCodeUrl\}/);
  assert.match(paymentPage, /请使用微信扫一扫完成支付/);
  assert.match(paymentPage, /请使用微信打开支付/);
  assert.match(paymentPage, /打开微信支付/);
  assert.match(paymentPage, /getQrPayloadOpenAction/);
  assert.match(paymentPage, /openAction \? \(/);
  assert.doesNotMatch(paymentPage, /useEffect\([\s\S]{0,200}openAction/);
});

test("payment-critical layouts keep mobile navigation through tablet width", () => {
  const publicLayout = readFileSync(new URL("../../components/layout/PublicLayout.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("../../components/layout/PublicSidebar.tsx", import.meta.url), "utf8");
  assert.match(rechargeUi, /<PublicLayout mobileNavigationUntilLg/);
  assert.match(paymentPage, /<PublicLayout mobileNavigationUntilLg/);
  assert.match(checkout, /<PublicLayout mobileNavigationUntilLg/);
  assert.match(publicLayout, /mobileNavigationUntilLg \? "lg:hidden" : "md:hidden"/);
  assert.match(sidebar, /mobileNavigationUntilLg \? "lg:flex" : "md:flex"/);
});

test("legacy Liuhaoyi QR field is normalized only for presentation and never written back", () => {
  assert.match(sessionService, /normalizeLiuhaoyiSessionPresentation/);
  assert.match(sessionService, /metadata,provider,channel_code/);
  assert.doesNotMatch(sessionService, /qr_code_url:\s*artifact\.qrCodeUrl/);
});

test("recharge TxHash fallback is restricted to USDT-BEP20", () => {
  assert.match(paymentPage, /recharge\?\.channelCode === "usdt_bep20" && canTransfer/);
  assert.match(paymentPage, /\{canSubmitRechargeTxHash \? \([\s\S]{0,220}TxHash fallback（可选）/);
});
