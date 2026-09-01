import type { DajuProductDetail } from "./protocol.mjs";
export type DajuBinding = { supplier: "daju"; productId: number; sku: string | null; inputsMapping: Record<string, string>; maxUnitCost: string | null };
export function parseDajuProductBinding(productMetadata: unknown, skuMetadata?: unknown): DajuBinding | null;
export function isDajuSupplierMetadata(productMetadata: unknown, skuMetadata?: unknown): boolean;
export function mapDajuRequiredInputs(requiredInputs: unknown, mapping: unknown, orderFields: unknown): { ok: true; inputs: Record<string, string> } | { ok: false; code: string; missing: string[] };
export function validateDajuBindingAgainstProductDetail(binding: DajuBinding, product: DajuProductDetail): { ok: true; missing: string[] } | { ok: false; code: string; missing: string[] };
export function compareDajuDecimal(left: unknown, right: unknown): -1 | 0 | 1 | null;
export function validateDajuExistingOrderReconciliation(input: Record<string, unknown>): { ok: boolean; code?: string };
export function validateDajuPurchaseReadiness(input: { product: DajuProductDetail; binding: DajuBinding; quantity: number; orderFields: Record<string, unknown> }): { ok: true; inputs: Record<string, string> } | { ok: false; code: string; missing?: string[] };
