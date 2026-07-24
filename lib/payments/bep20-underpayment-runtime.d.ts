export class Bep20UnderpaymentRuntimeError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export function readBep20UnderpaymentConfirmations(value: unknown): number;
export function isBep20UnderpaymentIrreversibleConfirmation(value: unknown): value is true;
export function summarizeBep20UnderpaymentSessionId(value: unknown): string;
export function subtractBep20UnderpaymentDecimal(left: unknown, right: unknown): string;
export function addBep20UnderpaymentDecimal(left: unknown, right: unknown): string;
export function multiplyBep20UnderpaymentDecimalToCny(amount: unknown, exchangeRate: unknown): string;
export function readBep20UnderpaymentCandidatesSafely(
  readCandidates: () => Promise<string[]>,
): Promise<
  | { ok: true; candidates: string[] }
  | { ok: false; code: "BEP20_UNDERPAYMENT_LIST_FAILED"; candidates: [] }
>;
export function settleBep20UnderpaymentCandidates<T>(
  candidates: string[],
  settle: (sessionId: string) => Promise<T>,
  onError: (sessionId: string, error: unknown) => T,
): Promise<T[]>;
export function summarizeBep20UnderpaymentBatch(
  results: Array<{ ok: boolean; code: string }>,
): { processed: number; skipped: number; failed: number };
