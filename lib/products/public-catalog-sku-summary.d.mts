export type PublicCatalogSkuSummaryProduct = {
  has_skus?: boolean | null;
  price?: number | string | null;
  stock?: number | string | null;
  status?: string | null;
};

export type PublicCatalogSkuSummaryOption = {
  price?: number | string | null;
  stock?: number | string | null;
  status?: string | null;
};

export function derivePublicCatalogSkuSummary(
  product: PublicCatalogSkuSummaryProduct,
  skuOptions: PublicCatalogSkuSummaryOption[],
): {
  productHasSkus: boolean;
  minPrice: number;
  maxPrice: number;
  effectiveStock: number;
};
