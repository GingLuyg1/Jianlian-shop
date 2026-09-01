import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("supplier operations UI uses existing admin APIs without changing fulfillment authority", () => {
  const navigation = file("components/admin/admin-navigation.ts");
  const supplierPage = file("app/admin/suppliers/page.tsx");
  const supplierWorkspace = file("components/admin/suppliers/AdminSuppliersWorkspace.tsx");
  const bindingSheet = file("components/admin/suppliers/AdminSupplierBindingSheet.tsx");
  const products = file("app/admin/products/page.tsx");
  const uiRegistry = file("components/admin/suppliers/supplier-ui-registry.ts");
  const bindingRoute = file("app/api/admin/suppliers/daju/bindings/[productId]/route.ts");
  const browserSources = [supplierPage, supplierWorkspace, bindingSheet, uiRegistry].join("\n");

  assert.match(navigation, /label: "供应商管理", href: "\/admin\/suppliers"/);
  assert.match(supplierWorkspace, /import AdminPageShell from "@\/components\/admin\/AdminPageShell"/);
  assert.match(supplierWorkspace, /<AdminPageShell/);

  assert.match(supplierWorkspace, /"\/api\/admin\/suppliers\/daju\?resource=balance"/);
  assert.match(supplierWorkspace, /"\/api\/admin\/suppliers\/daju\?resource=products"/);
  assert.match(supplierWorkspace, /`\/api\/admin\/suppliers\/daju\?resource=product&id=\$\{productId\}`/);
  assert.doesNotMatch(browserSources, /ai\.hanfolk\.xyz/i);
  assert.doesNotMatch(browserSources, /X-API-Key|DAJU_API_KEY|process\.env/i);
  assert.doesNotMatch(browserSources, /\/purchase(?:[/?"'`]|$)|action:\s*["']purchase["']/i);

  assert.match(products, /供应商绑定/);
  assert.match(products, /<AdminSupplierBindingSheet/);
  assert.match(products, /<SupplierBindingBadge product=\{product\}/);
  assert.match(bindingSheet, /fetch\(`\/api\/admin\/suppliers\/daju\/bindings\/\$\{product\.id\}`/);
  assert.match(bindingSheet, /method: "POST"/);
  for (const field of ["supplier_product_id", "supplier_sku", "supplier_inputs_mapping", "supplier_max_unit_cost"]) {
    assert.match(bindingSheet, new RegExp(`\\b${field}:`));
  }
  for (const orderField of ["customer_email", "customer_name", "customer_phone", "customer_note"]) {
    assert.match(bindingSheet, new RegExp(`value: "${orderField}"`));
  }
  assert.match(bindingSheet, /<select value=\{inputsMapping\[field\] \?\? ""\}/);
  assert.doesNotMatch(bindingSheet, /placeholder="输入对应订单字段/);
  assert.match(bindingSheet, /async function saveBinding\(\)[\s\S]*if \(!detail\.isAuto\)[\s\S]*toast\.error\("该供应商商品不支持自动交付/);
  assert.match(bindingSheet, /async function saveBinding\(\)[\s\S]*missingRequiredInputs\.length > 0[\s\S]*toast\.error\(`以下供应商必填字段尚未映射/);
  assert.match(bindingSheet, /以下供应商必填字段尚未映射：\{missingRequiredInputs\.join\("、"\)\}/);
  assert.match(bindingSheet, /disabled=\{saving \|\| !detail \|\| !detail\.isAuto \|\| missingRequiredInputs\.length > 0\}/);
  assert.match(bindingSheet, /window\.confirm/);
  assert.doesNotMatch(bindingSheet, /\/unbind|action:\s*["']unbind["']|delete\s+metadata\.(?:supplier|fulfillment_source)/i);

  assert.match(products, /metadata_base/);
  assert.match(products, /\{ \.\.\.productForm\.metadata_base \}/);
  for (const operation of ["listProducts", "getProduct", "createProduct", "updateProduct", "deleteProduct"]) {
    assert.match(products, new RegExp(`${operation}\\(`));
  }

  const detailRead = bindingRoute.indexOf("await client.getProduct(parsed.productId)");
  const productWrite = bindingRoute.indexOf(".update({ metadata: nextMetadata");
  assert.ok(detailRead > 0 && productWrite > detailRead, "authoritative supplier detail must be read before the website product is modified");
  assert.match(bindingRoute, /validateDajuBindingAgainstProductDetail\(parsed, supplierProduct\)/);
  assert.match(bindingRoute, /compareDajuDecimal\(parsed\.maxUnitCost, "0"\) !== 1/);
  assert.match(bindingRoute, /DAJU_REQUIRED_INPUTS_UNMAPPED[\s\S]*status|DAJU_REQUIRED_INPUTS_UNMAPPED[\s\S]*, 400/);
  assert.match(bindingRoute, /DAJU_PRODUCT_NOT_AUTOMATIC[\s\S]*, 400/);
  assert.match(bindingRoute, /详情读取失败，未保存自动履约绑定/);
  assert.doesNotMatch(bindingRoute, /\.purchase\(|\/purchase/);
});
