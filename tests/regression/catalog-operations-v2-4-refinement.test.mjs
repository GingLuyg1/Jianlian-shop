import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (path) => readFileSync(path, "utf8");
test("category changes select category order without resetting it on secondary filters", () => {
  const source = read("app/admin/products/page.tsx");
  assert.match(source, /useState<ProductSortBy>\("updated_at"\)/);
  assert.match(source, /setPrimaryFilter\(value\);[\s\S]*?setSortBy\(value === "all" \? "updated_at" : "sort_order"\)/);
  assert.match(source, /setSecondaryFilter\(value\);\s*setSortBy\(primaryFilter !== "all"/);
  for (const name of ["setProductStatusFilter", "setDeliveryFilter", "setStockFilter", "setProductSearch"]) {
    const handler = source.match(new RegExp(`${name}\\(value[^;]*;([\\s\\S]*?)\\}\\}`))?.[1];
    if (handler) assert.doesNotMatch(handler, /setSortBy/);
  }
  assert.match(read("app/api/admin/catalog/products/route.ts"), /sortedQuery\.order\("id", \{ ascending: true \}\)\.range/);
});
test("table viewport has a separate synchronized opaque rail and no nested Table wrapper", () => {
  const rail = read("components/admin/AdminSyncedHorizontalScroller.tsx");
  assert.match(rail, /new ResizeObserver/);
  assert.match(rail, /viewport\.scrollWidth/);
  assert.match(rail, /railRef\.current\.scrollLeft = viewportRef\.current\.scrollLeft/);
  assert.match(rail, /viewportRef\.current\.scrollLeft = railRef\.current\.scrollLeft/);
  assert.match(rail, /sticky bottom-0.*shrink-0.*bg-white/);
  const source = read("app/admin/products/page.tsx");
  assert.match(source, /<AdminSyncedHorizontalScroller>\s*<table/);
  assert.match(source, /sticky top-0 z-20 bg-slate-50/);
  assert.match(source, /sticky right-0 z-30/);
});
test("tutorial and FAQ prioritize actual product-specific delivery and aftersales rules", () => {
  const tutorial = read("app/tutorials/page.tsx");
  for (const text of ["购买与交付指南", "核对详情", "填写并提交", "交付后核验", "联系在线客服"]) assert.ok(tutorial.includes(text));
  const faq = read("app/faq/page.tsx");
  for (const text of ["购买前", "订单与交付", "售后与核验", "合规与安全", "不要通过公开渠道发送密码", "以商品详情页标注的售后范围和时效为准"]) assert.ok(faq.includes(text));
  for (const source of [tutorial, faq]) {
    assert.doesNotMatch(source, /24 小时|不退不换|电商拓客/);
    assert.match(source, /overflow-y-auto/);
  }
});
test("homepage carousel source is unchanged from V2.4 baseline while copy and links are updated", () => {
  const source = read("app/page.tsx");
  const carousel = (value) => value.slice(value.indexOf("const heroSlides ="), value.indexOf("export default function HomePage")).replace(/\r\n/g, "\n");
  // Exact carousel source fingerprint from baseline 48a7a3a; works in Actions'
  // shallow checkout without requiring historical Git objects or a Git binary.
  assert.equal(
    createHash("sha256").update(carousel(source)).digest("hex"),
    "82b10db70bd7f08f1cbbf702809d7d89073158c37b3d08462291e353d6876a5c",
  );
  for (const text of ["Apple ID / Steam / Gmail 等账号商品", "海外实体卡、SIM 与通信服务", "多地区 Apple ID 与成品账号", "本站仅提供合法合规的数字商品及相关服务"]) assert.ok(source.includes(text));
  const links = (value) => [...value.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links(source), [
    "/products/digital-accounts",
    "/products/ai-membership",
    "/products/gift-cards",
    "/products/sim-cards",
    "/products/sms-code",
    "/products/account-recharge",
    "/products/digital-accounts?category=apple-id",
    "/products/digital-accounts?category=steam",
    "/products/ai-membership?search=ChatGPT",
    "/products/ai-membership?search=Grok",
  ]);
});
