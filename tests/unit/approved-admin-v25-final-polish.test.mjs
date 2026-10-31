import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const route = source('../../app/api/admin/dashboard/products/route.ts');
const productUi = source('../../components/admin/dashboard/DashboardProductData.tsx');
const dashboard = source('../../app/admin/page.tsx');
const dashboardCss = source('../../app/admin/dashboard-v21.css');
const dialog = source('../../components/admin/dashboard/DashboardDialog.tsx');

test('product API only accepts the 10-row preview and 15-row dialog page sizes', () => {
  assert.match(route, /const pageSize = Number\(params\.get\("pageSize"\)/);
  assert.match(route, /!\[10, 15\]\.includes\(pageSize\)/);
  assert.match(route, /\.rpc\("admin_product_dashboard_v25_snapshot"/);
  assert.match(route, /validPayload\(result\.data, page, pageSize, productId, range\.from, dayCount\)/);
  assert.match(productUi, /useProductRows\(listRange, page, search, sort, "", listOpen, 15\)/);
  assert.match(productUi, /rows=\{home\.data\.rows\.slice\(0, 10\)\}/);
  assert.match(productUi, /page \* 15 >= list\.data\.total/);
});

test('record previews reserve five rows and dashboard spacing remains consistent', () => {
  assert.match(dashboard, /dashboard-record-content/);
  assert.match(dashboard, /dashboard-record-empty/);
  assert.match(dashboardCss, /dashboard-record-content \{ min-height: 252px/);
  assert.match(dashboardCss, /dashboard-record-table tbody tr \{ height: 43px/);
  assert.match(dashboardCss, /dashboard-product-table tbody tr \{ height: 48px/);
  assert.match(dashboard, /className="mt-1 text-xs leading-5 text-slate-600">区间发起会话的当前状态/);
});

test('unverified user and product trend metrics are visible but cannot masquerade as data', () => {
  assert.match(dashboard, /label: "新增用户", reason: "管理员只读统计接口尚未提供权威每日新增用户序列"/);
  assert.match(dashboard, /label: "总用户", reason: "当前总用户为实时快照，尚无历史每日用户总量"/);
  assert.match(productUi, /aria-label="商品趋势指标"/);
  assert.match(productUi, /成交金额 · 待核对/);
  assert.match(productUi, /aria-disabled="true"/);
  assert.match(productUi, /dashboard-glass-action/);
  assert.doesNotMatch(productUi, /line\("amountCny"\)/);
});

test('product glass treatment is opt-in and does not alter other dialogs', () => {
  assert.match(productUi, /import \{ DialogContent \} from "\.\/DashboardDialog"/);
  assert.doesNotMatch(source('../../components/ui/dialog.tsx'), /dashboard-glass/);
  assert.match(dialog, /overlayClassName\?: string/);
  assert.match(dialog, /<DialogOverlay className=\{overlayClassName\}/);
  assert.match(productUi, /overlayClassName="dashboard-glass-overlay"/);
  assert.match(dashboardCss, /\.dashboard-product-dialog \{ border: 1px solid rgba\(255,255,255,\.9\)/);
  assert.match(dashboardCss, /\.dashboard-product-table-head \{ background: linear-gradient/);
});

test('all eight numeric headers show sort affordance, but unavailable data remains unsortable', () => {
  assert.match(productUi, /\["曝光量", "点击量", "点击率", "下单率", "付款率"\]\.map\(\(label\) => sortHeader\(label, null/);
  assert.match(productUi, /sortHeader\("成交金额", null/);
  assert.match(productUi, /sortHeader\("成交订单", "paidOrders"\)/);
  assert.match(productUi, /sortHeader\("销量", "units"\)/);
  assert.match(productUi, /排序不可用/);
  assert.doesNotMatch(route, /"(?:impressions|clicks|clickRate|orderRate|paymentRate|amountCny)_(?:asc|desc)"/);
});

test('dashboard removes English section labels and caps product, order, recharge previews at five', () => {
  assert.doesNotMatch(dashboard, /className="dashboard-kicker"/);
  assert.match(dashboard, /group\.rows\.slice\(0, 5\)/);
  assert.match(dashboard, /recentOrders: latestOrders \?\? \[\]/);
  assert.match(dashboard, /recentRecharges: latestRecharges \?\? \[\]/);
  assert.match(dashboard, /\.limit\(5\)/);
  assert.match(dashboard, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  assert.match(dashboard, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(dashboard, /toast\.success\(`\$\{label\}已复制`\)/);
});
