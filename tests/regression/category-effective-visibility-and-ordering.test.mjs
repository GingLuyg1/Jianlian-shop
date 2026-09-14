import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  buildEffectiveCategoryVisibility,
  filterEffectivelyVisibleCategories,
  isProductEffectivelyVisible,
} from "../../lib/catalog/effective-category-visibility.mjs";
import { LEGACY_SKU_DEFINITIONS, planLegacySkuBackfill } from "../../lib/products/legacy-sku-backfill.mjs";

const file = (path) => readFileSync(join(process.cwd(), path), "utf8");
const categories = (rootActive, childActive) => [
  { id: "root", parent_id: null, level: 1, is_active: rootActive },
  { id: "child", parent_id: "root", level: 2, is_active: childActive },
];

test("effective visibility preserves independent category and product state across disable and re-enable", () => {
  let visibility = buildEffectiveCategoryVisibility(categories(true, true));
  assert.equal(visibility.get("root"), true);
  assert.equal(visibility.get("child"), true);
  assert.equal(isProductEffectivelyVisible({ category_id: "child", status: "active" }, visibility), true);

  visibility = buildEffectiveCategoryVisibility(categories(false, true));
  assert.equal(visibility.get("root"), false);
  assert.equal(visibility.get("child"), false);
  assert.equal(isProductEffectivelyVisible({ category_id: "child", status: "active" }, visibility), false);

  visibility = buildEffectiveCategoryVisibility(categories(true, true));
  assert.equal(visibility.get("child"), true);
  assert.equal(isProductEffectivelyVisible({ category_id: "child", status: "active" }, visibility), true);

  visibility = buildEffectiveCategoryVisibility(categories(true, false));
  assert.equal(visibility.get("child"), false);
  assert.equal(isProductEffectivelyVisible({ category_id: "child", status: "active" }, visibility), false);

  visibility = buildEffectiveCategoryVisibility(categories(false, false));
  visibility = buildEffectiveCategoryVisibility(categories(true, false));
  assert.equal(visibility.get("child"), false);
  assert.equal(isProductEffectivelyVisible({ category_id: "child", status: "active" }, visibility), false);

  visibility = buildEffectiveCategoryVisibility(categories(true, true));
  assert.equal(isProductEffectivelyVisible({ category_id: "child", status: "inactive" }, visibility), false);
});

