import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("shipping-info module and admin/account logistics UI contract", () => {
  const shippingInfoSource = fs.readFileSync(
    path.join(root, "lib/orders/shipping-info.ts"),
    "utf8"
  );
  assert.match(shippingInfoSource, /export const COMMON_LOGISTICS_CARRIERS/);
  assert.match(shippingInfoSource, /export function isShippingOrderRecord/);
  assert.match(shippingInfoSource, /export function parseOrderShippingInfo/);
  assert.match(shippingInfoSource, /order\?\.customer_name/);
  assert.match(shippingInfoSource, /order\?\.customer_phone/);
  assert.match(shippingInfoSource, /detail\.startsWith\(region\)/);

  const adminOrderRoute = fs.readFileSync(
    path.join(root, "app/api/admin/orders/[orderId]/route.ts"),
    "utf8"
  );
  assert.match(adminOrderRoute, /action === "ship_logistics"/);
  assert.match(adminOrderRoute, /templateCode:\s*"order_logistics_shipped"/);
  assert.match(adminOrderRoute, /admin_update_order_status/);

  const adminOrdersPage = fs.readFileSync(
    path.join(root, "app/admin/orders/page.tsx"),
    "utf8"
  );
  assert.match(adminOrdersPage, /物流收货与发货中心/);
  assert.match(adminOrdersPage, /一键复制打单信息/);
  assert.match(adminOrdersPage, /action:\s*"ship_logistics"/);
  assert.doesNotMatch(
    adminOrdersPage,
    /<InfoRow label="收货信息" value=\{order\.customer_email \|\| "—"\}/
  );

  const accountOrdersPage = fs.readFileSync(
    path.join(root, "app/account/orders/page.tsx"),
    "utf8"
  );
  assert.match(accountOrdersPage, /物流配送与快递单号/);
  assert.match(accountOrdersPage, /复制快递单号/);
});
