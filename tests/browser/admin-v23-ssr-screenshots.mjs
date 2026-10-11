// Browser-rendered presentation evidence only. The source is actual dashboard JSX
// rendered with explicit synthetic fixtures; there is no login, API or database.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderDashboard } from '../helpers/admin-dashboard-ui-harness.mjs';
import { loadDashboardUi } from '../helpers/admin-dashboard-ui-harness.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, process.env.DASHBOARD_SCREENSHOT_OUTPUT || 'artifacts/v23-browser');
mkdirSync(output, { recursive: true });
const css = readdirSync(resolve(root, '.next/static/css'))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(resolve(root, '.next/static/css', name), 'utf8')).join('\n');
const html = `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html,body{margin:0;min-height:100%;}body{background:#f9f7f8}</style></head><body><div data-admin-shell style="min-height:100vh"><div id="preview"><div style="padding:8px 16px;font:13px system-ui;color:#7c2d12;background:#fff7ed">合成数据 · 仅浏览器布局预览，非真实管理员会话</div>${renderDashboard()}</div></div></body></html>`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
for (const width of [390, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: resolve(output, `dashboard-${width}-top.png`) });
  await page.screenshot({ path: resolve(output, `dashboard-${width}-full.png`), fullPage: true });
  if (width === 1440) await page.locator('.dashboard-system-card').screenshot({ path: resolve(output, 'system-status-1440.png') });
  await page.locator('.dashboard-secondary-kpis').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await page.locator('.dashboard-secondary-kpis').screenshot({ path: resolve(output, `metric-strip-scrolled-${width}.png`) });
  if (width === 1440) {
    await page.locator('.dashboard-channel-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.locator('.dashboard-channel-panel').screenshot({ path: resolve(output, 'channels-scrolled-1440.png') });
  }
  results.push(await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    kpis: document.querySelectorAll('.dashboard-primary-kpis > *').length,
    channels: document.querySelectorAll('.dashboard-channel-list > *').length,
    metricStripScrollable: (() => { const el = document.querySelector('.dashboard-secondary-kpis'); return !!el && el.scrollWidth > el.clientWidth; })(),
    channelScrollable: (() => { const el = document.querySelector('.dashboard-channel-list'); return !!el && el.scrollHeight > el.clientHeight; })(),
  })));
  await page.close();
}
const baseline = resolve(root, 'artifacts/v23-browser/dashboard-1440-top.png');
if (process.env.DASHBOARD_SCREENSHOT_OUTPUT && output !== resolve(root, 'artifacts/v23-browser')) {
  const before = readFileSync(baseline).toString('base64');
  const after = readFileSync(resolve(output, 'dashboard-1440-top.png')).toString('base64');
  const comparePage = await browser.newPage({ viewport: { width: 1440, height: 530 }, deviceScaleFactor: 1 });
  await comparePage.setContent(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f2f4f8;font:14px system-ui;color:#24344f}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}.tile{min-width:0;padding:10px;border-radius:16px;background:white;box-shadow:0 8px 28px #24344f18}.tile strong{display:block;margin:0 0 8px}.tile img{display:block;width:100%;height:auto;border:1px solid #e6eaf1}</style><div class="pair"><div class="tile"><strong>V2.3 原版 · 浏览器合成数据截图</strong><img src="data:image/png;base64,${before}"></div><div class="tile"><strong>Premium Glass · 浏览器合成数据截图</strong><img src="data:image/png;base64,${after}"></div></div>`);
  await comparePage.screenshot({ path: resolve(output, 'v23-before-after-1440.png'), fullPage: true });
  await comparePage.close();
}
await browser.close();
const chartUi = loadDashboardUi([['payAmount', 'rechargeAmount', 'orderCount', 'views', 'visitors'], 3]);
const chartPoints = Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(index + 4).padStart(2, '0')}`,
  payAmount: index * 120, payAmountText: `${index * 120}.00`, rechargeAmount: index * 30,
  rechargeAmountText: `${index * 30}.00`, orderCount: index * 2, views: index * 100, visitors: index * 40 }));
const chartHtml = renderToStaticMarkup(React.createElement(chartUi.TrendChart, { points: chartPoints, loading: false }));
const tooltipBrowser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const tooltipPage = await tooltipBrowser.newPage({ viewport: { width: 900, height: 500 } });
await tooltipPage.setContent(`<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div class="admin-dashboard-v21" style="width:850px;padding:16px"><p>合成趋势数据 · 组件选中日期状态浏览器截图</p>${chartHtml}</div></body></html>`);
await tooltipPage.getByRole('tooltip').screenshot({ path: resolve(output, 'trend-tooltip-1440.png') });
await tooltipBrowser.close();
writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
