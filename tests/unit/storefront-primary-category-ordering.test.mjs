import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("storefront sidebar, mobile menu, and homepage sort primary catalog categories by admin sort_order", () => {
  const routes = file("lib/catalog/visible-storefront-category-routes.ts");
  const sidebar = file("components/layout/PublicSidebar.tsx");
  const mobile = file("components/layout/MobileMenu.tsx");
  const home = file("app/page.tsx");
  const adminCategories = file("app/admin/categories/page.tsx");

  assert.match(routes, /export function sortStorefrontCategoryItems/);
  assert.match(routes, /Number\(primary\.sort_order\)/);
  assert.match(sidebar, /sortStorefrontCategoryItems\(/);
  assert.match(mobile, /sortStorefrontCategoryItems\(/);
  assert.match(home, /const visibleCategoryCards = sortStorefrontCategoryItems\(/);
  assert.match(home, /for \(const card of sortStorefrontCategoryItems\(categoryCards, categoryRows\)\)/);
  assert.match(adminCategories, /invalidatePublicCategories\(\)/);
  assert.match(adminCategories, /ArrowUp/);
  assert.match(adminCategories, /ArrowDown/);
});
