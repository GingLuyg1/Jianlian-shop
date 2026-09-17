import type { PaymentArtifact, PaymentFeeSemantics, PaymentProviderCapabilities, ProviderCreatePaymentResult } from "./channel-types";

export function paymentArtifactFromCreateResult(result: ProviderCreatePaymentResult | Record<string, unknown>): PaymentArtifact | null;
export function providerAmountWithinLimits(capability: PaymentProviderCapabilities, channel: { minimumAmount?: number; maximumAmount?: number }, amount: unknown): boolean;
export function providerSupportsChannel(capability: PaymentProviderCapabilities, channel: string, currency: string): boolean;
export function describePaymentFeeSemantics(input: PaymentFeeSemantics): PaymentFeeSemantics | null;
export function pinPaymentSessionProvider(session: { provider?: unknown }, currentChannelProvider: string): string | null;
export function providerFailoverDecision(input: { orderMayExist: boolean; createRejectedBeforeSubmission: boolean }): "manual_new_session_only" | "no_auto_failover";
export function evaluateProviderRecoveryEvidence(input: {
  session: Record<string, unknown> | null;
  recharge: Record<string, unknown> | null;
  provider: Record<string, unknown> | null;
  ledgerCount: number;
}): { eligible: boolean; reason: string };
