import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Dashboard trend selectors are accessible, selectable, and retain one metric", () => {
  const dashboard = file("app/admin/page.tsx");

  assert.doesNotMatch(dashboard, /近 7 天真实数据走势；无可用序列时不绘制曲线。/);
  assert.doesNotMatch(dashboard, />对比昨日</);
  assert.match(dashboard, /useState<TrendMetricKey\[]>\(\["payAmount", "rechargeAmount", "orderCount", "views"\]\)/);
  assert.match(dashboard, /aria-pressed=\{selected\}/);
  assert.match(dashboard, /onClick=\{\(\) => toggleMetric\(item\.key\)\}/);
  assert.match(dashboard, /if \(current\.length === 1\) return current/);
  assert.match(dashboard, /const selectedSeries = chartSeries\.filter/);
});

test("Dashboard hover tooltip follows the selected metrics and preserves missing data", () => {
  const dashboard = file("app/admin/page.tsx");

  assert.match(dashboard, /onPointerMove=/);
  assert.match(dashboard, /onPointerLeave=\{\(\) => setActiveIndex\(null\)\}/);
  assert.match(dashboard, /strokeDasharray="3 3"/);
  assert.match(dashboard, /index === activeIndex \? "4" : "2\.5"/);
  assert.match(dashboard, /selectedSeries\.map\(\(item\) =>/);
  assert.match(dashboard, /activeIndex !== null && activeIndex >= points\.length \/ 2/);
  assert.match(dashboard, /value === null \? "—"/);
  assert.doesNotMatch(dashboard, /item\.values\[activeIndex \?\? 0\]\s*\?\?\s*0/);
  assert.doesNotMatch(dashboard, /Math\.random|mock(?:Data|Metric|Trend)/i);
});

test("Storefront shell shares responsive sidebar and main offset tokens", () => {
  const layout = file("components/layout/PublicLayout.tsx");
  const sidebar = file("components/layout/PublicSidebar.tsx");
  const mobile = file("components/layout/MobileMenu.tsx");
  const topbar = file("components/layout/PublicTopInfoBar.tsx");

  assert.match(layout, /--storefront-content-padding-x:16px/);
  assert.match(layout, /--storefront-main-offset:0px/);
  assert.match(layout, /--storefront-sidebar-width:160px/);
  assert.match(layout, /md:\[--storefront-main-offset:176px\]/);
  assert.match(layout, /md:\[--storefront-sidebar-width:176px\]/);
  assert.match(layout, /lg:\[--storefront-main-offset:192px\]/);
  assert.match(layout, /lg:\[--storefront-sidebar-width:192px\]/);
  assert.match(layout, /md:ml-\[var\(--storefront-main-offset\)\]/);
  assert.match(layout, /paddingInline: "var\(--storefront-content-padding-x\)"/);
  assert.match(sidebar, /w-\[var\(--storefront-sidebar-width\)\]/);
  assert.match(mobile, /w-\[var\(--storefront-sidebar-width,160px\)\]/);
  assert.match(topbar, /px-\[var\(--storefront-content-padding-x\)\]/);
  assert.doesNotMatch(layout + sidebar, /md:ml-\[270px\]|w-\[270px\]|translate-x-\[|pr-\[270px\]/);
});

test("Checkout purchase panel is compact and keeps the order contract intact", () => {
  const checkout = file("app/checkout/page.tsx");

  assert.match(checkout, /--checkout-purchase-width:clamp\(332px,calc\(24vw-8px\),364px\)/);
  assert.match(checkout, /lg:grid-cols-\[minmax\(0,1fr\)_var\(--checkout-purchase-width\)\]/);
  assert.match(checkout, /py-4/);
  assert.match(checkout, /lg:h-\[calc\(100dvh-62px\)\]/);
  assert.doesNotMatch(checkout, /xl:grid-cols-\[minmax\(0,1fr\)_430px\]/);
  assert.doesNotMatch(checkout, />商品购买</);
  assert.doesNotMatch(checkout, />商品使用教程</);
  assert.doesNotMatch(checkout, /<h3[^>]*>\{"\\u8d2d\\u4e70\\u63d0\\u9192"\}/);
  assert.doesNotMatch(checkout, /<ReminderItem/);

  const emailIndex = checkout.indexOf("联系邮箱");
  const noteIndex = checkout.indexOf("提交信息或备注");
  const paymentIndex = checkout.indexOf("支付方式", noteIndex);
  const agreementIndex = checkout.indexOf("checkout-agreement-confirmation");
  assert.ok(emailIndex >= 0 && emailIndex < noteIndex);
  assert.ok(noteIndex < paymentIndex);
  assert.ok(paymentIndex < agreementIndex);

  assert.match(checkout, /fetch\("\/api\/orders"/);
  assert.match(checkout, /client_request_id:/);
  assert.match(checkout, /customer_note: \[/);
  assert.match(checkout, /\r?\n\s*customerNote,\r?\n/);
  assert.match(checkout, /checked=\{confirmed\}/);
  assert.match(checkout, /onClick=\{handleSubmit\}/);
});
