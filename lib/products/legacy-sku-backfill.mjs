const money = (value) => Math.round(value * 100) / 100;

export const LEGACY_SKU_DEFINITIONS = {
  "gift-apple-us": [2, 3, 4, 5, 10, 15, 20, 25, 50, 100].map((usd, index) => ({
    sku_code: `${usd}-usd`,
    sku_title: `${usd} USD`,
    price: money(usd * 7 * 1.06),
    sort_order: (index + 1) * 10,
  })),
  "gift-giffgaff-topup": [
    { sku_code: "10-gbp", sku_title: "10英镑", price: 107.8, sort_order: 10 },
    { sku_code: "15-gbp", sku_title: "15英镑", price: 161.7, sort_order: 20 },
    { sku_code: "20-gbp", sku_title: "20英镑", price: 215.6, sort_order: 30 },
  ],
};

export function planLegacySkuBackfill(products, existingSkus) {
  const productBySlug = new Map(products.map((product) => [String(product.slug), product]));
  const existingByKey = new Map(existingSkus.map((sku) => [`${sku.product_id}:${String(sku.sku_code).toLowerCase()}`, sku]));
  const plan = { insert: [], skip: [], conflict: [], missingProduct: [] };

  for (const [slug, definitions] of Object.entries(LEGACY_SKU_DEFINITIONS)) {
    const product = productBySlug.get(slug);
    if (!product) {
      plan.missingProduct.push(slug);
      continue;
    }
    for (const definition of definitions) {
      const existing = existingByKey.get(`${product.id}:${definition.sku_code.toLowerCase()}`);
      if (existing) {
        const exact = String(existing.sku_title) === definition.sku_title && Number(existing.price) === definition.price;
        (exact ? plan.skip : plan.conflict).push({ slug, definition, existingId: existing.id });
        continue;
      }
      plan.insert.push({
        product_id: product.id,
        sku_code: definition.sku_code,
        sku_title: definition.sku_title,
        combination_key: definition.sku_code.toLowerCase(),
        price: definition.price,
        original_price: null,
        stock: 0,
        status: "draft",
        delivery_type: product.delivery_type ?? null,
        image_url: null,
        sort_order: definition.sort_order,
        metadata: { legacy_catalog_backfill: true, inventory_state: "requires_verification" },
      });
    }
  }
  return plan;
}
