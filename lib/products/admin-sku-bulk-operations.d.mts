export type SkuBulkAction = "set_draft" | "set_sold_out" | "activate";
export type SkuBulkDisposition = "will_change" | "no_change" | "blocked";
export type SkuBulkPreviewItem = {
  sku_id: string;
  sku_code: string | null;
  current_status: string;
  target_status: string;
  disposition: SkuBulkDisposition;
  can_execute: boolean;
  reasons: string[];
  readiness: Record<string, any> | null;
};
export type SkuBulkPreview = {
  action: SkuBulkAction;
  target_status: string;
  selected_count: number;
  executable_count: number;
  will_change_count: number;
  no_change_count: number;
  blocked_count: number;
  can_execute: boolean;
  execution_supported: boolean;
  items: SkuBulkPreviewItem[];
};
export const SKU_BULK_BATCH_LIMIT: 100;
export const SKU_BULK_ACTIONS: readonly SkuBulkAction[];
export const SKU_BULK_TARGET_STATUS: Readonly<Record<SkuBulkAction, string>>;
export function parseSkuBulkOperationRequest(value: unknown):
  | { ok: true; action: SkuBulkAction; skuIds: string[] }
  | { ok: false; code: string; message: string };
export function buildSkuBulkPreview(input: {
  action: SkuBulkAction;
  skus: Array<Record<string, any>>;
  readinessBySku?: Record<string, any>;
  activationGuardBySku?: Record<string, boolean>;
}): SkuBulkPreview;
export function executeSkuBulkStatusUpdate(input: {
  preview: SkuBulkPreview;
  updateStatuses: (skuIds: string[], targetStatus: string) => Promise<Array<Record<string, any>>>;
}): Promise<
  | { ok: true; code: string; updated_count: number; rows: Array<Record<string, any>> }
  | { ok: false; code: string; updated_count: number; rows: Array<Record<string, any>> }
>;
