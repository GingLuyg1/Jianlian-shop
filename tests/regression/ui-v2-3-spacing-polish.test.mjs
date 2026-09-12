import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("checkout keeps a compact purchase column and aligns product detail surfaces", () => {
  const checkout = file("app/checkout/page.tsx");

  assert.match(checkout, /--checkout-purchase-width:clamp\(336px,calc\(24vw-4px\),368px\)/);
  assert.match(checkout, /<label className="mb-1\.5 block text-sm font-medium">\s*<span className="text-red-500">\*<\/span>联系邮箱/);
  assert.match(checkout, /<label className="mb-1\.5 block text-sm font-medium">\s*提交信息或备注/);
  assert.match(checkout, /mx-auto w-full max-w-\[1040px\]/);
  assert.equal((checkout.match(/<div className="mt-8 w-full space-y-5">/g) ?? []).length, 7);
  assert.doesNotMatch(checkout, /mt-8 max-w-(?:3xl|4xl)/);

  const paymentIndex = checkout.indexOf("支付方式");
  const submitIndex = checkout.indexOf("onClick={handleSubmit}");
  const agreementIndex = checkout.indexOf("checkout-agreement-confirmation");
  assert.ok(paymentIndex >= 0 && paymentIndex < submitIndex && submitIndex < agreementIndex);
  assert.doesNotMatch(checkout, />商品购买</);
  assert.doesNotMatch(checkout, />商品使用教程</);
  assert.doesNotMatch(checkout, /<h3[^>]*>\{"\\u8d2d\\u4e70\\u63d0\\u9192"\}/);
});

test("storefront allocates more desktop width to category and product content", () => {
  const layout = file("components/layout/PublicLayout.tsx");
  const boundary = file("components/products/CategoryContentBoundary.tsx");
  const productUi = file("components/products/product-ui.ts");
  const productDetail = file("app/products/[id]/page.tsx");

  assert.match(layout, /lg:\[--storefront-sidebar-width:192px\]/);
  assert.match(layout, /lg:\[--storefront-main-offset:192px\]/);
  assert.match(layout, /--storefront-content-padding-x:16px/);
  assert.match(boundary, /mallShellClassName/);
  assert.match(productUi, /gap-4[^"\r\n]*lg:grid-cols-\[240px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(productUi, /lg:grid-cols-\[(?:249|2[5-9]\d|[3-9]\d\d)px_/);
  assert.match(productUi, /categoryListScrollClassName =\s*\r?\n\s*"[^"]*px-1 py-1[^"]*"/);
  assert.match(productUi, /productListFiveRowsClassName =\s*\r?\n\s*"[^"]*w-full[^"]*px-1\.5 py-1 pr-2[^"]*"/);
  assert.doesNotMatch(productUi, /w-\[calc\(100%-18px\)\]/);
  assert.match(productUi, /categoryPanelInnerClassName =\s*\r?\n\s*"[^"]*to-white"/);
  assert.match(file("components/products/SupabaseMallContent.tsx"), /data-testid="storefront-secondary-categories"[\s\S]{0,160}<CardContent className="h-full min-h-0 p-3">/);
  assert.match(productUi, /productPanelContentClassName =\s*\r?\n\s*"[^"]*p-4"/);
  assert.match(productUi, /compactProductRowClassName =\s*\r?\n\s*"[^"]*px-5 py-3[^"]*"/);
  assert.match(productDetail, /lg:grid-cols-\[minmax\(0,1fr\)_386px\]/);
  assert.match(productDetail, /data-testid="product-detail-left"[\s\S]{0,180}overflow-visible px-1/);
});

test("admin sidebar density and user detail width change only layout contracts", () => {
  const sidebar = file("components/admin/AdminSidebar.tsx");
  const userDetail = file("app/admin/users/[userId]/page.tsx");

  assert.match(sidebar, /overflow-y-auto px-2 py-3/);
  assert.equal((sidebar.match(/min-h-10/g) ?? []).length, 3);
  assert.doesNotMatch(sidebar, /min-h-9/);
  assert.match(userDetail, /2xl:grid-cols-\[minmax\(0,1fr\)_280px\]/);
  assert.doesNotMatch(userDetail, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  assert.match(userDetail, /title="最近充值"/);
  assert.match(userDetail, /title="最近交付"/);
  assert.match(userDetail, /title="余额流水"/);
});
