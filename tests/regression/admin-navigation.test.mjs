import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getNavigationGroupForPath,
  isAdminPathActive,
  toggleNavigationGroup,
} from "../../components/admin/admin-navigation-state.mjs";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("desktop and mobile admin navigation use one production menu contract", () => {
  const navigation = file("components/admin/admin-navigation.ts");
  const navigationState = file("components/admin/admin-navigation-state.mjs");
  const sidebar = file("components/admin/AdminSidebar.tsx");
  const topBar = file("components/admin/AdminTopBar.tsx");
  const globalSearch = file("components/admin/AdminGlobalSearch.tsx");
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

  assert.match(layout, /\[--admin-sidebar-width:204px\]/);
  assert.doesNotMatch(layout, /lg:gap-4/);
  assert.match(layout, /relative hidden h-full pr-4 lg:flex/);
  assert.match(layout, /h-\[var\(--admin-header-height\)\] w-4 border-b border-slate-200 bg-white/);
  assert.match(sidebar, /w-\[var\(--admin-sidebar-width\)\]/);
  assert.match(sidebar, /min-w-0 flex-1 whitespace-nowrap/);
  assert.match(sidebar, /ml-auto h-4 w-4 shrink-0 transition-transform/);
  assert.match(sidebar, /h-\[var\(--admin-header-height\)\] items-center border-b/);
  assert.match(topBar, /h-\[var\(--admin-header-height\)\] min-w-0 shrink-0/);
  assert.match(globalSearch, /relative min-w-0 w-full max-w-xl flex-1/);
  assert.match(topBar, /SheetContent side="left" className=\{cn\(v2Styles\.scope, "w-64 [^"]*p-0/);
});

test("Admin V2 navigation preserves exact route and one-open group behavior", () => {
  const groups = [
    { key: "products", children: [{ href: "/admin/products" }] },
    { key: "system", routePrefixes: ["/admin/system"], children: [] },
  ];

  assert.equal(isAdminPathActive("/admin/system/database", "/admin/system"), true);
  assert.equal(isAdminPathActive("/admin/systematic", "/admin/system"), false);
  assert.equal(getNavigationGroupForPath("/admin/system/database", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/systematic", groups), null);
  assert.equal(toggleNavigationGroup("products", "system"), "system");
  assert.equal(toggleNavigationGroup("system", "system"), null);
});

test("Admin V2 sidebar and topbar use scoped tokens without fake notification UI", () => {
  const sidebar = file("components/admin/AdminSidebar.tsx");
  const topBar = file("components/admin/AdminTopBar.tsx");
  const globalSearch = file("components/admin/AdminGlobalSearch.tsx");
  const layout = file("components/admin/AdminLayout.tsx");
  const tokens = file("components/admin/v2/AdminV2.module.css");
  const globals = file("app/globals.css");

  assert.match(layout, /\[--admin-header-height:62px\]/);
  assert.match(layout, /\[--admin-sidebar-width:204px\]/);
  assert.match(layout, /relative hidden h-full pr-4 lg:flex/);
  assert.match(sidebar, /w-\[var\(--admin-sidebar-width\)\]/);
  assert.match(topBar, /h-\[var\(--admin-header-height\)\]/);
  assert.match(topBar, /SheetContent side="left" className=\{cn\(v2Styles\.scope, "w-64/);
  assert.match(topBar, /open=\{mobileNavigationOpen\} onOpenChange=\{setMobileNavigationOpen\}/);
  assert.match(topBar, /onClick=\{\(\) => setMobileNavigationOpen\(false\)\}/);
  assert.match(sidebar + topBar, /aria-current=\{/);
  assert.match(sidebar + topBar, /aria-expanded=\{open\}/);
  assert.match(sidebar + topBar + globalSearch, /var\(--admin-v2-selected\)|var\(--admin-v2-surface-muted\)/);
  assert.doesNotMatch(sidebar + topBar + globalSearch, /(?:hover|active):scale-|shadow-sm/);

  assert.doesNotMatch(topBar, /<Badge|>\s*3\s*</);
  assert.match(topBar, /通知功能未接入/);
  assert.doesNotMatch(topBar, /notification(?:s|List|Menu)|通知列表|假通知/i);
  assert.doesNotMatch(topBar, /Bell[\s\S]{0,200}onClick/);

  assert.match(layout, /AdminV2\.module\.css/);
  assert.match(tokens, /^\.scope \{/m);
  assert.doesNotMatch(globals, /--admin-v2-/);
});
