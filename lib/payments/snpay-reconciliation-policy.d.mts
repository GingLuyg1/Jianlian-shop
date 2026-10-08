export const SNPAY_RECONCILIATION: Readonly<{pendingCadenceMs:number;expiredCadenceMs:number;lookbackMs:number;minimumAgeMs:number;batchSize:number;queryTimeoutMs:number;batchTimeoutMs:number}>;
export function snpayCandidateReason(session: Record<string, any>, nowMs?: number): string | null;
export function snpayPaidDecision(session: Record<string, any>, recharge: Record<string, any>, provider: Record<string, any>, nowMs?: number): {kind:string;reason:string};
