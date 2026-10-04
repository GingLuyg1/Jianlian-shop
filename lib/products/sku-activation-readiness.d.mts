export type SkuActivationReason =
  | "ZERO_STOCK"
  | "NO_FULFILLMENT_SOURCE"
  | "SUPPLIER_BINDING_INCOMPLETE"
  | "SUPPLIER_STOCK_UNVERIFIED"
  | "LOCAL_INVENTORY_EMPTY"
  | "INVENTORY_REQUIRES_VERIFICATION"
  | "READINESS_CHECK_FAILED";

export type SkuActivationReadiness = {
  ready: boolean;
  reasons: SkuActivationReason[];
  source: "supplier" | "local_inventory" | "none";
  stock: number;
  local_available_count: number;
  supplier: {
    supplier_requested: boolean;
    binding_complete: boolean;
    snapshot: number | null;
    sync_status: string | null;
    last_success_at: string | null;
    stale: boolean;
    ready: boolean;
  };
  inventory_state: string | null;
};

export const SKU_ACTIVATION_REASON_LABELS: Readonly<Record<SkuActivationReason, string>>;
export function getEffectiveSkuDeliveryType(product: Record<string, unknown> | null, sku: Record<string, unknown>): string;
export function isAutomaticSkuActivation(previousStatus: unknown, nextStatus: unknown, product: Record<string, unknown> | null, sku: Record<string, unknown>): boolean;
export function validSupplierStockTimestamp(value: unknown): boolean;
export function getSupplierStockEvidence(metadata: unknown): SkuActivationReadiness["supplier"];
export function evaluateSkuActivationReadiness(input: { product: Record<string, unknown> | null; sku: Record<string, unknown>; localAvailableCount?: number; localInventoryError?: boolean }): SkuActivationReadiness;
export function readSkuActivationReadiness(service: any, product: Record<string, unknown> | null, sku: Record<string, unknown>): Promise<SkuActivationReadiness>;
export function formatSkuActivationReasons(reasons: unknown): string;
export function summarizeSkuReadiness(skus: Array<Record<string, unknown>>, diagnosticRows?: Array<Record<string, any>>): {
  total: number;
  active: number;
  draft: number;
  zero_stock: number;
  supplier_unbound: number;
  requires_verification: number;
  local_inventory_available: number;
  no_verified_source: number;
  activation_ready: number;
};
