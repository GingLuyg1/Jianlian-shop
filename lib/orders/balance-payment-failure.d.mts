export type BalancePaymentFailure = {
  status: 402 | 503;
  code: "BALANCE_INSUFFICIENT" | "BALANCE_PAYMENT_UNAVAILABLE";
  message: string;
};

export function classifyBalancePaymentFailure(error: unknown): BalancePaymentFailure;
