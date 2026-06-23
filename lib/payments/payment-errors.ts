export function getSafeErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function isPaymentSchemaMissing(error: unknown) {
  return /payment_sessions|payment_channels|account_recharges|balance_transactions|schema cache|PGRST205|42P01|42703/i.test(
    getSafeErrorMessage(error, "")
  );
}
