export const BITREFILL_CAPABILITIES: Readonly<{
  catalog: true; availability: true; purchase: false;
  orderLookup: "fixture_only"; reconciliation: "fixture_only"; variableAmountPurchase: false;
}>;
export function assertBitrefillCostWithinLimit(expectedCost: string | number, frozenMaxSupplierCost: string | number): true;
export function normalizeBitrefillProduct(product: Record<string, any>): Record<string, any>;
export function buildBitrefillSnapshot(product: Record<string, any>, packageId: string | null, checkedAt: string, errorCode?: string | null): Record<string, any>;
export function buildBitrefillInvoiceRequest(input: { items: Array<Record<string, any>> }): { products: Array<{ product_id: string; package_id: string; quantity: number }> };
export function planBitrefillInvoiceSplits(input: { items: Array<Record<string, any>> }): Array<Record<string, any>>;
export function normalizeBitrefillOrder(value: unknown): Record<string, any>;
export function normalizeBitrefillInvoice(value: unknown): Record<string, any>;
export function normalizeBitrefillRedemption(value: unknown): { storage: "digital_delivery_secrets"; payload: Record<string, string> } | null;
export function reconcileBitrefillInvoice(value: unknown): Record<string, any>;
export function classifyBitrefillSubmitFailure(error: unknown): Record<string, any>;
export function buildBitrefillLogMetadata(input: Record<string, unknown>): Record<string, string | number>;
export class BitrefillDeliveryDeduplicator { claim(orderId: string): boolean; }
export class BitrefillProvider {
  constructor(transport: any);
  readonly capabilities: typeof BITREFILL_CAPABILITIES;
  readCatalog(input?: Record<string, unknown>): Promise<Record<string, any>>;
  readProduct(productId: string): Promise<Record<string, any>>;
  readAvailability(productId: string): Promise<Record<string, any>>;
  createOrder(request: Record<string, unknown>): Promise<Record<string, any>>;
}
