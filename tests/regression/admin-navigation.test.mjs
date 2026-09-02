import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("desktop and mobile admin navigation use one production menu contract", () => {
  const navigation = file("components/admin/admin-navigation.ts");
  const navigationState = file("components/admin/admin-navigation-state.mjs");
  const sidebar = file("components/admin/AdminSidebar.tsx");
  const topBar = file("components/admin/AdminTopBar.tsx");
  const layout = file("components/admin/AdminLayout.tsx");

  assert.match(sidebar, /import\s*\{[\s\S]*adminNavigationItems[\s\S]*\}\s*from "\.\/admin-navigation"/);
  assert.match(topBar, /import\s*\{[\s\S]*adminNavigationItems[\s\S]*\}\s*from "\.\/admin-navigation"/);
  assert.doesNotMatch(sidebar, /const (?:adminMenuItems|productLinks)\s*=/);
  assert.doesNotMatch(topBar, /const adminMenuItems\s*=/);

  assert.doesNotMatch(navigation, /\/admin\/system\/project-status/);
  assert.match(navigation, /label: "生产看板", href: "\/admin\/system\/production-readiness"/);
  assert.match(navigation, /label: "商品列表", href: "\/admin\/products"/);
  assert.match(navigation, /label: "分类管理", href: "\/admin\/categories"/);
  assert.match(navigationState, /if \(href === "\/admin"\) return pathname === href/);
  assert.match(navigation, /href === "\/admin\/categories"[\s\S]*productView === "categories"/);
  assert.match(navigation, /href === "\/admin\/products"[\s\S]*productView !== "categories"/);
  assert.match(navigationState, /pathname === href \|\| pathname\.startsWith\(`\$\{href\}\/`\)/);

  assert.match(navigation, /key: "products"/);
  assert.match(navigation, /key: "system"/);
  assert.match(navigation, /routePrefixes: \["\/admin\/system"\]/);
  assert.match(sidebar, /openSection === item\.key/);
  assert.match(topBar, /openSection === item\.key/);
  assert.match(sidebar, /toggleNavigationGroup\(current, item\.key\)/);
  assert.match(topBar, /toggleNavigationGroup\(current, item\.key\)/);
  assert.doesNotMatch(sidebar, /productsOpen|setProductsOpen/);
  assert.doesNotMatch(topBar, /productsOpen|setProductsOpen/);
  assert.match(navigationState, /currentGroup === requestedGroup \? null : requestedGroup/);

  assert.match(layout, /\[--admin-sidebar-width:184px\]/);
  assert.doesNotMatch(layout, /lg:gap-4/);
  assert.match(layout, /relative hidden h-full pr-4 lg:flex/);
  assert.match(layout, /h-\[var\(--admin-header-height\)\] w-4 border-b border-slate-200 bg-white/);
  assert.match(sidebar, /w-\[var\(--admin-sidebar-width\)\]/);
  assert.match(sidebar, /h-\[var\(--admin-header-height\)\] items-center border-b/);
  assert.match(topBar, /SheetContent side="left" className="w-64 p-0"/);
});
