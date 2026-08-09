export function fulfillDajuCandidates(input: Record<string, unknown>): Promise<{ handled: number; fulfilled: number; failed: number; uncertain: number; needsInput: number }>;
export function reconcileDajuExistingCandidate(input: Record<string, unknown>): Promise<{ ok: true; orderCode: string; requestId: string; deliveredCount: number }>;
