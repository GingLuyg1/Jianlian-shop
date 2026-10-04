export const SKU_WORKSPACE_MAX_MUTATIONS: 100;

export class SkuWorkspaceInputError extends Error {
  code: string;
  constructor(message: string, code: string);
}

export function buildSkuWorkspaceOperations<TDraft, TPayload>(args: {
  rows: Array<{ key: string; sku?: { id: string; updated_at?: string | null }; draft: TDraft }>;
  buildPayload: (draft: TDraft) => TPayload;
  isEmptyDraft: (draft: TDraft) => boolean;
}): Array<
  | { type: "create"; client_id: string; payload: TPayload }
  | { type: "update"; sku_id: string; expected_updated_at: string; payload: TPayload }
>;
