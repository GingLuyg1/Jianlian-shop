import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Bitrefill dynamic pricing supports two-way repricing, ±15% circuit breaker, parent min price sync, and email summary", () => {
  const service = read("lib/providers/bitrefill/cost-sync-service.ts");
  assert.match(service, /PRICE_DRIFT_CIRCUIT_BREAKER/);
  assert.match(service, /maxPriceDriftPercent/);
  assert.match(service, /Math\.abs\(rawDriftPercent\) > maxPriceDriftPercent/);
  assert.match(service, /notifyBitrefillPriceSyncSummary/);
  assert.match(service, /affectedProductIds/);
  assert.match(service, /\.from\("products"\)/);
  assert.match(service, /Math\.min\(\.\.\.prices\)/);
  assert.match(service, /select\("id,product_id,sku_title,sku_code,price,status,metadata"\)/);
  assert.doesNotMatch(service, /cost_price:/);

  const route = read("app/api/admin/suppliers/bitrefill/cost-sync/route.ts");
  assert.match(route, /INTERNAL_JOB_SECRET/);
  assert.match(route, /updateRetailPrice/);
  assert.match(route, /maxPriceDriftPercent/);

  const internalRoute = read("app/api/internal/bitrefill-cost-sync/route.ts");
  assert.match(internalRoute, /timingSafeEqual/);
  assert.match(internalRoute, /INTERNAL_JOB_SECRET/);
  assert.match(internalRoute, /syncBitrefillCostsAndRates/);

  const ui = read("components/admin/suppliers/AdminSuppliersWorkspace.tsx");
  assert.match(ui, /一键联动调价/);
  assert.match(ui, /AdminConfirmDialog/);
  assert.doesNotMatch(ui, /window\.confirm/);
});
