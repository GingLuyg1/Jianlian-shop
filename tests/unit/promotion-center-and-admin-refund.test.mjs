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
  assert.match(migration, /as \$fn\$/i);
  assert.doesNotMatch(migration, /E'\\n/);
});

test("checkout removes balance shortfall notice and hides gift card sales by product name/slug too", () => {
  const checkout = file("app/checkout/page.tsx");
  assert.doesNotMatch(checkout, /不足，已自动切换为其他可用支付方式/);
  assert.match(checkout, /gift-\?card\|recharge-\?card\|itunes/);
  assert.match(checkout, /\$\{product\.name \?\? ""\} \$\{product\.slug \?\? ""\}/);
});

test("account API page syncs with real server agent_applications, sidebar shows group & child pending badges, and dashboard adds exposure click rate left of conversion rate", () => {
  const accountApiPage = file("app/account/api/page.tsx");
  const accountApiRoute = file("app/api/account/agent-api/route.ts");
  const badgesRoute = file("app/api/admin/pending-badges/route.ts");
  const adminNav = file("components/admin/admin-navigation.ts");
  const adminSidebar = file("components/admin/AdminSidebar.tsx");
  const adminDashboard = file("app/admin/page.tsx");

  assert.match(accountApiPage, /\/api\/account\/agent-api/);
  assert.match(accountApiPage, /safeLocalStorageRemove\("jianlian_admin_api_applications"\)/);
  assert.match(accountApiRoute, /\.from\("agent_applications"\)/);
  assert.match(accountApiRoute, /\.from\("agent_ip_whitelists"\)/);

  assert.match(badgesRoute, /requireApiAdmin/);
  assert.match(badgesRoute, /agent_applications/);
  assert.match(badgesRoute, /privacy_requests/);
  assert.match(badgesRoute, /refund_requests/);

  assert.match(adminNav, /label: "隐私与导出", href: "\/admin\/privacy-requests"/);
  assert.match(adminSidebar, /\/api\/admin\/pending-badges/);
  assert.match(adminSidebar, /pendingBadges\.tickets \+ pendingBadges\.refunds/);
  assert.match(adminSidebar, /pendingBadges\.apiApplications \+ pendingBadges\.privacyRequests/);
  assert.match(adminSidebar, /href === "\/admin\/privacy-requests"/);
  assert.match(adminSidebar, /href === "\/admin\/refunds"/);

  assert.match(adminDashboard, /uniqueClickVisitorsByToken/);
  assert.match(adminDashboard, /allExposureVisitors/);
  assert.match(adminDashboard, /曝光点击率[\s\S]{0,900}点击转化率/);
  assert.match(adminDashboard, /<option value="exposureClickRate">按曝光点击率<\/option>/);
});

test("Apple ID verify-failed guide is wired into tutorials with 5 clean local assets and zero third-party branding", () => {
  const guide = file("components/account/AppleIdVerifyFailedTutorial.tsx");
  const tutorialsPage = file("app/tutorials/page.tsx");
  const css = file("components/account/TutorialsGlass.module.css");

  const expectedAssets = [
    "apple-verify-error-overview.png",
    "apple-2fa-step1-continue.png",
    "apple-2fa-step2-phone.png",
    "apple-2fa-step3-submit.png",
    "apple-2fa-step4-code.png",
  ];
  for (const name of expectedAssets) {
    assert.equal(existsSync(join(process.cwd(), "public", "assets", "tutorials", "apple-id", name)), true, `Missing asset: ${name}`);
    assert.match(guide, new RegExp(name.replace(".", "\\.")));
  }
  assert.doesNotMatch(guide, /小咔子|humkt|8gm\.co|bzncxfi3yup/i);
  assert.match(guide, /在「添加受信任电话号码」界面，先核对国家或地区区号（无需海外号）。/);
  assert.match(tutorialsPage, /AppleIdVerifyFailedTutorial/);
  assert.match(tutorialsPage, /登录验证失败解决/);
  assert.match(css, /data-guide=verify-failed/);
});

test("help center and my-account storefront pages share smooth enter/exit route transition", () => {
  const transitionMod = file("lib/motion/storefront-page-transition.ts");
  const layout = file("components/layout/PublicLayout.tsx");
  const sidebar = file("components/layout/PublicSidebar.tsx");
  const mobileMenu = file("components/layout/MobileMenu.tsx");
  const globalsCss = file("app/globals.css");

  for (const path of ["/tutorials", "/faq", "/products/account-recharge", "/promotion", "/account/orders", "/account"]) {
    assert.ok(transitionMod.includes(`"${path}"`), `Missing transition path: ${path}`);
  }
  assert.match(transitionMod, /STOREFRONT_PAGE_EXIT_DURATION_MS = 170/);
  assert.match(layout, /data-storefront-page-stage="true"/);
  assert.match(layout, /storefront-page-enter/);
  assert.match(sidebar, /startStorefrontPageExit/);
  assert.match(mobileMenu, /startStorefrontPageExit/);
  assert.match(globalsCss, /@keyframes storefront-page-enter/);
  assert.match(globalsCss, /\[data-storefront-page-stage="true"\]\[data-page-exiting="true"\]/);
});

test("dashboard trend rounds money to 2 decimals and secondary/sub categories use hover marquee for truncated text", () => {
  const trendChart = file("components/admin/dashboard/AdminTrendRechart.tsx");
  const dashboard = file("app/admin/page.tsx");
  const marquee = file("components/ui/HoverMarqueeText.tsx");
  const mall = file("components/products/SupabaseMallContent.tsx");

  assert.match(trendChart, /unit === "money"\) return `¥\$\{n\.toFixed\(2\)\}`/);
  assert.match(dashboard, /payAmount:\s*Number\(rest\.payAmount\.toFixed\(2\)\)/);
  assert.match(marquee, /export default function HoverMarqueeText/);
  assert.match(marquee, /maskImage:/);
  assert.match(mall, /HoverMarqueeText/);
  assert.match(mall, /const stockDisplay = hasStock \? rawStockDisplay : getPublicStockDisplay\(0/);
  assert.match(mall, /data-testid="products-scroll-fade-top"/);
  assert.match(mall, /data-testid="products-scroll-fade-bottom"/);
  assert.match(marquee, /autoScroll\?: boolean/);
});

test("checkout guards topup/PIN products from SIM detail mismatch, protects dark Hero contrast in modal, and upgrades ProductArtwork with 3D glow", () => {
  const checkout = file("app/checkout/page.tsx");
  const modalCss = file("components/checkout/LiquidGlassCheckoutModal.module.css");
  const globalsCss = file("app/globals.css");
  const tutorials = file("app/tutorials/page.tsx");

  assert.match(checkout, /function isTopupOrPinCardProduct/);
  assert.match(checkout, /function isTMobileProduct[\s\S]{0,160}if \(isTopupOrPinCardProduct\(product\)\) return false/);
  assert.match(checkout, /function isVodafoneSimProduct[\s\S]{0,160}if \(isTopupOrPinCardProduct\(product\)\) return false/);
  assert.match(checkout, /data-testid="product-artwork-stage"/);
  assert.match(checkout, /resolveArtworkGlowColor/);
  assert.match(modalCss, /section:not\(\[class\*="text-white"\]\):not\(\[class\*="bg-gradient-"\]\)/);
  assert.match(modalCss, /--scroll-fade-size:\s*22px/);
  assert.match(globalsCss, /@keyframes product-artwork-pop/);
  assert.match(tutorials, /scroll-fade-y/);
});
