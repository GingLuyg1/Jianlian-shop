import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Admin sidebar keeps shell width while using centered 43px navigation items", () => {
  const sidebar = file("components/admin/AdminSidebar.tsx");
  const layout = file("components/admin/AdminLayout.tsx");
  assert.match(layout, /--admin-sidebar-width:204px/);
  assert.match(layout, /--admin-main-offset:204px/);
  assert.match(sidebar, /min-h-\[43px\]/);
  assert.match(sidebar, /mx-auto flex min-h-\[43px\] w-\[calc\(100%-5px\)\]/);
  assert.match(sidebar, /mx-auto block min-h-\[43px\] w-\[calc\(100%-5px\)\]/);
});

test("category workspace reserves equal compact category panels and safe sortable product area", () => {
  const page = file("app/admin/categories/page.tsx");
  assert.match(page, /xl:grid-cols-\[260px_260px_minmax\(0,1fr\)\]/);
  assert.match(page, /title="二级分类"/);
  assert.doesNotMatch(page, /selectedRoot\.name.*二级分类/);
  assert.match(page, /sortBy: "sort_order"/);
  assert.match(page, /productCount === products\.length/);
  assert.match(page, /!productSearch\.trim\(\).*productStatus === "all"/s);
  assert.match(page, /draggable=\{canReorderProducts\}/);
  assert.match(page, /GripVertical/);
  assert.match(page, /ArrowUp.*ArrowDown/s);
  assert.match(page, /清除搜索和状态筛选后可拖拽排序/);
  assert.match(page, /reorderProducts\(selectedProductCategoryId, optimistic\)/);
  assert.match(page, /setProducts\(previous\)/);
});

test("reorder endpoint validates exact category membership, integer order, audit and cache", () => {
  const route = file("app/api/admin/catalog/products/reorder/route.ts");
  const alias = file("app/api/admin/products/reorder/route.ts");
  assert.match(alias, /export \{ POST \}/);
  assert.match(route, /requireCatalogAdmin\(requestId\)/);
  assert.match(route, /checkRateLimit\("admin_write"/);
  assert.match(route, /Number\.isSafeInteger\(item\.sortOrder\)/);
  assert.match(route, /\.eq\("category_id", categoryId\)/);
  assert.match(route, /current\.length !== items\.length/);
  assert.match(route, /CATEGORY_PRODUCT_MISMATCH/);
  assert.match(route, /action: "reorder_products"/);
  assert.match(route, /revalidateProductCache/);
  assert.doesNotMatch(route, /getSupabaseBrowserClient/);
});

test("product operations default to updated time and remove only original price UI", () => {
  const page = file("app/admin/products/page.tsx");
  const categories = file("app/admin/categories/page.tsx");
  assert.match(page, /useState<ProductSortBy>\("updated_at"\)/);
  assert.match(page, /setSortBy\("updated_at"\)/);
  assert.doesNotMatch(page, />原价</);
  assert.doesNotMatch(categories, /label="原价"/);
  assert.match(page, /original_price: preservedOriginalPrice, \.\.\.updatePayload/);
  assert.match(categories, /original_price: preservedOriginalPrice, \.\.\.updatePayload/);
  assert.match(page, /updateProduct\(editingProductId, saveSkus \? basePayload : updatePayload\)/);
  assert.match(page, /price: previewPrice, stock: previewStock, \.\.\.basePayload/);
  assert.match(categories, /updateProduct\(productForm\.id, updatePayload\)/);
  assert.match(page, /TableHeader className="sticky top-0 z-20 bg-slate-50 \[&_th\]:bg-slate-50"/);
  assert.match(page, />更新时间</);
  assert.equal((page.match(/<TableHead/g) ?? []).length > 0, true);
});

test("public catalog ordering stays stock-first with stable sort-order ties", () => {
  const route = file("app/api/catalog/products/route.ts");
  assert.match(route, /sort_order,updated_at/);
  assert.match(route, /if \(stockWeight !== 0\) return stockWeight/);
  assert.match(route, /const sortOrder = Number\(a\.sort_order/);
  assert.match(route, /Date\.parse\(b\.updated_at \?\? ""\).*Date\.parse\(a\.updated_at \?\? ""\)/);
  assert.match(route, /a\.id\.localeCompare\(b\.id\)/);
});

test("Admin transient feedback uses one top-center Sonner contract", () => {
  const layout = file("app/layout.tsx");
  const products = file("app/admin/products/page.tsx");
  const categories = file("app/admin/categories/page.tsx");
  assert.match(layout, /<Toaster richColors position="top-center" duration=\{4000\} visibleToasts=\{4\}/);
  assert.match(products, /toast\.success/);
  assert.match(categories, /toast\.success/);
  assert.doesNotMatch(products, /message \|\| error/);
  assert.doesNotMatch(categories, /\{notice \?/);
});

test("promotion and supplier display contracts are truthful and registry-driven", () => {
  const promotion = file("app/promotion/page.tsx");
  const registry = file("components/admin/suppliers/supplier-ui-registry.ts");
  const workspace = file("components/admin/suppliers/AdminSuppliersWorkspace.tsx");
  const products = file("app/admin/products/page.tsx");
  assert.match(promotion, /label="充值提佣倍率" value="暂未开放"/);
  assert.match(registry, /code: string/);
  assert.match(registry, /adminEndpoint: string/);
  assert.match(workspace, /activeSupplierCode/);
  assert.match(workspace, /supplierUiRegistry\.map/);
  assert.match(workspace, /activeSupplier\.adminEndpoint/);
  assert.match(products, /getSupplierUiDefinition\(supplier\)/);
  assert.equal((registry.match(/code: "daju"/g) ?? []).length, 1);
});

test("media upload validates before request and safely parses API failures", () => {
  const page = file("app/admin/media/page.tsx");
  const helper = file("lib/media/client-upload.mjs");
  assert.ok(page.indexOf("validateMediaFiles(selected)") < page.indexOf('fetch("/api/admin/media", { method: "POST"'));
  assert.match(page, /uploadMediaFilesInBatches/);
  assert.match(helper, /files.length > MAX_MEDIA_FILES/);
  assert.match(helper, /file.size > MAX_MEDIA_BYTES/);
  assert.match(helper, /ALLOWED_MEDIA_MIME.has\(file.type\)/);
  assert.match(helper, /nested.message/);
  assert.match(helper, /错误编号/);
});
