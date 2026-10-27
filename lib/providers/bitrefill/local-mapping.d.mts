export type LocalSku = { id: string; title: string; brand: string; country: string; denominationCurrency: string;
  faceValue: string; saleCurrency: string; salePrice: string | null; source: string; priceVerified: false };
export type LocalMapping = { skuId: string; productId: string; packageId: string | null; rangeValue: string | null;
  mode: "package" | "range"; status: string; version: number; reviewNote: string; configuredCost: string | null; costCurrency: string | null;
  configuredFees: string | null; automaticPurchaseAllowed: false; catalogFingerprint: string;
  financials: { estimatedProfit: string | null; profitReason: string; actualCost: unknown | null } };
export function createLocalBitrefillMappingService(input: unknown): {
  list(): Promise<{ localOnly: true; realPurchaseEnabled: false; skus: LocalSku[]; mappings: LocalMapping[] }>;
  save(input: unknown, actor: string): Promise<LocalMapping>; addSku(input: unknown, actor: string): Promise<LocalSku>;
  recordSyntheticActualCost(input: unknown): Promise<unknown>; annotateCase(input: unknown, actor: string): Promise<unknown>;
};
export function mappingMoney(value: string): bigint;
