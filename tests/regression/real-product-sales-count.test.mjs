import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const publicCatalog = fs.readFileSync("lib/supabase/public-catalog.ts", "utf8");
const catalogRoute = fs.readFileSync("app/api/catalog/products/route.ts", "utf8");

test("public catalog never synthesizes or hard-codes sales counts", () => {
  assert(!publicCatalog.includes("PRODUCT_SALES_COUNT_BY_KEY"));
  assert(!publicCatalog.includes("positiveHash %"));
  assert.match(publicCatalog, /return 0;/);
});

test("catalog API sources sales from paid, non-refunded order items", () => {
  assert.match(catalogRoute, /from\("order_items"\)/);
  assert.match(catalogRoute, /orders!inner\(payment_status,refund_status\)/);
  assert.match(catalogRoute, /eq\("orders\.payment_status", "paid"\)/);
  assert.match(catalogRoute, /eq\("orders\.refund_status", "none"\)/);
  assert.match(catalogRoute, /loadVerifiedSalesCounts\(paged\.map/);
  assert.match(catalogRoute, /sales_count: salesCountByProduct\.get\(product\.id\) \?\? 0/);
});
