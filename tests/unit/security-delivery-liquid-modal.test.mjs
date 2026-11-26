import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("P0-1/P0-5: order-query uses exact eq email match, real client IP for Turnstile, and IP-only rate-limit key", () => {
  const querySvc = read("lib/orders/order-query-service.ts");
  assert.match(querySvc, /\.eq\("customer_email",\s*normalizedEmail\)/);
  assert.doesNotMatch(querySvc, /\.ilike\("customer_email",\s*normalizedEmail\)/);

  const queryRoute = read("app/api/order-query/route.ts");
  assert.match(queryRoute, /verifyTurnstileToken\(body\?\.turnstileToken,\s*getClientIp\(request\)\)/);

  const rateLimit = read("lib/security/rate-limit.ts");
  assert.match(rateLimit, /export function getClientIp\(/);
  assert.doesNotMatch(rateLimit, /hashRateLimitValue\(`\$\{ip\}:\$\{userAgent\}`\)/);
});

test("P0-2/P0-3/P0-4/P0-6: user order sanitization, security email code limits, v1 auth/injection fix, and catalog DoS removal", () => {
  const orderQueries = read("lib/orders/order-queries.ts");
  assert.match(orderQueries, /sanitizeOrderForUser/);
  assert.match(orderQueries, /admin_note:\s*null/);
  assert.match(orderQueries, /lower\.includes\("supplier"\)/);

  const sendCode = read("app/api/account/security/send-code/route.ts");
  assert.match(sendCode, /isGuestAccount/);
  assert.match(sendCode, /checkRateLimit\("auth_resend"/);

  const emailCodeSvc = read("lib/security/email-code-service.ts");
  assert.match(emailCodeSvc, /timingSafeEqual/);
  assert.match(emailCodeSvc, /MAX_CODE_STORE_SIZE/);
  assert.match(emailCodeSvc, /peekEmailCode/);

  const v1Order = read("app/api/v1/orders/[orderNo]/route.ts");
  assert.match(v1Order, /if \(authError \|\| !user\)/);
  assert.match(v1Order, /checkRateLimit\("order_lookup"/);

  const v1Product = read("app/api/v1/products/[identifier]/route.ts");
  assert.doesNotMatch(v1Product, /\.or\(`id\.eq\./);
  assert.match(v1Product, /in\("status",\s*\["active",\s*"sold_out"\]\)/);

  const catalogDetail = read("app/api/catalog/products/[identifier]/route.ts");
  assert.doesNotMatch(catalogDetail, /findVisibleProductSlugByCatalogApi/);
  assert.doesNotMatch(catalogDetail, /sales_boost:\s*boost/);
  assert.match(catalogDetail, /checkRateLimit\("catalog_read"/);
});

test("P1: coupon rollback RPC name, Bitrefill 429 retry throttle, preview prod block, and delivery email short link", () => {
  const ordersRoute = read("app/api/orders/route.ts");
  assert.match(ordersRoute, /cancel_unpaid_order/);
  assert.doesNotMatch(ordersRoute, /cancel_my_unpaid_order/);

  const costSync = read("lib/providers/bitrefill/cost-sync-service.ts");
  assert.match(costSync, /sleepMs\(220\)/);
  assert.match(costSync, /429\|rate\|too many/i);

  const previewLayout = read("app/preview/layout.tsx");
  assert.match(previewLayout, /NODE_ENV === "production"/);
  assert.match(previewLayout, /notFound\(\)/);

  const deliveryEmail = read("lib/email/order-delivery-email.ts");
  assert.match(deliveryEmail, /issueOrderQueryShortLink/);
  assert.match(deliveryEmail, /sendOrderDeliveryEmail/);
  assert.match(deliveryEmail, /order-query\?orderNo=/);

  const deliverySvc = read("lib/delivery/delivery-service.ts");
  assert.match(deliverySvc, /sendOrderDeliveryEmail/);

  const orderQueryPage = read("app/order-query/page.tsx");
  assert.match(orderQueryPage, /runTokenLookup/);
  assert.match(orderQueryPage, /已解锁数字交付内容/);
});

test("Liquid Glass Checkout Modal integrates cleanly with checkout page and secondary category views", () => {
  const modal = read("components/checkout/LiquidGlassCheckoutModal.tsx");
  assert.match(modal, /CheckoutModalProvider/);
  assert.match(modal, /backdropLocked/);
  assert.match(modal, /Escape/);

  const css = read("components/checkout/LiquidGlassCheckoutModal.module.css");
  assert.match(css, /backdrop-filter:\s*blur\(/);

  const checkout = read("app/checkout/page.tsx");
  assert.match(checkout, /useCheckoutModal/);
  assert.match(checkout, /onLockBackdropChange/);

  const mall = read("components/products/SupabaseMallContent.tsx");
  assert.match(mall, /LiquidGlassCheckoutModal/);

  const allProducts = read("components/products/AllProductsContent.tsx");
  assert.match(allProducts, /LiquidGlassCheckoutModal/);
});
