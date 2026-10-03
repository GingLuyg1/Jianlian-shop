import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const file = (name) => readFileSync(join(root, name), "utf8");

test("bulk preview and execute routes enforce admin, schema, ownership and authoritative readiness", () => {
  const shared = file("app/api/admin/products/[id]/skus/bulk/_shared.ts");
  const preview = file("app/api/admin/products/[id]/skus/bulk/preview/route.ts");
  const execute = file("app/api/admin/products/[id]/skus/bulk/execute/route.ts");
  for (const route of [preview, execute]) {
    assert.match(route, /requireCatalogAdmin\(requestId\)/);
    assert.match(route, /inspectCatalogSkuSchema\(service\)/);
    assert.match(route, /readSkuBulkOperation\(service, params\.id, body\)/);
  }
  assert.match(shared, /\.eq\("product_id", productId\)\.in\("id", parsed\.skuIds\)/);
  assert.match(shared, /BULK_SKU_OWNERSHIP_MISMATCH/);
  assert.match(shared, /readSkuActivationReadiness\(service, product, sku\)/);
  assert.match(shared, /isAutomaticSkuActivation\(sku\.status, "active", product, sku\)/);
});

test("execute revalidates from the database and defers every write for atomicity", () => {
  const execute = file("app/api/admin/products/[id]/skus/bulk/execute/route.ts");
  const helper = file("lib/products/admin-sku-bulk-operations.mjs");
  assert.match(execute, /readSkuBulkOperation\(service, params\.id, body\)/);
  assert.match(execute, /BULK_OPERATION_BLOCKED/);
  assert.match(execute, /BULK_ACTIVATION_DEFERRED_FOR_ATOMICITY/);
  assert.match(helper, /BULK_STATUS_EXECUTION_DEFERRED_FOR_ATOMICITY/);
  assert.doesNotMatch(helper, /await updateStatuses/);
  assert.doesNotMatch(execute, /\.from\("product_skus"\)[\s\S]*?\.update\(/);
  assert.doesNotMatch(execute, /syncSkuProductSummary/);
  assert.doesNotMatch(execute, /result:\s*"success"/);
  assert.match(execute, /auditCatalogAction/);
});

test("bulk request contract exposes no force, override or arbitrary target status", () => {
  const helper = file("lib/products/admin-sku-bulk-operations.mjs");
  assert.match(helper, /REQUEST_FIELDS = new Set\(\["sku_ids", "action"\]\)/);
  assert.match(helper, /SKU_BULK_BATCH_LIMIT = 100/);
  assert.match(helper, /MALFORMED_SKU_ID/);
  assert.match(helper, /DUPLICATE_SKU_ID/);
  assert.doesNotMatch(helper, /body\.(?:force|override|ignore_readiness|skip_failed|target_status)/);
});

test("Admin SKU manager provides scoped selection, preview, blocked reasons and safe confirmation", () => {
  const manager = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(manager, /已选择 \{selectedSkuIds\.size\} 个 SKU/);
  assert.match(manager, /选择当前列表全部 SKU/);
  assert.match(manager, />清除选择</);
  assert.match(manager, /previewProductSkuBulkAction/);
  assert.match(manager, /bulkPreview\.blocked_count/);
  assert.match(manager, /formatSkuActivationReasons\(item\.reasons\)/);
  assert.match(manager, /!bulkPreview\.execution_supported/);
  assert.match(manager, /当前仅支持批量预检；安全的批量状态写入将在事务型后端完成后开放/);
  assert.doesNotMatch(manager, /executeProductSkuBulkAction/);
  assert.match(manager, /onOpenChange=\{\(open\) => \{ if \(!open && !bulkBusy\) setBulkPreview\(null\); \}\}/);
  assert.match(manager, /previousProductId\.current !== productId/);
});
