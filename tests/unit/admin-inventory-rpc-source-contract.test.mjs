import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("inventory item RPC uses the Production batch-number contract", () => {
  const route = read("app/api/admin/inventory/route.ts");
  const itemBranch = route.match(/if \(mode === "items"\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";

  assert.match(itemBranch, /getSearchParam\(request, "batchNo"\)/);
  assert.match(itemBranch, /rpc\("admin_list_digital_inventory_items", \{[\s\S]*?p_product_id: productId,[\s\S]*?p_batch_no: batchNo \|\| null,[\s\S]*?p_status: status,[\s\S]*?p_page: Number\.isFinite\(page\) \? page : 1,[\s\S]*?p_page_size: Number\.isFinite\(pageSize\) \? pageSize : 20/);
  assert.doesNotMatch(itemBranch, /p_search/);
});

test("product and batch inventory detail requests keep distinct scopes", () => {
  const page = read("app/admin/inventory/page.tsx");
  const productItems = page.match(/const openProductItems[\s\S]*?\n  \}, \[itemStatus\]\);/)?.[0] ?? "";
  const batchItems = page.match(/const openBatchItems[\s\S]*?\n  \}, \[itemStatus\]\);/)?.[0] ?? "";

  assert.match(productItems, /mode: "items", productId: row\.product_id, status: itemStatus, page: "1", pageSize: "50"/);
  assert.doesNotMatch(productItems, /batchNo/);
  assert.match(batchItems, /mode: "items", productId: row\.product_id, batchNo: row\.batch_no, status: itemStatus, page: "1", pageSize: "50"/);
  assert.doesNotMatch(batchItems, /\.filter\(\(item\) => item\.batch_no === row\.batch_no\)/);
});

test("inventory batches and summary retain their search RPC contracts", () => {
  const route = read("app/api/admin/inventory/route.ts");

  assert.match(route, /rpc\("admin_list_digital_inventory_batches", \{[\s\S]*?p_search: search \|\| null,[\s\S]*?p_status: status,[\s\S]*?p_page:[\s\S]*?p_page_size:/);
  assert.match(route, /rpc\("admin_list_digital_inventory_summary", \{[\s\S]*?p_search: search \|\| null,[\s\S]*?p_status: status,[\s\S]*?p_page:[\s\S]*?p_page_size:/);
});

test("inventory errors stay module-specific and do not expose database details", () => {
  const route = read("app/api/admin/inventory/route.ts");

  assert.doesNotMatch(route, /getOrderErrorMessage/);
  assert.match(route, /catch \(error\) \{[\s\S]*?const message = "库存数据加载失败";[\s\S]*?errorMessage: getInventoryAuditError\(error\),[\s\S]*?return jsonError\(message, 500\);/);
  assert.match(route, /catch \(error\) \{[\s\S]*?const message = "库存状态更新失败";[\s\S]*?errorMessage: getInventoryAuditError\(error\),[\s\S]*?return jsonError\(message, 500\);/);
  assert.doesNotMatch(route, /return jsonError\(getInventoryAuditError\(error\)/);
});

test("inventory audit diagnostics retain safe Supabase fields", () => {
  const route = read("app/api/admin/inventory/route.ts");

  assert.match(route, /import \{ sanitizeMessage \} from "@\/lib\/monitoring\/logger"/);
  assert.match(route, /\["code", "message", "details", "hint"\]/);
  assert.match(route, /typeof value === "string"/);
  assert.match(route, /authorization\|cookie\|password\|api\[_-\]\?key\|token\|secret\|credential/);
  assert.match(route, /\.slice\(0, 600\)/);
});
