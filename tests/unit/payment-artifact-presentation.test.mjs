import assert from "node:assert/strict";
import test from "node:test";

import { getQrPayloadOpenAction, isMobilePaymentContext } from "../../lib/payments/payment-artifact-presentation.mjs";

test("desktop keeps provider qrcode scan-only", () => {
  assert.equal(isMobilePaymentContext("pc"), false);
  assert.equal(getQrPayloadOpenAction({ value: "https://liuhao.net/pay/jspay/1/", channelCode: "wechat", clientDevice: "pc" }), null);
});

test("mobile WeChat and Alipay qrcode actions require an explicit safe channel-compatible target", () => {
  assert.deepEqual(
    getQrPayloadOpenAction({ value: "https://liuhao.net/pay/jspay/1/", channelCode: "wechat", clientDevice: "mobile" }),
    {
      href: "https://liuhao.net/pay/jspay/1/",
      label: "打开微信支付",
      fallbackText: "如无法直接打开微信，请使用另一台设备扫描二维码。",
    },
  );
  assert.equal(getQrPayloadOpenAction({ value: "weixin://wxpay/1", channelCode: "wechat", clientDevice: "wechat" })?.label, "打开微信支付");
  assert.equal(getQrPayloadOpenAction({ value: "alipays://platformapi/startapp", channelCode: "alipay", clientDevice: "alipay" })?.label, "打开支付宝支付");
  assert.equal(getQrPayloadOpenAction({ value: "javascript:alert(1)", channelCode: "wechat", clientDevice: "mobile" }), null);
  assert.equal(getQrPayloadOpenAction({ value: "alipays://platformapi/startapp", channelCode: "wechat", clientDevice: "mobile" }), null);
});
