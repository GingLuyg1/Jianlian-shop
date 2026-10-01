function numberOrZero(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

export function derivePublicCatalogSkuSummary(product, skuOptions) {
  const visibleSkus = (Array.isArray(skuOptions) ? skuOptions : [])
    .filter((sku) => sku?.status === "active" || sku?.status === "sold_out");
  const productHasSkus = product?.has_skus === true || visibleSkus.length > 0;
  const skuPrices = visibleSkus
    .map((sku) => numberOrZero(sku?.price))
    .filter((price) => Number.isFinite(price));
  const parentPrice = numberOrZero(product?.price);
  const minPrice = skuPrices.length > 0 ? Math.min(...skuPrices) : parentPrice;
  const maxPrice = skuPrices.length > 0 ? Math.max(...skuPrices) : parentPrice;
  const effectiveStock = productHasSkus
    ? visibleSkus
        .filter((sku) => sku.status === "active")
        .reduce((sum, sku) => sum + Math.max(0, Math.trunc(numberOrZero(sku.stock))), 0)
    : product?.status === "sold_out"
      ? 0
      : Math.max(0, Math.trunc(numberOrZero(product?.stock)));

  return { productHasSkus, minPrice, maxPrice, effectiveStock };
}
