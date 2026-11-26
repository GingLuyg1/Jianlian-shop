import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("P0-1: guest checkout session + CF email order lookup + signup redirectTo", () => {
  const guestRoute = read("app/api/auth/guest-session/route.ts");
  assert.match(guestRoute, /is_guest:\s*true/);
  assert.match(guestRoute, /checkRateLimit\("order_create"/);

  const authScreen = read("components/auth/AuthScreen.tsx");
  assert.match(authScreen, /postSignupTarget/);
  assert.match(authScreen, /isGuestAuthUser\(data\.user\)/);

  const orderQueryService = read("lib/orders/order-query-service.ts");
  assert.match(orderQueryService, /export async function lookupGuestOrdersByEmail/);
  assert.doesNotMatch(orderQueryService, /delivery_content/);

  const orderQueryRoute = read("app/api/order-query/route.ts");
  assert.match(orderQueryRoute, /verifyTurnstileToken/);
  assert.match(orderQueryRoute, /lookupGuestOrdersByEmail/);

  const orderQueryPage = read("app/order-query/page.tsx");
  assert.match(orderQueryPage, /TurnstileWidget/);
  assert.match(orderQueryPage, /游客邮箱查单/);
  assert.match(orderQueryPage, /仅凭订单号无法查看订单/);

  const checkoutPage = read("app/checkout/page.tsx");
  assert.match(checkoutPage, /\/api\/auth\/guest-session/);
  assert.match(checkoutPage, /checkout-guest-banner/);
});

test("P0-2: recharge amount shortfall prefill, return-to-order CTA, and channel copy", () => {
  const checkoutPage = read("app/checkout/page.tsx");
  assert.match(checkoutPage, /\/products\/account-recharge\?returnTo=/);
  assert.match(checkoutPage, /&amount=\$\{encodeURIComponent\(shortfallAmount\)\}/);

  const rechargeContent = read("components/account/AccountRechargeContent.tsx");
  assert.match(rechargeContent, /选择支付方式/);
  assert.match(rechargeContent, /即时到账·无最低限额/);
  assert.match(rechargeContent, /返回继续支付原订单/);
  assert.doesNotMatch(rechargeContent, /useSearchParams/);

  const paymentPage = read("app/payment/page.tsx");
  assert.match(paymentPage, /recharge-success-return-order/);
  assert.match(paymentPage, /返回继续支付原订单/);
});

test("P0-3: standalone product detail shows total price, coupon box, guest checkout, and hides disabled channels", () => {
  const productDetail = read("app/products/[id]/page.tsx");
  assert.match(productDetail, /AVAILABLE_PAYMENT_OPTIONS/);
  assert.doesNotMatch(productDetail, /（暂未开放）/);
  assert.match(productDetail, /\/api\/coupons\/validate/);
  assert.match(productDetail, /product-detail-total-summary/);
  assert.match(productDetail, /应付总价/);
  assert.match(productDetail, /\/api\/auth\/guest-session/);
  assert.match(productDetail, /前往完整结算页/);
});

test("P0-4: tutorials page renders bottom CTA card and maps Google tutorial to Gmail", () => {
  const tutorialsPage = read("app/tutorials/page.tsx");
  assert.doesNotMatch(tutorialsPage, /tutorial-collapsed-go-buy-button/);
  assert.match(tutorialsPage, /tutorial-bottom-purchase-card/);
  assert.match(tutorialsPage, /看懂流程了？立即选购对应商品/);
  assert.match(tutorialsPage, /case "google-region":[\s\S]*\/products\/digital-accounts\?category=gmail/);
});

test("Category tree preserves full subcategory list across filters and uses sliding indicators", () => {
  const mall = read("components/products/SupabaseMallContent.tsx");
  assert.match(mall, /SecondarySlidingIndicator/);
  assert.match(mall, /SubcategorySlidingList/);
  assert.match(mall, /const cached = resolvedCategory\?\.id \? \(discoveredSubcategoriesByCategory\[resolvedCategory\.id\] \?\? \[\]\) : \[\]/);
  assert.match(mall, /for \(const item of cached\) appendUnique\(item\)/);
});

test("Orders page renamed to 订单查询, works without login, and stacks 3rd-layer detail modal", () => {
  const sidebar = read("components/layout/PublicSidebar.tsx");
  const mobileMenu = read("components/layout/MobileMenu.tsx");
  const ordersPage = read("app/account/orders/page.tsx");
  const accountShell = read("components/account/AccountShell.tsx");

  assert.match(sidebar, /label:\s*"订单查询",\s*href:\s*"\/account\/orders"/);
  assert.match(mobileMenu, /label:\s*"订单查询",\s*href:\s*"\/account\/orders"/);
  assert.match(accountShell, /if \(isOrdersPage && checking\)/);
  assert.match(ordersPage, /guest-orders-query-card/);
  assert.match(ordersPage, /guest-order-detail-modal/);
  assert.match(ordersPage, /onInteractOutside=\{\(event\) => \{\s*if \(detailModalOpen\) event\.preventDefault\(\);/);
});

test("Admin reconciliation uses dropdown action menu and PATCH manual resolution endpoint", () => {
  const panel = read("components/admin/payments/AdminReconciliationPanel.tsx");
  const route = read("app/api/admin/payments/reconciliations/[reconciliationId]/route.ts");
  assert.match(panel, /DropdownMenuTrigger/);
  assert.match(panel, /标记人工已处理/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /resolve_payment_reconciliation/);
});

test("Admin dashboard sales ranking supports explicit sorting and deterministic tie-breakers", () => {
  const dashboard = read("app/admin/page.tsx");
  assert.match(dashboard, /aria-label="排序维度"/);
  assert.match(dashboard, /productSortBy === "price"/);
  assert.match(dashboard, /a\.name\.localeCompare\(b\.name,\s*"zh-CN"\)/);
});
