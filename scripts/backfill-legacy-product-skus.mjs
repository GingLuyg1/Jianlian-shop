import { createClient } from "@supabase/supabase-js";
import { LEGACY_SKU_DEFINITIONS, planLegacySkuBackfill } from "../lib/products/legacy-sku-backfill.mjs";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase connection variables are required");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const slugs = Object.keys(LEGACY_SKU_DEFINITIONS);
const { data: products, error: productError } = await supabase
  .from("products")
  .select("id,slug,delivery_type")
  .in("slug", slugs);
if (productError) throw new Error("Legacy product audit failed");

const productIds = (products ?? []).map((product) => product.id);
const { data: skus, error: skuError } = productIds.length
  ? await supabase.from("product_skus").select("id,product_id,sku_code,sku_title,price").in("product_id", productIds)
  : { data: [], error: null };
if (skuError) throw new Error("Existing SKU audit failed");

const plan = planLegacySkuBackfill(products ?? [], skus ?? []);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", planned: plan.insert.length, skipped: plan.skip.length, conflicts: plan.conflict.length, missingProducts: plan.missingProduct }, null, 2));

if (!apply) process.exit(0);
if (plan.conflict.length || plan.missingProduct.length) throw new Error("Backfill blocked by conflicts or missing legacy products");
if (plan.insert.length) {
  const { error } = await supabase.from("product_skus").insert(plan.insert);
  if (error) throw new Error("Legacy SKU backfill insert failed");
}
console.log(JSON.stringify({ mode: "apply", inserted: plan.insert.length, skipped: plan.skip.length }));
