export function classifyBalancePaymentFailure(error) {
  const value = error !== null && typeof error === "object" && !Array.isArray(error) ? error : {};
  const code = typeof value.code === "string" ? value.code.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";

  if (code === "P0001" && message === "账户余额不足") {
    return {
      status: 402,
      code: "BALANCE_INSUFFICIENT",
      message: "账户余额不足，请充值后继续支付原订单。",
    };
  }

  return {
    status: 503,
    code: "BALANCE_PAYMENT_UNAVAILABLE",
    message: "余额支付服务暂时不可用，原订单已保留，请稍后重试。",
  };
}
