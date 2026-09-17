// Test-only adapter. Never import this module from the production provider registry.
export function createFakePaymentProvider({ secret = "test-only-secret", channel = "wechat" } = {}) {
  const payments = new Map();
  return {
    payments,
    async createPayment(input) {
      if (!input.sessionNo || input.channel.code !== channel || input.payableAmount <= 0) {
        throw new Error("FAKE_CREATE_INVALID");
      }
      const order = {
        sessionNo: input.sessionNo,
        amount: input.payableAmount,
        currency: input.currency,
        channel,
        status: "pending",
        tradeNo: `fake-${input.sessionNo}`,
      };
      payments.set(input.sessionNo, order);
      return {
        status: "pending",
        paymentType: "qrcode",
        qrCodeValue: `fakepay://pay/${input.sessionNo}`,
        providerOrderNo: order.tradeNo,
      };
    },
    async queryPayment(sessionNo) {
      const order = payments.get(sessionNo);
      return order ? {
        found: true,
        status: order.status,
        paid: order.status === "paid",
        amount: order.amount,
        currency: order.currency,
        providerChannel: order.channel,
        providerTransactionIdPresent: order.status === "paid",
        rawSummarySafe: { found: true, paid: order.status === "paid" },
      } : { found: false, status: "pending", paid: false };
    },
    async verifyCallback(payload) {
      return payload?.signature === secret && payments.has(payload?.sessionNo);
    },
    async parseCallback(payload) {
      if (!(await this.verifyCallback(payload))) throw new Error("FAKE_CALLBACK_INVALID");
      const order = payments.get(payload.sessionNo);
      if (payload.amount !== order.amount || payload.channel !== channel) throw new Error("FAKE_CALLBACK_MISMATCH");
      return {
        provider: "fake_test_only",
        sessionNo: order.sessionNo,
        businessNo: order.sessionNo,
        providerTransactionId: order.tradeNo,
        status: "paid",
        amount: order.amount,
        currency: order.currency,
        channelCode: channel,
      };
    },
    markPaid(sessionNo) {
      const order = payments.get(sessionNo);
      if (!order) throw new Error("FAKE_ORDER_NOT_FOUND");
      order.status = "paid";
    },
  };
}
