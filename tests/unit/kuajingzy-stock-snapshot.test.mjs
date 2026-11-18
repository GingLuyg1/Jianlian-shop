import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildKuajingZyAvailabilityMetadata,
  parseKuajingZyStockBinding,
  resolveKuajingZyAdvisoryAvailability,
} from "../../lib/providers/kuajingzy/stock.mjs";

const productMeta={fulfillment_source:"supplier",supplier:"kuajingzy",supplier_product_id:"imp_test",supplier_sku:"9"};
const binding=parseKuajingZyStockBinding(productMeta,{});

test("exact KuajingZY variant resolves advisory availability without becoming local stock authority",()=>{
  assert.deepEqual(binding,{supplierProductId:"imp_test",supplierSku:"9"});
  const result=resolveKuajingZyAdvisoryAvailability({
    id:"imp_test",variants:[{id:"9",stock:23},{id:"10",stock:99}],
  },binding);
  assert.equal(result.ok,true);
  assert.equal(result.stock,23);
  assert.equal(result.availability,"available");
  const metadata=buildKuajingZyAvailabilityMetadata({},result,"2026-11-18T00:00:00.000Z");
  assert.equal(metadata.supplier_stock_snapshot,23);
  assert.equal(metadata.supplier_stock_snapshot_advisory,true);
  assert.equal(metadata.supplier_stock_stale,false);
});

test("zero is a valid out-of-stock snapshot; missing or mismatched SKU fails closed",()=>{
  assert.equal(resolveKuajingZyAdvisoryAvailability({id:"imp_test",variants:[{id:"9",stock:0}]},binding).availability,"out_of_stock");
  assert.equal(resolveKuajingZyAdvisoryAvailability({id:"imp_test",variants:[{id:"10",stock:5}]},binding).ok,false);
  assert.equal(resolveKuajingZyAdvisoryAvailability({id:"imp_test",variants:[{id:"9"}]},binding).availability,"unknown");
});

test("snapshot failure marks evidence stale and never fabricates availability",()=>{
  const metadata=buildKuajingZyAvailabilityMetadata(
    {supplier_stock_snapshot:23,supplier_stock_last_success_at:"2026-11-17T00:00:00.000Z"},
    {ok:false,code:"SUPPLIER_READ_FAILED",availability:"unknown",stock:null},
    "2026-11-18T00:00:00.000Z",
  );
  assert.equal(metadata.supplier_stock_snapshot,23);
  assert.equal(metadata.supplier_availability_snapshot,"unknown");
  assert.equal(metadata.supplier_stock_stale,true);
  assert.equal(metadata.supplier_stock_sync_status,"error");
});

test("server sync and admin route cannot mutate sellable stock/status or call purchase",()=>{
  const sync=fs.readFileSync("lib/providers/kuajingzy/stock-sync.ts","utf8");
  const route=fs.readFileSync("app/api/admin/suppliers/kuajingzy/stock/[productId]/route.ts","utf8");
  assert.doesNotMatch(sync,/\.update\(\{[^}]*\bstock\s*:/s);
  assert.doesNotMatch(sync,/\.update\(\{[^}]*\bstatus\s*:/s);
  assert.doesNotMatch(sync,/\.purchase\s*\(/);
  assert.doesNotMatch(route,/\.purchase\s*\(/);
  assert.match(sync,/runtime\?\?=getKuajingZyReadonlyRuntime\(\)/);
  assert.match(sync,/collectMallCatalog\(\{itemId:supplierProductId,limit:1\}\)/);
  assert.match(route,/stock_mutated:false/);
  assert.match(route,/purchase_attempted:false/);
});
