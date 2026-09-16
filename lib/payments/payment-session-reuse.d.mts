export type ReusablePaymentSessionIdentity = {
  businessType: "order" | "recharge";
  businessId: string;
  businessNo: string;
  userId: string;
  channelCode: string;
  provider?: string;
};

export function isReusablePaymentSession(
  row: Record<string, unknown>,
  identity: ReusablePaymentSessionIdentity,
  now?: Date,
): boolean;
