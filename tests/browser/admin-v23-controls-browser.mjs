import { chromium } from 'playwright';
import esbuild from 'esbuild';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, process.env.DASHBOARD_SCREENSHOT_OUTPUT || 'artifacts/v23-browser');
mkdirSync(output, { recursive: true });
const bundlePath = resolve(output, 'synthetic-date-controls.js');
await esbuild.build({ entryPoints: [resolve(root, 'tests/browser/admin-v23-controls-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: bundlePath,
  alias: { '@': root }, loader: { '.mjs': 'js' }, logLevel: 'silent' });
const css = readdirSync(resolve(root, '.next/static/css')).filter(name => name.endsWith('.css'))
  .map(name => readFileSync(resolve(root, '.next/static/css', name), 'utf8')).join('\n');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
for (const width of [390, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', error => console.error('BROWSER_ERROR', error.message));
  await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ path: bundlePath });
  console.log('BUTTONS', width, await page.locator('button').allTextContents());
  await page.getByRole('button', { name: /经营趋势日期筛选/ }).click();
  await page.getByLabel('经营趋势开始日期').fill('2026-09-01');
  await page.getByLabel('经营趋势结束日期').fill('2026-10-01');
  await page.screenshot({ path: resolve(output, `date-picker-${width}.png`) });
  await page.getByRole('button', { name: '确认区间' }).click();
  const effective = await page.getByTestId('effective-range').textContent();
  if (effective !== '2026-09-01/2026-10-01') throw Error(`DATE_FILTER_FAILED:${width}:${effective}`);
  await page.getByRole('button', { name: /经营趋势日期筛选/ }).click();
  await page.getByLabel('经营趋势开始日期').fill('2025-01-01');
  await page.getByRole('button', { name: '确认区间' }).click();
  const error = await page.getByRole('alert').textContent();
  if (!error?.includes('365')) throw Error(`RANGE_LIMIT_FAILED:${width}:${error}`);
  await page.close();
}
await browser.close();
console.log('DATE_PICKER_BROWSER_PASS=390,768,1440; 365_DAY_ERROR_PASS=yes');
