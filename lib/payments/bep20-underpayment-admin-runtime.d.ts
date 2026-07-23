export type ParsedAdminUnderpaymentSettlement =
  | {
      ok: true;
      value: {
        sessionId: string;
        reason: string;
        requestId: string;
        confirmationText: string;
        requiredConfirmations: number;
        confirmIrreversible: boolean;
      };
    }
  | { ok: false; status: number; code: string; message: string };

export function parseAdminUnderpaymentSettlementBody(value: unknown): ParsedAdminUnderpaymentSettlement;
export function mapAdminUnderpaymentSettlementError(code: string): {
  status: number;
  code: string;
  message: string;
};
export function mapAdminUnderpaymentAuthorizationFailure(
  status: number,
  message: unknown,
): { success: false; status: 401 | 403; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string };
export function canSubmitAdminUnderpaymentSettlement(input: {
  previewed: boolean;
  eligible: boolean;
  reason: unknown;
  confirmationText: unknown;
  orderNo: unknown;
  irreversibleConfirmed: boolean;
  submitting: boolean;
}): boolean;
export function adminUnderpaymentSettlementMessage(
  result: "settled" | "already_settled",
): string;
export function compareUnsignedDecimal(left: unknown, right: unknown): -1 | 0 | 1 | null;
