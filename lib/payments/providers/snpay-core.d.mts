import type { PaymentChannelCode, PaymentSessionStatus } from "../channel-types";

export class SnpayCoreError extends Error {
  code: string;
}

export function snpayCanonicalString(parameters: Record<string, unknown>): string;
export function normalizeSnpayPrivateKey(value: unknown): string;
export function normalizeSnpayPlatformPublicKey(value: unknown): string;
export function createSnpaySignature(parameters: Record<string, unknown>, privateKey: string): string;
export function verifySnpaySignedPayload(
  parameters: Record<string, unknown>,
  publicKey: string,
  options?: { now?: number; maxClockSkewSeconds?: number },
): boolean;
export function snpayTypeForChannel(channel: PaymentChannelCode): "alipay" | "wxpay";
export function snpayChannelForType(value: unknown): "alipay" | "wechat" | null;
export function normalizeSnpayPaidAt(value: unknown): string | null;
export function parseSnpayCallbackBody(rawBody: unknown): Record<string, unknown>;
export function selectSnpayPaymentArtifact(payload: Record<string, unknown>): Record<string, unknown>;

export function createSnpayClient(configuration: {
  merchantId: string;
  apiBaseUrl: string | URL;
  merchantPrivateKey: string;
  platformPublicKey: string;
  timeoutMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}): {
  createPayment(input: {
    sessionNo: string;
    channelCode: PaymentChannelCode;
    notifyUrl: string;
    returnUrl: string;
    subject: string;
    amount: number;
    clientIp: string;
    options?: { timeoutMs?: number };
  }): Promise<Record<string, unknown> & { providerOrderNo: string; paymentType: string }>;
  queryPayment(input: {
    providerOrderNo: string;
    sessionNo: string;
    channelCode: PaymentChannelCode;
    amount: number;
    options?: { timeoutMs?: number };
  }): Promise<Record<string, unknown> & { found: boolean; paid: boolean; status: PaymentSessionStatus; paidAt: string | null }>;
  verifyCallback(rawBody: string, expected?: { channelCode?: PaymentChannelCode }): boolean;
  parseCallback(rawBody: string, expected?: { channelCode?: PaymentChannelCode }): Record<string, unknown> & {
    sessionNo: string;
    providerTransactionId: string;
    channelCode: PaymentChannelCode;
    amount: number;
    paidAt: string | null;
    found: boolean;
    paid: boolean;
    status: PaymentSessionStatus;
  };
};
