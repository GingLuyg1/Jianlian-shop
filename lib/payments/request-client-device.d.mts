import type { PaymentClientDevice } from "./channel-types";

export function derivePaymentClientDevice(userAgent: unknown): PaymentClientDevice;
export function normalizePaymentClientDevice(value: unknown): PaymentClientDevice;
