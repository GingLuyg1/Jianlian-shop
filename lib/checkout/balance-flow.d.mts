export type AccountAssetsBalanceResult =
  | { kind: "ready"; balanceCents: number; balance: number }
  | { kind: "unavailable"; reason: string };

export type CheckoutBalanceSummary =
  | {
      kind: "ready";
      sufficient: boolean;
      orderCents: number;
      balanceCents: number;
      remainingCents: number;
      shortfallCents: number;
      orderAmount: number;
      availableBalance: number;
      remainingAmount: number;
      shortfallAmount: number;
    }
  | { kind: "unavailable" };

export type CheckoutOrderResponseClassification =
  | { kind: "balance_insufficient_existing_order"; orderNo: string; requestId: string | null }
  | { kind: "success"; orderNo: string; requestId: string | null }
  | { kind: "failed" | "invalid_response"; orderNo: string | null; requestId: string | null };

export function formatCnyFromCents(cents: number): string;
export function parseAccountAssetsBalance(payload: unknown): AccountAssetsBalanceResult;
export function evaluateCheckoutBalance(orderAmount: number, availableBalance: number | null): CheckoutBalanceSummary;
export function getBalanceSubmissionBlockReason(input: {
  paymentMethod: string;
  balanceStatus: "loading" | "ready" | "error";
  balanceSummary: CheckoutBalanceSummary;
}): "BALANCE_LOADING" | "BALANCE_UNAVAILABLE" | "BALANCE_INSUFFICIENT" | null;
export function classifyCheckoutOrderResponse(status: number, payload: unknown): CheckoutOrderResponseClassification;
export function createCheckoutSubmissionGuard(): {
  tryStart(): boolean;
  finish(): void;
  isActive(): boolean;
};
