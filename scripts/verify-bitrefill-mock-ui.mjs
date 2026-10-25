import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createMockShop } from "./support/bitrefill-mock-app.mjs";
import { createMemoryMockBackend } from "./support/bitrefill-mock-store.mjs";

const evidence = "D:/Jianlian/_bitrefill_mock_supplier_v2_20261025";
await mkdir(evidence, { recursive: true });
const root = fileURLToPath(new URL("../", import.meta.url));
const shop = await createMockShop({ root, backend: createMemoryMockBackend() });
let browser, activePage;
const browserErrors = [];
const results = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-mock-session": shop.capabilities["mock-admin"] } });
  // Firewall the browser context itself. No CDN, external scripts or APIs.
  await context.route("**/*", (route) => new URL(route.request().url()).origin === shop.origin ? route.continue() : route.abort());
  const page = activePage = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => browserErrors.push(`${error.name}:${error.message}`));
  await page.goto(`${shop.origin}/admin/ui`);
  await page.getByText("暂无 Bitrefill 采购记录", { exact: false }).waitFor();
  results.push("empty_state");
  const order = await shop.service.createOrder("mock-customer", "ui-partial", 2);
  shop.supplier.modes.push("delivered", "failed");
  const payment = await shop.service.rpc("pay_order_with_balance", { p_order_id: order.id, p_user_id: "mock-customer" });
  assert.equal(payment.data.paymentStatus, "paid"); await shop.dispatch(order.id);
  await page.getByRole("button", { name: "刷新记录" }).click();
  await page.getByText("冻结成本：4.80 USD", { exact: false }).first().waitFor();
  assert.equal(await page.getByText("真实成本未验证", { exact: false }).count(), 2);
  assert.equal(await page.getByRole("link", { name: "退款审核（不自动退款）" }).count(), 1);
  assert.equal((await page.locator("body").innerText()).includes("MOCK-CARD-"), false);
  await page.getByText("最近对账记录（不含卡密）").first().click();
  await page.getByText("SYNTHETIC_GET", { exact: false }).first().waitFor();
  results.push("cost_child_partial_actions_safe_events");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${evidence}/mock-admin-${width}.png`, fullPage: true });
    results.push(`no_overflow_${width}`);
  }
  await page.route("**/api/admin/suppliers/bitrefill/fulfillment?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "SYNTHETIC_READ_FAILURE" }) }));
  await page.getByRole("button", { name: "刷新记录" }).click();
  await page.getByRole("alert").waitFor();
  await page.unroute("**/api/admin/suppliers/bitrefill/fulfillment?*");
  await page.getByRole("button", { name: "重试只读查询" }).click();
  await page.getByText("冻结成本：4.80 USD", { exact: false }).first().waitFor();
  results.push("load_failure_retry");
  await shop.service.backend.transact((state) => {
    for (let n = 0; n < 24; n++) state.supplier_purchase_attempts.push({ id: `mock-ui-pagination-${n}`, supplier: "bitrefill",
      status: "UNCERTAIN", external_invoice_id: null, created_at: "2026-10-25T00:00:00Z", last_error_code: null });
  });
  await page.getByRole("button", { name: "刷新记录" }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await page.getByText("第 2 页").waitFor();
  await page.locator("article").first().waitFor(); assert.equal(await page.locator("article").count(), 1);
  results.push("pagination");
  const customer = await browser.newContext({ extraHTTPHeaders: { "x-mock-session": shop.capabilities["mock-customer"] } });
  await customer.route("**/*", (route) => new URL(route.request().url()).origin === shop.origin ? route.continue() : route.abort());
  const ownPage = await customer.newPage(); ownPage.setDefaultTimeout(8000);
  ownPage.on("pageerror", (error) => browserErrors.push(`${error.name}:${error.message}`));
  await ownPage.goto(`${shop.origin}/customer/${order.id}`);
  await ownPage.getByRole("button", { name: "显示完整内容" }).waitFor();
  assert.equal((await ownPage.locator("body").innerText()).includes("MOCK-CARD-"), false);
  await ownPage.getByRole("button", { name: "显示完整内容" }).click();
  await ownPage.getByText("MOCK-CARD-", { exact: false }).waitFor();
  await ownPage.getByRole("button", { name: "隐藏完整内容" }).click();
  assert.equal((await ownPage.locator("body").innerText()).includes("MOCK-CARD-"), false);
  results.push("existing_customer_delivery_component_mask_reveal_hide");
  await customer.close();
  assert.deepEqual(browserErrors, []);
  await context.close();
} catch (error) {
  await writeFile(`${evidence}/ui-diagnostic.json`, JSON.stringify({ stageResults: results, browserErrors,
    text: await activePage?.locator("body").innerText().catch(() => "UNAVAILABLE"), code: error.name }, null, 2));
  throw error;
} finally { await browser?.close(); await shop.close(); }
await writeFile(`${evidence}/ui-result.json`, JSON.stringify({ results, passed: true, actualComponents: true,
  fixture: "loopback_mock_not_next_auth_or_production_browser", externalNetworkBlocked: true }, null, 2));
console.log(JSON.stringify({ passed: true, results }));