test("storefront entry points and APIs share the effective visibility contract", () => {
  const catalog = file("lib/supabase/public-catalog.ts");
  const listRoute = file("app/api/catalog/products/route.ts");
  const detailRoute = file("app/api/catalog/products/[identifier]/route.ts");
  const sidebar = file("components/layout/PublicSidebar.tsx");
  const mobile = file("components/layout/MobileMenu.tsx");
  const home = file("app/page.tsx");
  const mall = file("components/products/SupabaseMallContent.tsx");
  assert.match(catalog, /filterEffectivelyVisibleCategories/);
  assert.match(listRoute, /buildEffectiveCategoryVisibility/);
  assert.match(listRoute, /CATEGORY_NOT_FOUND/);
  assert.match(detailRoute, /isProductEffectivelyVisible/);
  assert.match(sidebar, /visibleMenuItems\.map/);
  assert.match(mobile, /visibleMenuItems\.map/);
  assert.match(home, /visibleCategoryCards\.map/);
  assert.doesNotMatch(mall, /setError\(`未找到“\$\{fallbackTitle\}”一级分类/);
  assert.equal(filterEffectivelyVisibleCategories(categories(false, true)).length, 0);
});

test("category reorder is scoped, complete, normalized, audited and keyboard accessible", () => {
  const page = file("app/admin/categories/page.tsx");
  const route = file("app/api/admin/catalog/categories/reorder/route.ts");
  assert.match(page, /reorderCategories\(parentId, optimistic\)/);
  assert.match(page, /moveCategoryByKeyboard/);
  assert.match(page, /draggable=\{!reorderDisabled\}/);
  assert.match(page, /sort_order: \(index \+ 1\) \* 10/);
  assert.match(route, /current\.length !== items\.length/);
  assert.match(route, /sortOrder: \(index \+ 1\) \* 10/);
  assert.match(route, /\.is\("parent_id", null\)\.eq\("level", 1\)/);
  assert.match(route, /\.eq\("parent_id", parentId\)\.eq\("level", 2\)/);
  assert.match(route, /action: "reorder_categories"/);
  assert.doesNotMatch(route, /is_active.*update|status.*update/);
});

test("legacy SKU backfill is dry-run by default, idempotent and never invents stock", () => {
  assert.equal(LEGACY_SKU_DEFINITIONS["gift-apple-us"].length, 10);
  assert.equal(LEGACY_SKU_DEFINITIONS["gift-giffgaff-topup"].length, 3);
  const products = [{ id: "apple", slug: "gift-apple-us", delivery_type: "automatic" }];
  const first = planLegacySkuBackfill(products, []);
  assert.equal(first.insert.length, 10);
  assert.ok(first.insert.every((sku) => sku.stock === 0 && sku.status === "draft"));
  const existing = first.insert.map((sku, index) => ({ ...sku, id: String(index) }));
  const second = planLegacySkuBackfill(products, existing);
  assert.equal(second.insert.length, 0);
  assert.equal(second.skip.length, 10);
  assert.equal(second.conflict.length, 0);
  const script = file("scripts/backfill-legacy-product-skus.mjs");
  assert.match(script, /process\.argv\.includes\("--apply"\)/);
  assert.match(script, /if \(!apply\) process\.exit\(0\)/);
});

test("Admin category product table uses semantic column alignment and stable widths", () => {
  const page = file("app/admin/categories/page.tsx");
  assert.match(page, /grid-cols-\[72px_minmax\(220px,1fr\)_96px_80px_96px_140px_168px\]/);
  for (const heading of ["图片", "价格", "库存", "状态", "更新时间", "操作"]) {
    assert.match(page, new RegExp(`className="text-center">${heading}`));
  }
  assert.match(page, /flex justify-center gap-1 whitespace-nowrap/);
  assert.match(page, /truncate font-medium.*title=\{product\.name\}/);
});

test("Admin data tables keep semantic alignment while form fields remain left aligned", () => {
  const roots = ["app/admin", "components/admin"];
  const paymentWorkflowFiles = new Set([
    "components/admin/payments/AdminPaymentRecordsPage.tsx",
    "components/admin/payments/AdminReconciliationPanel.tsx",
  ]);
  const tableFiles = [];
  const walk = (directory) => {
    for (const entry of readdirSync(join(process.cwd(), directory), { withFileTypes: true })) {
      const relative = join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(".tsx") && /<table|<Table\b/.test(file(relative))) tableFiles.push(relative);
    }
  };
  roots.forEach(walk);
  assert.ok(tableFiles.length >= 25, `expected full Admin table audit, got ${tableFiles.length}`);

  const audited = tableFiles
    .filter((path) => !paymentWorkflowFiles.has(path.replaceAll("\\", "/")))
    .map(file)
    .join("\n");
  assert.doesNotMatch(audited, /text-right[^>]*>操作|>操作<[^\n]*text-right/);
  for (const path of [
    "app/admin/categories/page.tsx",
    "app/admin/products/page.tsx",
    "app/admin/orders/page.tsx",
    "app/admin/users/page.tsx",
    "app/admin/privacy-requests/page.tsx",
    "app/admin/risk/page.tsx",
    "app/admin/media/page.tsx",
    "app/admin/inventory/page.tsx",
    "app/admin/notifications/email-deliveries/page.tsx",
    "components/admin/suppliers/AdminSuppliersWorkspace.tsx",
  ]) {
    assert.match(file(path), /text-center/, `${path} must encode centered short/status/time/action columns`);
  }
  assert.match(file("components/admin/products/AdminProductSkuManager.tsx"), /text-left font-medium/, "editable SKU form cells stay left aligned");
});

test("global Sonner feedback is compact and centered from the single root toaster", () => {
  const sonner = file("components/ui/sonner.tsx");
  const layout = file("app/layout.tsx");
  assert.match(sonner, /!w-fit/);
  assert.match(sonner, /!max-w-\[min\(420px,calc\(100vw-32px\)\)\]/);
  assert.match(sonner, /content: 'items-center text-center'/);
  assert.equal((layout.match(/<Toaster\b/g) ?? []).length, 1);
});
