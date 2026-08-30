import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("desktop and mobile admin navigation use one production menu contract", () => {
  const navigation = file("components/admin/admin-navigation.ts");
  const sidebar = file("components/admin/AdminSidebar.tsx");
  const topBar = file("components/admin/AdminTopBar.tsx");

  assert.match(sidebar, /import\s*\{[\s\S]*adminNavigationItems[\s\S]*\}\s*from "\.\/admin-navigation"/);
  assert.match(topBar, /import\s*\{[\s\S]*adminNavigationItems[\s\S]*\}\s*from "\.\/admin-navigation"/);
  assert.doesNotMatch(sidebar, /const (?:adminMenuItems|productLinks)\s*=/);
  assert.doesNotMatch(topBar, /const adminMenuItems\s*=/);

  assert.doesNotMatch(navigation, /\/admin\/system\/project-status/);
  assert.match(navigation, /label: "生产看板", href: "\/admin\/system\/production-readiness"/);
  assert.match(navigation, /label: "商品列表", href: "\/admin\/products"/);
  assert.match(navigation, /label: "分类管理", href: "\/admin\/categories"/);
  assert.match(navigation, /if \(href === "\/admin"\) return pathname === href/);
  assert.match(navigation, /href === "\/admin\/categories"[\s\S]*productView === "categories"/);
  assert.match(navigation, /href === "\/admin\/products"[\s\S]*productView !== "categories"/);
  assert.match(navigation, /pathname === href \|\| pathname\.startsWith\(`\$\{href\}\/`\)/);
});
