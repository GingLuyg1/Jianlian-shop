export function isSkuDraftEmpty(row: Record<string, unknown>): boolean;
export function validateSkuDraft(row: { sku_title: string; sku_code: string; price: number | string; stock: number | string; original_price?: string; sort_order?: string }): Record<string, string>;
export function ensureTrailingEmptySkuRow<T extends { sku?: unknown; draft: Record<string, unknown> }>(rows: T[], createRow: () => T): T[];
export function deriveSkuProductSummary(rows: Array<{ status: string; price: number | string; stock: number | string }>): { price: number | null; stock: number; has_skus: boolean };
