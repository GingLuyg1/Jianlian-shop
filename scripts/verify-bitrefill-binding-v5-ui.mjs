import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { createMemoryMockBackend } from "./support/bitrefill-mock-store.mjs";
import { closeMock, listenMock, readMockJson, mockJson } from "./support/bitrefill-mock-supplier.mjs";
import { catalogFixture } from "../tests/support/bitrefill-catalog-fixture.mjs";
import { initializeBindingFixture, bindingFixtureService, loadBindingRoutes, dajuDetail } from "../tests/support/bitrefill-binding-v5-fixture.mjs";
import { bindingSheetHtml } from "./support/bitrefill-binding-sheet-ui.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), directory = "D:/Jianlian/_bitrefill_unified_binding_v5_20261025";
await mkdir(directory, { recursive: true });
const backend = createMemoryMockBackend(); await initializeBindingFixture(backend);
const catalog = catalogFixture().catalog, routes = await loadBindingRoutes(bindingFixtureService(backend), catalog);
let origin;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(bindingSheetHtml(root, await backend.read())); return; }
    if (req.method === "GET" && url.pathname.endsWith("/bitrefill/catalog")) return mockJson(res, 200, url.searchParams.has("productId") ? await catalog.detail(url.searchParams.get("productId")) : await catalog.list(Object.fromEntries(url.searchParams)));
    if (req.method === "GET" && url.pathname.endsWith("/daju")) return mockJson(res, 200, url.searchParams.get("resource") === "products" ? { products: [dajuDetail] } : { product: dajuDetail });
    if (req.method === "POST" && /\/(daju|bitrefill)\/bindings\/mock-web-product$/.test(url.pathname)) {
      const supplier = url.pathname.includes("/daju/") ? "daju" : "bitrefill";
      const response = await routes[supplier].POST(new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(await readMockJson(req)) }), { params: { productId: "mock-web-product" } });
      return mockJson(res, response.status, await response.json());
    }
    mockJson(res, 404, { error: "MOCK_LOCAL_ONLY" });
  } catch { mockJson(res, 409, { error: "MOCK_READ_REJECTED" }); }
});
origin = await listenMock(server); let browser, page; const results = [], errors = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true }); const context = await browser.newContext();
  await context.route("**/*", (r) => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  page = await context.newPage(); page.setDefaultTimeout(8000); page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
  await page.goto(origin); await page.getByRole("button", { name: "编辑 mock-sku-a", exact: true }).click();
  await page.getByPlaceholder("输入 Daju 商品名称").fill("MOCK"); await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByRole("button", { name: /MOCK Daju/ }).click();
  await page.getByRole("button", { name: /MOCK variant/ }).click();
  await page.getByRole("button", { name: "保存供应商绑定", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await backend.read()).product_skus[0].metadata.supplier, "daju"); results.push("existing_daju_search_select_verify_save");
  await page.getByRole("button", { name: "编辑 mock-sku-a", exact: true }).click(); await page.getByLabel("选择供应商").selectOption("bitrefill");
  await page.getByLabel("Bitrefill 搜索", { exact: true }).fill("Apple"); await page.getByRole("button", { name: "搜索 Bitrefill", exact: true }).click();
  await page.getByRole("button", { name: /MOCK Apple US/ }).click();
  await page.getByLabel("Bitrefill Package ID", { exact: true }).selectOption("mock-apple-us<&>5"); await page.getByLabel("SKU 面值", { exact: true }).fill("5");
  await page.getByLabel("绑定配置成本", { exact: true }).fill("10.10"); await page.getByLabel("绑定成本币种", { exact: true }).fill("CNY"); await page.getByLabel("绑定费用", { exact: true }).fill("0.20");
  await page.getByText("预估利润：9.7 CNY", { exact: false }).waitFor(); await page.getByLabel("Bitrefill 审核说明").fill("MOCK exact SKU review");
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${directory}/binding-${width}.png`, fullPage: true }); results.push(`layout_${width}`); }
  await page.getByRole("button", { name: "保存 Bitrefill SKU 候选", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  const saved = (await backend.read()).product_skus[0]; assert.equal(saved.metadata.supplier, "daju"); assert.equal(saved.stock, 50); assert.equal(saved.metadata.supplier_binding_candidate.supplier_auto_purchase_enabled, false);
  results.push("bitrefill_candidate_same_sku_keeps_active_daju");
  await page.getByRole("button", { name: "编辑 mock-sku-a", exact: true }).click();
  await page.getByLabel("Bitrefill Package ID", { exact: true }).waitFor(); assert.equal(await page.getByLabel("Bitrefill Package ID", { exact: true }).inputValue(), "mock-apple-us<&>5");
  assert.equal(await page.getByLabel("绑定配置成本", { exact: true }).inputValue(), "10.10"); results.push("reopen_existing_sku_candidate");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "编辑 mock-sku-b", exact: true }).click(); await page.getByLabel("选择供应商").selectOption("bitrefill");
  await page.getByLabel("Bitrefill 搜索", { exact: true }).fill("mock-amazon-us"); await page.getByRole("button", { name: "按精确 Product ID 读取", exact: true }).click();
  await page.getByLabel("Bitrefill 面额方式").selectOption("range"); await page.getByLabel("Bitrefill Range Value").fill("10"); await page.getByLabel("SKU 面值", { exact: true }).fill("10");
  await page.getByLabel("Bitrefill 审核说明").fill("MOCK range review");
  await page.getByRole("button", { name: "保存 Bitrefill SKU 候选", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  const state = await backend.read(); assert.equal(state.product_skus[1].metadata.supplier_binding_candidate.range_value, "10"); assert.equal(state.product_skus[0].metadata.supplier_binding_candidate.supplier_product_id, "mock-apple-us");
  assert.deepEqual(state.ledger, []); assert.equal(state.frozenBindingOrders[0].product_snapshot.supplier_binding.supplier_binding_version, 7);
  results.push("second_sku_range_independent_no_frozen_order_change");
  assert.deepEqual(errors, []); await context.close();
} catch (e) { await writeFile(`${directory}/ui-failure.json`, JSON.stringify({ results, errors, type: e.name, text: await page?.locator("body").innerText().catch(() => "UNAVAILABLE") }, null, 2)); throw e; }
finally { await browser?.close(); await closeMock(server); }
await writeFile(`${directory}/ui-result.json`, JSON.stringify({ passed: true, results, externalNetworkBlocked: true, fixtureOnly: true, actualBindingSheet: true, nextAuthVerified: false }, null, 2));
console.log(JSON.stringify({ passed: true, results }));
