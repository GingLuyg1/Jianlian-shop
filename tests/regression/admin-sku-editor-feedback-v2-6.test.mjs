import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const file = (name) => fs.readFileSync(new URL("../../" + name, import.meta.url), "utf8");

test("SKU table replaces duplicate price-stock form and preserves product sorting", () => {
  const page = file("app/admin/products/page.tsx");
  const editor = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(page, /title="价格与库存 \/ SKU"/);
  assert.doesNotMatch(page, /title="SKU \/ 规格与供应商绑定"|title="价格与库存"/);
  assert.match(page, /label="商品排序"/);
  assert.match(editor, /\["名称", "Code", "价格", "库存", "交付方式", "状态", "绑定供货商"\]/);
  assert.match(editor, /<table/);
  assert.match(editor, /h-8/);
  assert.match(editor, /<details/);
  assert.match(editor, /sku_title: "默认规格", sku_code: "DEFAULT", \.\.\.defaultsRef\.current/);
});
test("SKU save validates rows, excludes blank draft, and remembers partial successful inserts", () => {
  const editor = file("components/admin/products/AdminProductSkuManager.tsx");
  const page = file("app/admin/products/page.tsx");
  assert.match(editor, /ensureTrailingEmptySkuRow/);
  assert.match(editor, /validateSkuDraft/);
  assert.match(editor, /aria-invalid=\{Boolean\(errors\[row.key\]\?\.original_price\)\}/);
  assert.match(editor, /errors\[row.key\]\.sort_order/);
  assert.match(editor, /item\.sku \|\| !isSkuDraftEmpty/);
  assert.match(editor, /error instanceof ProductSkuWriteError/);
  assert.match(editor, /sku: savedSku/);
  assert.match(page, /skuManagerRef\.current\?\.validate\(\)/);
  assert.match(page, /await saveSkus\(savedProduct\)/);
  assert.match(page, /saveSkus \? basePayload : updatePayload/);
  assert.match(page, /skuEditsDirty \|\| isProductDirty/);
});
test("all SKU write routes derive product summary server-side without migrations or new RPC", () => {
  for (const name of ["app/api/admin/products/[id]/skus/route.ts", "app/api/admin/products/[id]/skus/[skuId]/route.ts"]) {
    const route = file(name);
    assert.match(route, /requireCatalogAdmin/);
    assert.match(route, /auditCatalogAction/);
    assert.match(route, /await syncSkuProductSummary\(service, params\.id\)/);
    assert.doesNotMatch(route, /\.rpc\(/);
  }
  const summary = file("lib/products/sku-summary.ts");
  assert.match(summary, /\.range\(offset, offset \+ 499\)/);
  assert.match(summary, /deriveSkuProductSummary/);
  assert.match(summary, /stock: summary\.stock/);
});
test("inline supplier sheet and binding refresh preserve unsaved fields and authoritative stock", () => {
  const page = file("app/admin/products/page.tsx");
  const editor = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(page, /<AdminSupplierBindingSheet/);
  assert.match(editor, /onSupplierBinding\(product, row\.sku!/);
  assert.match(editor, /保存后绑定/);
  assert.match(editor, /String\(sku\.stock\)/);
  assert.match(editor, /previous\.draft\.touched/);
  assert.doesNotMatch(editor, /\.purchase\(/);
});
test("checkout action failures toast while load errors and retained order state remain", () => {
  const checkout = file("app/checkout/page.tsx");
  const submit = checkout.slice(checkout.indexOf("const handleSubmit = async"), checkout.indexOf("  return (", checkout.indexOf("const handleSubmit = async")));
  assert.doesNotMatch(submit, /setError\(/);
  assert.match(submit, /toast\.error\(unavailableMessage/);
  assert.match(submit, /toast\.warning\("请选择 SKU"\)/);
  assert.match(submit, /setBalanceDialogOpen\(true\)/);
  assert.match(checkout, /setError\(getErrorText\(loadError/);
  const feedback = checkout.slice(checkout.indexOf('<div id="checkout-submit-feedback"'), checkout.indexOf('<div className="border-t border-border pt-4">', checkout.indexOf('<div id="checkout-submit-feedback"')));
  assert.match(feedback, /pendingBalanceOrder/);
  assert.doesNotMatch(feedback, /\{error \?/);
});
test("customer support uses Radix dialog and unchanged settings contacts without fixed invented data", () => {
  const layout = file("components/layout/PublicLayout.tsx");
  assert.match(layout, /settings\.support_contact\.trim\(\) \|\| settings\.support_email\.trim\(\)/);
  assert.match(layout, /supportContact\.split/);
  assert.match(layout, /<Dialog open=\{supportOpen\} onOpenChange=\{setSupportOpen\}/);
  assert.match(layout, /<DialogTitle>在线客服/);
  assert.match(layout, /max-w-\[460px\]/);
  assert.match(layout, /shadow-none/);
  assert.match(layout, /onCloseAutoFocus/);
  assert.match(layout, /rel="noopener noreferrer"/);
  assert.doesNotMatch(layout, /popover: "auto"|shadow-xl/);
  for (const name of ["components/layout/PublicSidebar.tsx", "components/layout/MobileMenu.tsx"]) assert.match(file(name), /onSupportOpen/);
});
test("operation errors use existing toast and leave page load states intact", () => {
  for (const [name, message] of [
    ["components/admin/suppliers/AdminSupplierBindingSheet.tsx", "供应商绑定保存失败"],
    ["components/admin/system/DataConsistencyClient.tsx", "数据巡检执行失败"],
    ["components/admin/EmailDeliveryActions.tsx", "toast.error"],
    ["components/account/AccountRechargeContent.tsx", "链上交易核验失败"],
    ["app/payment/page.tsx", "链上交易校验失败"],
  ]) {
    const source = file(name);
    assert.ok(source.includes(message));
    assert.match(source, /toast\.error/);
    assert.doesNotMatch(source, /window\.alert\(|\balert\(/);
  }
  assert.match(file("components/admin/system/DataConsistencyClient.tsx"), /setError\(err instanceof Error \? err\.message : "数据巡检记录读取失败"\)/);
  const root = file("app/layout.tsx");
  assert.match(root, /<Toaster/);
  assert.doesNotMatch(file("components/layout/PublicLayout.tsx"), /<Toaster/);
});
