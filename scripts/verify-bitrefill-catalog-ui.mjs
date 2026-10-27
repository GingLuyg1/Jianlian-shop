import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createMemoryMockBackend } from "./support/bitrefill-mock-store.mjs";
import { createCatalogWorkspace } from "./support/bitrefill-catalog-workspace.mjs";
import { catalogWorkspaceHtml } from "./support/bitrefill-catalog-ui.mjs";
import { catalogFixture, syntheticAftercareState } from "../tests/support/bitrefill-catalog-fixture.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = "D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025";
await mkdir(evidence, { recursive: true });
const backend = { ...createMemoryMockBackend(), scope: "bitrefill_local_workspace", synthetic: true };
const app = await createCatalogWorkspace({ backend, catalog: catalogFixture().catalog, renderHtml: (view) => catalogWorkspaceHtml(root, view) });
let browser, page;
const results = [], errors = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).origin === app.origin ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(8000); page.on("pageerror", (e) => errors.push(e.name));
  await page.goto(app.origin); await page.getByText("匹配 28 项", { exact: false }).waitFor();
  await page.getByRole("button", { name: "下一页", exact: true }).click(); await page.getByText("第 2 页").waitFor();
  assert.equal(await page.locator("article").count(), 8); results.push("catalog_pagination");
  await page.getByLabel("商品搜索").fill("Apple"); await page.getByRole("button", { name: "查询商品" }).click();
  await page.getByText("匹配 1 项", { exact: false }).waitFor();
  await page.getByRole("button", { name: "查看套餐 / 人工映射" }).click();
  const skus = await app.mapping.list(); const sku = skus.skus.find((s) => s.faceValue === "5");
  await page.getByLabel("商城 SKU", { exact: true }).selectOption(sku.id);
  await page.getByLabel("人工审核说明", { exact: true }).fill("MOCK reviewed exact product");
  await page.getByRole("checkbox", { name: "标记为人工审核（不会启用采购）" }).check();
  await page.getByRole("button", { name: "保存本地映射", exact: true }).click();
  await page.getByText("MAPPING_EXPLICIT_REVIEW_REQUIRED").waitFor(); results.push("explicit_review_gate");
  for (const name of ["已逐个核对供应商 Product ID 与商品身份", "已核对国家、面额币种和准确面值", "Apple / Amazon US 品牌和使用地区已人工确认", "确认仅保存本地配置，商业许可和真实成本仍未验证"]) await page.getByRole("checkbox", { name }).check();
  await page.getByRole("button", { name: "保存本地映射", exact: true }).click();
  await page.getByText("已保存本地版本 1", { exact: false }).waitFor();
  const state = await app.mapping.list(); assert.equal(state.mappings[0].automaticPurchaseAllowed, false); assert.equal(state.mappings[0].configuredCost, null);
  results.push("manual_mapping_missing_cost_remains_unknown");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `catalog_overflow_${width}`);
    await page.screenshot({ path: `${evidence}/catalog-${width}.png`, fullPage: true }); results.push(`catalog_layout_${width}`);
  }
  await page.getByLabel("商品搜索").fill(""); await page.getByLabel("分类", { exact: true }).selectOption("mobile_refill");
  await page.getByLabel("库存", { exact: true }).selectOption("unavailable"); await page.getByRole("button", { name: "查询商品" }).click();
  await page.getByText("匹配 12 项", { exact: false }).waitFor();
  assert.equal(await page.locator("article").count(), 12); results.push("category_stock_filters");
  await page.getByLabel("国家", { exact: true }).fill("CA"); await page.getByLabel("分类", { exact: true }).selectOption("all");
  await page.getByLabel("库存", { exact: true }).selectOption("all"); await page.getByRole("button", { name: "查询商品" }).click();
  await page.getByText("MOCK Apple CA", { exact: true }).waitFor(); results.push("country_filter");
  await page.getByLabel("国家", { exact: true }).fill("US"); await page.getByLabel("商品搜索").fill("Amazon");
  await page.getByRole("button", { name: "查询商品" }).click(); await page.getByText("MOCK Amazon US", { exact: true }).waitFor();
  await page.getByRole("button", { name: "查看套餐 / 人工映射" }).click();
  await page.getByText("新增本地 SKU 参考记录", { exact: false }).click();
  for (const [field, value] of Object.entries({ id: "mock-ui-amazon-ten", title: "MOCK Amazon ten", faceValue: "10", saleCurrency: "USD", salePrice: "12.00" })) await page.getByLabel(`本地SKU ${field}`, { exact: true }).fill(value);
  await page.getByRole("button", { name: "新增本地 SKU", exact: true }).click();
  await page.getByText("本地 SKU 参考记录已保存", { exact: false }).waitFor();
  await page.getByLabel("面额模式").selectOption("range"); await page.getByLabel("Range Value", { exact: true }).fill("10");
  await page.getByLabel("配置采购成本", { exact: true }).fill("9.80"); await page.getByLabel("成本币种", { exact: true }).fill("USD");
  await page.getByLabel("配置费用", { exact: true }).fill("0.20"); await page.getByLabel("人工审核说明", { exact: true }).fill("MOCK range review");
  await page.getByRole("button", { name: "保存本地映射", exact: true }).click();
  await page.getByText("预估利润：2.00", { exact: false }).first().waitFor();
  assert.equal((await app.mapping.list()).mappings.find((m) => m.skuId === "mock-ui-amazon-ten").rangeValue, "10");
  results.push("amazon_local_sku_range_cost_profit");
  await page.getByLabel("商品搜索").fill("not-found"); await page.getByRole("button", { name: "查询商品" }).click();
  await page.getByText("没有匹配商品", { exact: false }).waitFor(); results.push("catalog_empty");
  await page.route("**/api/admin/suppliers/bitrefill/catalog?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "MOCK_CATALOG_LOAD_ERROR" }) }));
  await page.getByRole("button", { name: "查询商品" }).click(); await page.getByRole("alert").waitFor();
  await page.unroute("**/api/admin/suppliers/bitrefill/catalog?*"); await page.getByRole("button", { name: "重试目录" }).click();
  await page.getByText("没有匹配商品", { exact: false }).waitFor(); results.push("catalog_error_retry");
  await backend.transact((s) => Object.assign(s, syntheticAftercareState()));
  await page.getByRole("link", { name: "异常待处理" }).click();
  await page.getByText("PARTIAL_FAILURE", { exact: false }).waitFor(); await page.getByText("SUPPLIER_REFUNDED", { exact: false }).waitFor();
  await page.getByLabel("人工处理说明").first().fill("MOCK admin contact only");
  await page.getByRole("button", { name: "保存人工记录（不动账）" }).first().click();
  await page.getByText("已保存本地人工处理记录", { exact: false }).waitFor();
  assert.deepEqual((await backend.read()).ledger, []); results.push("aftercare_notes_do_not_refund_or_deliver");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${evidence}/aftercare-${width}.png`, fullPage: true }); results.push(`aftercare_layout_${width}`);
  }
  await page.reload(); await page.getByText("最近人工记录：assigned", { exact: false }).waitFor(); results.push("aftercare_record_visible_after_reload");
  assert.deepEqual(errors, []); await context.close();
} catch (error) {
  await writeFile(`${evidence}/ui-failure.json`, JSON.stringify({ results, errors, type: error.name,
    text: await page?.locator("body").innerText().catch(() => "NO_PAGE") }, null, 2)); throw error;
} finally { await browser?.close(); await app.close(); }
await writeFile(`${evidence}/ui-result.json`, JSON.stringify({ passed: true, results, actualReactComponents: true,
  nextAuthVerified: false, externalNetworkBlocked: true }, null, 2));
console.log(JSON.stringify({ passed: true, results }));
