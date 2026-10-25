export type CatalogProduct = { id: string; name: string; country: string; currency: string; category: string;
  categories: string[]; available: boolean; stockQuantity: null; packages: { packageId: string; faceValue: string | number | null;
    valueLabel: string | null; catalogPrice: number | null; trustedCost: null }[];
  range: { min: number; max: number; step: number } | null };
export type CatalogPage = { products: CatalogProduct[]; page: number; pageSize: number; total: number; hasMore: boolean;
  categories: string[]; checkedAt: string; truncated: boolean; source: string; trustedLiveCost: false; realPurchaseEnabled: false };
export class BitrefillCatalogError extends Error { code: string; status: number; }
export function createBitrefillCatalogManager(client: unknown, options?: unknown): {
  list(params?: unknown): Promise<CatalogPage>; detail(id: string): Promise<{ product: CatalogProduct; checkedAt: string; source: string; fingerprint: string }>;
};
