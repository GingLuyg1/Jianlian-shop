// Local browser verification using actual TSX + compiled Tailwind, synthetic data only.
// Usage: node scripts/admin-dashboard-ui-visual.mjs <artifact-directory>
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import ts from 'typescript';
import { renderDashboard } from '../tests/helpers/admin-dashboard-ui-harness.mjs';
const require = createRequire(import.meta.url);
const configModule = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync('tailwind.config.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, configModule, configModule.exports);
const config = configModule.exports.default;
config.content = config.content.map(path => resolve(path));
const css = (await postcss([tailwind(config)]).process(readFileSync('app/globals.css', 'utf8'), { from: resolve('app/globals.css') })).css;
const tokens = readFileSync('components/admin/v2/AdminV2.module.css', 'utf8').replace('.scope', 'body');
const shell = readFileSync('components/admin/AdminLayout.tsx', 'utf8').match(/v2Styles.scope, "([^"]+)"/)[1];
const dashboardDocument = state => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>${css}\n${tokens}</style></head><body><div class="${shell}"><aside class="hidden h-full w-[204px] shrink-0 border-r bg-white p-4 lg:flex">后台导航（布局占位）</aside><div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><header class="h-[62px] shrink-0 border-b bg-white px-4 py-4">Jianlian 管理后台 · 合成数据验收</header><main class="flex min-h-0 flex-1 flex-col overflow-hidden">${renderDashboard(state)}</main></div></div></body></html>`;
if (!process.argv[2]) throw Error('Explicit artifact directory required');
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
    await page.route('**/*', route => route.abort());
    await page.setContent(dashboardDocument('loaded'));
    const metrics = page.locator('[aria-labelledby="dashboard-core-metrics"] > div').last();
    const scroll = page.locator('[aria-busy]');
    const result = await page.evaluate(() => {
      const scroll = document.querySelector('[aria-busy]');
      const grid = document.querySelector('[aria-labelledby="dashboard-core-metrics"]').lastElementChild;
      return { pageOverflow: document.documentElement.scrollWidth > innerWidth, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
    });
    assert.equal(result.pageOverflow, false, `Page overflow at ${width}`);
    assert.equal(result.columns, width === 390 ? 2 : width === 768 ? 4 : 7);
    assert.ok(result.scrollHeight > result.clientHeight, 'Dashboard retains its vertical scroll');
    const visibleRecords = page.locator('dl:visible');
    assert.equal(await visibleRecords.count(), width < 768 ? 2 : 0);
    assert.equal(await page.locator('table:visible').count(), width < 768 ? 0 : 2);
    const cards = page.locator('a').filter({ hasText: '今日支付金额' });
    const value = cards.locator('[title="¥123,456.78"]');
    assert.equal(await value.evaluate(el => el.scrollWidth > el.clientWidth), false, 'Large metric remains readable');
    await page.screenshot({ path: resolve(output, `dashboard-${width}-top.png`) });
    await scroll.evaluate(el => { el.scrollTop = document.querySelector('[aria-label="查看趋势日期"]').closest('.grid.shrink-0').offsetTop - el.offsetTop; });
    await page.screenshot({ path: resolve(output, `dashboard-${width}-trend.png`) });
    await scroll.evaluate(el => { const title = [...el.querySelectorAll('h3')].find(el => el.textContent === '最近订单'); el.scrollTop = title.offsetTop - el.offsetTop - 8; });
    await page.screenshot({ path: resolve(output, `dashboard-${width}-records.png`) });
    for (const [label, slug] of [['支付渠道表现', 'channels'], ['待办中心', 'todos'], ['销量排行', 'ranking']]) {
      await scroll.evaluate((el, text) => { const title = [...el.querySelectorAll('h2, h3')].find(node => node.textContent === text); if (!title) throw Error(`Missing section: ${text}`); el.scrollTop = title.offsetTop - el.offsetTop - 8; }, label);
      await page.screenshot({ path: resolve(output, `dashboard-${width}-${slug}.png`) });
    }
    // Product table uses the real shared scroller classes and the production table's minimum width.
    const scrollerSource = readFileSync('components/admin/AdminSyncedHorizontalScroller.tsx', 'utf8');
    const viewportClass = scrollerSource.match(/data-admin-table-viewport\s+className="([^"]+)"/)?.[1];
    assert.ok(viewportClass, 'Product table viewport class exists');
    await page.setContent(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>${css}\n${tokens}</style></head><body><div class="${shell}"><main class="min-w-0 flex-1 p-4"><div class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"><div data-admin-table-viewport class="${viewportClass}"><table class="w-full min-w-[1560px] table-fixed"><thead><tr><th>商品</th><th>状态</th><th>操作</th></tr></thead><tbody><tr><td>合成商品</td><td>待审核</td><td>查看</td></tr></tbody></table></div></div></main></div></body></html>`);
    const productTable = await page.locator('[data-admin-table-viewport]').evaluate(el => {
      const before = { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowX: getComputedStyle(el).overflowX };
      el.scrollLeft = 240;
      const programmaticScrollLeft = el.scrollLeft;
      el.scrollLeft = 0;
      return { ...before, programmaticScrollLeft, pageOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(productTable.scrollWidth > productTable.clientWidth, `Product table is wider than viewport at ${width}`);
    assert.ok(productTable.programmaticScrollLeft > 0, `Product table scrolls horizontally at ${width}`);
    assert.equal(productTable.pageOverflow, false, `Product table does not overflow page at ${width}`);
    const cdp = await page.context().newCDPSession(page);
    const touchX = Math.min(width - 80, 300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: 30, id: 1 }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX - step * 16, y: 30, id: 1 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    productTable.touchScrollLeft = await page.locator('[data-admin-table-viewport]').evaluate(el => el.scrollLeft);
    assert.ok(productTable.touchScrollLeft > 0, `Product table responds to touch scroll at ${width}`);
    await page.screenshot({ path: resolve(output, `product-table-${width}.png`) });
    result.productTable = productTable;
    for (const state of ['loading', 'error', 'empty']) {
      await page.setContent(dashboardDocument(state));
      const stateResult = await page.evaluate(() => ({ pageOverflow: document.documentElement.scrollWidth > innerWidth, text: document.body.innerText }));
      assert.equal(stateResult.pageOverflow, false, `${state} state has no page overflow at ${width}`);
      if (state === 'loading') assert.match(stateResult.text, /正在读取经营数据/);
      if (state === 'error') assert.match(stateResult.text, /控制台数据加载失败/);
      if (state === 'empty') assert.match(stateResult.text, /暂无/);
      await page.screenshot({ path: resolve(output, `dashboard-${width}-${state}.png`) });
    }
    results.push({ width, ...result, pass: true });
    await page.close();
  }
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ visualChecks: results, realNetworkRequests: 0, output }));
} finally { await browser.close(); }
