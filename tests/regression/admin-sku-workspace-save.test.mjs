import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (name) => readFileSync(name, "utf8");

test("workspace API requires admin and invokes exactly one transactional RPC", () => {
  const route = file("app/api/admin/products/[id]/skus/workspace/route.ts");
  assert.match(route, /requireCatalogAdmin\(requestId\)/);
  assert.match(route, /inspectCatalogSkuSchema\(service\)/);
  assert.equal(route.match(/service\.rpc\("admin_save_product_sku_workspace"/g)?.length, 1);
  assert.doesNotMatch(route, /\.from\("product_skus"\)[\s\S]*?\.(?:insert|update)\(/);
  assert.match(route, /body\.operations\.length > MAX_MUTATIONS/);
  assert.match(route, /validOperationEnvelope/);
  assert.match(route, /PAYLOAD_FIELDS/);
  assert.match(route, /auditCatalogAction/);
});

test("client uses one HTTP request and retains stable fail-closed errors", () => {
  const client = file("lib/supabase/admin-catalog.ts");
  const helper = client.slice(client.indexOf("export async function saveProductSkuWorkspace"), client.indexOf("export async function deleteProductSku"));
  assert.equal(helper.match(/fetch\(/g)?.length, 1);
  for (const value of ["SKU_WORKSPACE_SAVE_FAILED", "ProductSkuWorkspaceError", "blocked_items", "created_mappings"]) assert.match(helper, new RegExp(value));
});

test("Admin SKU save is a single workspace call with no row-by-row partial save", () => {
  const manager = file("components/admin/products/AdminProductSkuManager.tsx");
  const save = manager.slice(manager.indexOf("async function saveAll"), manager.indexOf("useImperativeHandle", manager.indexOf("async function saveAll")));
  assert.equal(save.match(/saveProductSkuWorkspace\(/g)?.length, 1);
  assert.doesNotMatch(save, /createProductSku|updateProductSku|listProductSkus/);
  assert.doesNotMatch(save, /for\s*\([^)]*\)\s*\{[\s\S]*?await/);
  assert.match(save, /SKU 已被其他操作修改，请刷新后重新确认/);
  assert.match(save, /SKU 已保存：新增 \$\{result\.created_count\}，更新 \$\{result\.updated_count\}/);
  assert.match(save, /result\.skus\.map/);
});

test("single-SKU create/update/delete APIs remain compatible and delete stays independent", () => {
  const manager = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(manager, /await deleteProductSku\(product\.id, deleting\.sku\.id\)/);
  for (const name of ["app/api/admin/products/[id]/skus/route.ts", "app/api/admin/products/[id]/skus/[skuId]/route.ts"]) {
    const route = file(name);
    assert.match(route, /requireCatalogAdmin/);
    assert.match(route, /SKU_ACTIVATION_NOT_READY/);
  }
  const updateRoute = file("app/api/admin/products/[id]/skus/[skuId]/route.ts");
  assert.match(updateRoute, /activeAutomaticEdit/);
  assert.match(updateRoute, /nextSku\.status === "active"/);
  assert.match(updateRoute, /isAutomaticSkuActivation\([^)]*\) \|\| activeAutomaticEdit/);
});
