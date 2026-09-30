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
  const productsBySlug = new Map();
  for (const product of products) {
    const slug = String(product?.slug ?? "");
    productsBySlug.set(slug, [...(productsBySlug.get(slug) ?? []), product]);
  }
  const existingByKey = new Map();
  for (const sku of existingSkus) {
    const key = `${sku?.product_id}:${String(sku?.sku_code ?? "").trim().toLowerCase()}`;
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), sku]);
  }
  const plan = { insert: [], update: [], skip: [], conflict: [], missingProduct: [], partial: [] };

  for (const [slug, definitions] of Object.entries(LEGACY_SKU_DEFINITIONS)) {
    const matchingProducts = productsBySlug.get(slug) ?? [];
    if (matchingProducts.length === 0) {
      plan.missingProduct.push({ slug, code: "PRODUCT_MISSING" });
      plan.partial.push({ slug, product_id: null, status: "product_missing", expected: definitions.length, insert: 0, update: 0, skip: 0, conflict: 0 });
      continue;
    }
    if (matchingProducts.length > 1) {
      plan.conflict.push({ slug, code: "PRODUCT_SLUG_NOT_UNIQUE", productCount: matchingProducts.length });
      plan.partial.push({ slug, product_id: null, status: "conflict", expected: definitions.length, insert: 0, update: 0, skip: 0, conflict: 1 });
      continue;
    }

    const product = matchingProducts[0];
    const counters = { insert: 0, update: 0, skip: 0, conflict: 0 };
    for (const definition of definitions) {
      const matchingSkus = existingByKey.get(`${product.id}:${definition.sku_code.toLowerCase()}`) ?? [];
      if (matchingSkus.length > 1) {
        plan.conflict.push({ slug, definition, code: "SKU_CODE_NOT_UNIQUE", existingIds: matchingSkus.map((sku) => sku.id) });
        counters.conflict += 1;
        continue;
      }
      const existing = matchingSkus[0];
      if (existing) {
        const mismatches = [];
        if (String(existing.sku_title) !== definition.sku_title) mismatches.push("sku_title");
        if (Number(existing.price) !== definition.price) mismatches.push("price");
        if (String(existing.combination_key ?? definition.sku_code).toLowerCase() !== definition.sku_code.toLowerCase()) mismatches.push("combination_key");
        if (mismatches.length === 0) {
          plan.skip.push({ slug, definition, existingId: existing.id, code: "EXACT_MATCH" });
          counters.skip += 1;
        } else {
          plan.conflict.push({ slug, definition, existingId: existing.id, code: "SKU_DEFINITION_CONFLICT", fields: mismatches });
          counters.conflict += 1;
        }
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
      counters.insert += 1;
    }
    plan.partial.push({
      slug,
      product_id: product.id,
      status: counters.conflict > 0 ? "conflict" : counters.skip === definitions.length ? "complete" : counters.insert === definitions.length ? "empty" : "partial",
      expected: definitions.length,
      ...counters,
    });
  }
  return plan;
}
