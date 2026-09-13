import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = (path) => readFileSync(path, "utf8");
test("inventory status errors expose only safe business reasons", () => {
  const route = read("app/api/admin/inventory/route.ts");
  const helper = route.slice(route.indexOf("function getInventoryStatusError"), route.indexOf("export async function GET"));
  const compiled = ts.transpileModule(helper + "\nreturn getInventoryStatusError;", { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const classify = new Function(compiled)();
  assert.deepEqual(classify({ message: "库存不存在，或已交付库存不能禁用" }), { message: "库存不存在，或已交付库存不能禁用", status: 409 });
  assert.equal(classify({ message: "inventory item not found" }).status, 404);
  assert.equal(classify({ message: "无后台访问权限" }).status, 403);
  assert.deepEqual(classify({ message: "SELECT private_table secret=value" }), { message: "库存状态更新失败", status: 500 });
});
test("disable item uses p_remark while batch and restore keep p_reason", () => {
  const route = read("app/api/admin/inventory/route.ts");
  const item = route.match(/rpc\("admin_disable_digital_inventory", \{([\s\S]*?)\}\)/)?.[1];
  assert.ok(item);
  assert.match(item, /p_inventory_id: inventoryId/);
  assert.match(item, /p_remark: remark \|\| null/);
  assert.doesNotMatch(item, /p_reason/);
  for (const rpc of ["admin_disable_digital_inventory_batch", "admin_restore_digital_inventory_item"]) assert.match(route, new RegExp(`rpc\\("${rpc}", \\{[\\s\\S]*?p_reason: remark \\|\\| null`));
});
test("transient inventory and compensation feedback does not occupy page layout", () => {
  for (const path of ["app/admin/inventory/page.tsx", "app/admin/system/compensations/page.tsx"]) {
    const page = read(path);
    assert.doesNotMatch(page, /setNotice|\[notice,/);
    assert.match(page, /toast.success/);
    assert.match(page, /toast.error/);
    assert.match(page, /window.confirm/);
    assert.match(page, /AdminErrorState/);
  }
  assert.match(read("app/admin/inventory/page.tsx"), /importValidation/);
});
test("one root Toaster retains global feedback policy", () => {
  const layout = read("app/layout.tsx");
  assert.equal((layout.match(/<Toaster\b/g) ?? []).length, 1);
  assert.match(layout, /richColors position="top-center" duration=\{4000\} visibleToasts=\{4\}/);
});
