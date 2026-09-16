export function buildLiuhaoyiSignContent(parameters: Record<string, unknown>): string;
export function createLiuhaoyiMd5Signature(parameters: Record<string, unknown>, merchantKey: string): string;
export function verifyLiuhaoyiMd5Signature(parameters: Record<string, unknown>, merchantKey: string): boolean;
export function liuhaoyiTypeForChannel(channelCode: unknown): "alipay" | "wxpay";
export function liuhaoyiChannelForType(type: unknown): "alipay" | "wechat";
export function isExpectedLiuhaoyiMerchant(parameters: Record<string, unknown>, merchantId: string): boolean;
export function liuhaoyiCallbackResponseBody(ok: unknown): "success" | "fail";
export function extractLiuhaoyiCreateIdentity(
  payload: Record<string, unknown>
): { providerOrderNo?: string };
export function selectLiuhaoyiPaymentArtifact(payload: Record<string, unknown>): {
  paymentType: "redirect" | "qrcode" | "deeplink";
  paymentUrl?: string;
  qrCodeValue?: string;
  deepLinkUrl?: string;
};
export function normalizeLiuhaoyiSessionPresentation(input: {
  provider?: string;
  channelCode?: string;
  paymentType?: "redirect" | "qrcode" | "address" | "deeplink";
  paymentUrl?: string;
  qrCodeUrl?: string;
  qrCodeValue?: string;
}): {
  paymentType: "redirect" | "qrcode" | "address" | "deeplink";
  paymentUrl?: string;
  qrCodeUrl?: string;
  qrCodeValue?: string;
  deepLinkUrl?: string;
};
export function parseLiuhaoyiQuery(input: URLSearchParams | string): Record<string, string>;
