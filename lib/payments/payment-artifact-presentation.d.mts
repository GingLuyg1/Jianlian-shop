import type { PaymentClientDevice } from "./channel-types";

export function isMobilePaymentContext(clientDevice?: PaymentClientDevice): boolean;

export function getQrPayloadOpenAction(input: {
  value: unknown;
  channelCode?: string | null;
  clientDevice?: PaymentClientDevice;
}): { href: string; label: string; fallbackText: string } | null;
