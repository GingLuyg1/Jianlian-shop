import { createClient } from "@supabase/supabase-js";
import { inspectCatalogSkuSchema } from "../lib/products/catalog-readiness.mjs";
import { LEGACY_SKU_DEFINITIONS, planLegacySkuBackfill } from "../lib/products/legacy-sku-backfill.mjs";

const execute = process.argv.includes("--execute");
if (process.argv.includes("--apply")) {
  throw new Error("--apply is not supported; use the explicit --execute flag only after reviewing dry-run output");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase connection variables are required");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const slugs = Object.keys(LEGACY_SKU_DEFINITIONS);

async function readTargetState() {
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id,slug,delivery_type")
    .in("slug", slugs);
  if (productError) throw new Error("Legacy product audit failed");
  const productIds = (products ?? []).map((product) => product.id);
  const { data: skus, error: skuError } = productIds.length
    ? await supabase.from("product_skus").select("id,product_id,sku_code,sku_title,combination_key,price,stock,status,metadata").in("product_id", productIds)
    : { data: [], error: null };
  if (skuError) throw new Error("Existing SKU audit failed");
  return { products: products ?? [], skus: skus ?? [] };
}

const targetState = await readTargetState();
const schemaReadiness = await inspectCatalogSkuSchema(supabase);
const plan = planLegacySkuBackfill(targetState.products, targetState.skus);
console.log(JSON.stringify({
  mode: execute ? "execute" : "dry-run",
  schemaReady: schemaReadiness.ready,
  schemaIssues: schemaReadiness.issues.map((issue) => issue.code),
  planned: {
    insert: plan.insert.map((row) => ({ product_id: row.product_id, sku_code: row.sku_code, price: row.price, stock: row.stock, status: row.status })),
    update: plan.update,
    skip: plan.skip.map((row) => ({ slug: row.slug, sku_code: row.definition.sku_code, reason: row.code })),
    conflict: plan.conflict.map((row) => ({ slug: row.slug, sku_code: row.definition?.sku_code ?? null, reason: row.code, fields: row.fields ?? [] })),
    productMissing: plan.missingProduct,
    partial: plan.partial,
  },
}, null, 2));

if (!execute) process.exit(0);
if (!schemaReadiness.ready) throw new Error("Backfill execute blocked until catalog SKU schema is ready");
if (plan.conflict.length) throw new Error("Backfill execute blocked by SKU conflicts");

// Re-read immediately before writing so an approved plan cannot silently target changed products.
const verifiedState = await readTargetState();
const verifiedPlan = planLegacySkuBackfill(verifiedState.products, verifiedState.skus);
const signature = (value) => JSON.stringify({
  insert: value.insert.map((row) => [row.product_id, row.sku_code, row.price, row.stock, row.status]),
  skip: value.skip.map((row) => [row.slug, row.definition.sku_code, row.existingId]),
  conflict: value.conflict,
  missingProduct: value.missingProduct,
});
if (signature(plan) !== signature(verifiedPlan)) {
  throw new Error("Backfill execute blocked because target state changed after planning");
}

if (verifiedPlan.insert.length) {
  const { error } = await supabase.from("product_skus").insert(verifiedPlan.insert);
  if (error) throw new Error("Legacy SKU backfill insert failed");
}

// Heal the derived readiness flag even on an idempotent retry after a prior
// insert succeeded but the separate summary update failed.
const summaryProductIds = [...new Set(verifiedPlan.partial
  .filter((row) => row.product_id && row.conflict === 0 && row.insert + row.skip === row.expected)
  .map((row) => row.product_id))];
if (summaryProductIds.length) {
  const { error: summaryError } = await supabase.from("products").update({ has_skus: true }).in("id", summaryProductIds);
  if (summaryError) throw new Error("Legacy SKU backfill completed but has_skus summary update failed; rerun the same command safely after resolving the database error");
}
console.log(JSON.stringify({ mode: "execute", inserted: verifiedPlan.insert.length, skipped: verifiedPlan.skip.length, summarizedProducts: summaryProductIds.length, missingProducts: verifiedPlan.missingProduct }));
