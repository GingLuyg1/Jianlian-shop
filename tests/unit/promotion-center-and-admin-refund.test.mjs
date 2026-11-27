import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("promotion center is exposed in storefront navigation, excludes trend chart, supports 4 QR posters and balance-only transfer", () => {
  const sidebar = file("components/layout/PublicSidebar.tsx");
  const mobileMenu = file("components/layout/MobileMenu.tsx");
  const promotionPage = file("app/promotion/page.tsx");
  const promotionLib = file("lib/promotion.ts");
  const posterCarousel = file("components/promotion/PromotionPosterCarousel.tsx");
  const transferRoute = file("app/api/referrals/transfer-to-balance/route.ts");

  assert.match(sidebar, /label:\s*"推广中心",\s*href:\s*"\/promotion"/);
  assert.match(mobileMenu, /label:\s*"推广中心",\s*href:\s*"\/promotion"/);

  assert.match(promotionLib, /export const PROMOTION_COMMISSION_RATE = 0\.03/);
  assert.match(promotionLib, /EXCLUDED_COMMISSION_SIM_SERVICE_CATEGORY_ID = "94319387-0291-4e58-b9fd-e25fbdfbfaf1"/);
  assert.match(promotionLib, /PROMOTION_ELIGIBLE_PRIMARY_SLUGS = new Set\(\["digital-accounts", "sim-cards"\]\)/);
  assert.match(promotionLib, /export function isCommissionEligibleCategory/);

  for (const poster of ["poster-blue.jpg", "poster-bauhaus.jpg", "poster-desk.jpg", "poster-green.jpg"]) {
    const abs = join(process.cwd(), "public", "assets", "promotion", poster);
    assert.equal(existsSync(abs), true, `Missing promotion poster asset: ${poster}`);
    assert.match(promotionLib, new RegExp(`/assets/promotion/${poster.replace(".", "\\.")}`));
  }

  assert.match(posterCarousel, /QRCodeCanvas/);
  assert.match(posterCarousel, /PROMOTION_POSTERS/);
  assert.match(posterCarousel, /toDataURL\("image\/png"\)/);

  assert.match(promotionPage, /推广中心/);
  assert.match(promotionPage, /PromotionPosterCarousel/);
  assert.match(promotionPage, /\/api\/referrals\/transfer-to-balance/);
  assert.match(promotionPage, /转入本站账户余额/);
  assert.match(promotionPage, /数字\s*\/\s*社媒账号/);
  assert.match(promotionPage, /SIM 卡服务/);
  assert.doesNotMatch(promotionPage, /推广趋势/);
  assert.doesNotMatch(promotionPage, /支付宝提现|微信提现|USDT 提现/);

  assert.match(transferRoute, /transfer_promotion_commission_to_balance/);
  assert.match(transferRoute, /checkRateLimit/);
  assert.match(transferRoute, /requestId/);
});

test("SIM card service category hides sales counts across storefront lists and checkout", () => {
  const mall = file("components/products/SupabaseMallContent.tsx");
  const allProducts = file("components/products/AllProductsContent.tsx");
  const checkout = file("app/checkout/page.tsx");

  assert.match(mall, /94319387-0291-4e58-b9fd-e25fbdfbfaf1/);
  assert.match(mall, /sim\\s\*卡服务/i);
  assert.match(allProducts, /94319387-0291-4e58-b9fd-e25fbdfbfaf1/);
  assert.match(allProducts, /sim\\s\*卡服务/i);
  assert.match(checkout, /hideProductSales/);
  assert.match(checkout, /94319387-0291-4e58-b9fd-e25fbdfbfaf1/);
});

test("customer order detail hides refund UI while admin order detail and API support super-admin direct refund to balance", () => {
  const customerOrderPage = file("app/account/orders/[orderNo]/page.tsx");
  const adminOrdersPage = file("app/admin/orders/page.tsx");
  const adminRefundApi = file("app/api/admin/orders/[orderId]/refund/route.ts");

  assert.doesNotMatch(customerOrderPage, /OrderRefundPanel/);

  assert.match(adminOrdersPage, /data-testid="admin-order-direct-refund-btn"/);
  assert.match(adminOrdersPage, /退款至客户余额/);
  assert.match(adminOrdersPage, /\/api\/admin\/orders\/\$\{order\.id\}\/refund/);
  assert.match(adminOrdersPage, /仅退还产品订单金额至客户本站账户余额/);

  assert.match(adminRefundApi, /requireApiSuperAdmin/);
  assert.match(adminRefundApi, /checkRateLimit\("admin_write"/);
  assert.match(adminRefundApi, /super_admin_direct_order_refund/);
  assert.match(adminRefundApi, /writeAdminAuditLog/);
});

test("both third-party completion and balance payment hook safe referral commission sync, and migration enforces security boundaries", () => {
  const completePayment = file("lib/payments/complete-payment-service.ts");
  const balancePayment = file("lib/orders/balance-payment-service.ts");
  const commissionService = file("lib/promotion/referral-commission-service.ts");
  const migration = file("supabase/migrations/20261127191500_promotion_center_and_admin_order_refund.sql");

  assert.match(completePayment, /syncOrderReferralCommissionSafe/);
  assert.match(balancePayment, /syncOrderReferralCommissionSafe/);
  assert.match(commissionService, /sync_referral_commission_for_order/);

  assert.match(migration, /set local lock_timeout = '5s'/i);
  assert.match(migration, /set local statement_timeout = '30s'/i);
  assert.match(migration, /create or replace function public\.sync_referral_commission_for_order/i);
  assert.match(migration, /create or replace function public\.transfer_promotion_commission_to_balance/i);
  assert.match(migration, /create or replace function public\.super_admin_direct_order_refund/i);
  assert.match(migration, /94319387-0291-4e58-b9fd-e25fbdfbfaf1/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /revoke all on function public\.sync_referral_commission_for_order/i);
  assert.match(migration, /revoke all on function public\.transfer_promotion_commission_to_balance/i);
  assert.match(migration, /revoke all on function public\.super_admin_direct_order_refund/i);
  assert.match(migration, /business_type\s*=\s*'promotion'|'promotion'/i);
  assert.match(migration, /'refund'/i);
  assert.match(migration, /set status = 'cancelled'/i);
});
