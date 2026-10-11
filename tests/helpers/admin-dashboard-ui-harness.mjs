// Synthetic presentation-only fixtures. No auth, network or database is used.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forbidden = () => { throw new Error('UI_AUDIT_NETWORK_OR_DB_FORBIDDEN'); };

export function loadDashboardUi(initialStates, onStateChange = () => {}, analyticsState = 'loaded') {
  const cache = new Map();
  let stateIndex = 0;
  const fakeClient = { getSupabaseBrowserClient: forbidden, hasSupabaseConfig: forbidden, listProducts: forbidden };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    let text = readFileSync(file, 'utf8');
    const isDashboard = file.replaceAll('\\', '/').endsWith('app/admin/page.tsx');
    if (isDashboard) text += '\nexport { TrendChart, ChannelRow, CompactTableCard, RecentRechargesCard, buildNormalizedLine };';
    const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    const imports = name => {
      if (name.endsWith('.css')) return {};
      if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
      if (name.startsWith('@/lib/supabase/')) return fakeClient;
      if (name.endsWith('dashboard-payment-schema.mjs')) return {};
      if (name.endsWith('/use-dashboard-analytics')) return {
        clearDashboardAnalyticsCache: () => {},
        useDashboardAnalytics: () => analyticsState === 'loading'
          ? { data: null, loading: true, error: '' }
          : analyticsState === 'analytics-error'
            ? { data: null, loading: false, error: '统计结果不完整，请重试。' }
            : { data: dashboardAnalyticsFixture(), loading: false, error: '' },
      };
      if (isDashboard && name === 'react') return { ...React, useEffect: () => {}, useCallback: fn => fn, useRef: value => ({ current: value }), useState: value => {
        if (stateIndex >= initialStates.length) return [typeof value === 'function' ? value() : value, () => {}];
        const index = stateIndex++;
        return [initialStates[index], update => onStateChange(index, typeof update === 'function' ? update(initialStates[index]) : update)];
      } };
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(file), name);
        const target = [base, base + '.ts', base + '.tsx'].find(existsSync);
        if (!target) throw Error('UI_IMPORT_NOT_FOUND:' + name);
        return load(target);
      }
      return require(name);
    };
    new Function('require', 'module', 'exports', 'fetch', code)(imports, module, module.exports, forbidden);
    cache.set(file, module.exports);
    return module.exports;
  }
  return load(resolve(root, 'app/admin/page.tsx'));
}

export function dashboardFixture() {
  const trend = Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(index + 1).padStart(2, '0')}`, payAmount: index * 120, rechargeAmount: index * 30, orderCount: index * 2, views: index === 2 ? null : index * 100 }));
  const metric = (label, value, href = '/admin/orders') => ({ label, value, description: '真实数据口径保持不变', change: '昨日 100', href, trend: trend.map(p => p.payAmount) });
  const ranks = Array.from({ length: 6 }, (_, index) => ({ id: `synthetic-product-${index}`, slug: `synthetic-${index}`, name: `用于布局验收的很长商品名称 Google One Pro 十二个月订阅 ${index + 1}`, stock: index, status: 'draft', sales: 88, amount: 123456.78 }));
  return {
    trendMetrics: [
      metric('今日支付金额', '¥123,456.78', '/admin/orders?paymentStatus=paid'),
      metric('今日充值金额', '¥36,800.00', '/admin/recharges?status=paid'),
      metric('今日订单数', 1284),
      metric('今日支付成功率', '96.8%', '/admin/payments'),
      metric('今日访客数', 3862),
      metric('今日访问量', 12476),
      metric('今日新增用户', 128, '/admin/users'),
    ],
    statusMetrics: ['待处理订单', '待人工交付', '支付异常', '低库存商品', '商品总数'].map(label => metric(label, 3)),
    trend7: trend, trend30: trend,
    channels: ['alipay', 'wechat', 'binance_pay', 'usdt_trc20', 'usdt_bep20'].map((code, index) => ({ code, label: ['支付宝', '微信支付', '币安支付', 'USDT-TRC20', 'USDT-BEP20'][index], enabled: false, configured: true, initiated: 100, successful: 90, exceptions: 10, amount: 123456.78 })),
    todos: Array.from({ length: 8 }, (_, index) => ({ label: ['待处理订单', '待人工交付', '自动发货失败', '库存不足订单', '支付回调失败', '对账异常', '待处理充值', '低库存商品'][index], value: index, href: '/admin/orders' })),
    salesRank: ranks, amountRank: ranks, lowStock: ranks, soldOut: ranks, recentProducts: ranks, staleProducts: ranks,
    recentOrders: Array.from({ length: 7 }, (_, index) => ({ order_no: `JL_SYNTHETIC_VERY_LONG_IDENTIFIER_123456_${index}`, customer_email: index === 0 ? 'synthetic-long-name@example.invalid' : `synthetic-very-long-name-${index}@example.invalid`, total_amount: 18.90, payment_status: 'paid', status: 'completed', created_at: '2026-10-10T08:00:00Z' })),
    recentRecharges: Array.from({ length: 7 }, (_, index) => ({ recharge_no: `RC_SYNTHETIC_VERY_LONG_IDENTIFIER_123456_${index}`, user_email: `synthetic-very-long-name-${index}@example.invalid`, amount: 1, channel_name: '微信支付', status: 'pending', created_at: '2026-10-10T08:00:00Z' })),
    userOverview: [{ label: '总用户', value: 1200 }, { label: '今日新增', value: 128 }, { label: '本周新增', value: 364 }, { label: '有消费用户', value: 812 }, { label: '零消费用户', value: 388 }, { label: '管理员数量', value: 3 }],
    visitorStats: [{ label: '今日', visitors: 3862, views: 12476 }, { label: '本周', visitors: 14280, views: 45902 }, { label: '本月', visitors: 47560, views: 162740 }],
    systemStatuses: ['数据库读取', '支付服务配置', '支付回调运行', '充值入账事务', '订单支付事务', '自动发货服务', '支付对账运行', '审计日志运行', '最近部署版本', '服务更新时间'].map((label, index) => ({ label, value: index === 0 ? '正常' : index === 1 ? '部分配置' : '未检测' })),
  };
}

export function dashboardAnalyticsFixture() {
  const daily = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-${String(index + 4).padStart(2, '0')}`,
    revenueCny: (index * 120).toFixed(2), rechargeCny: (index * 30).toFixed(2),
    ordersCreated: index * 2, pv: index * 100, dailyUv: index * 40,
  }));
  return {
    version: 2, completeness: 'complete', timezone: 'Asia/Shanghai',
    from: '2026-10-04', to: '2026-10-10',
    summary: { revenueCny: '123456.78', rechargeCny: '36800.00', ordersCreated: 1284, ordersCreatedCurrentlyPaid: 1243, pv: 12476, uv: 3862 },
    daily,
    channelRevenueCny: [{ channel: 'alipay', amountCny: '123456.78' }],
    channels: [
      { channel: 'alipay', currency: 'CNY', initiated: 100, successful: 90, exceptions: 10, failed: 5, expired: 3, closed: 2, receivedAmount: '123456.78' },
      { channel: 'usdt_bep20', currency: 'USDT', initiated: 12, successful: 9, exceptions: 2, failed: 1, expired: 1, closed: 0, receivedAmount: '24.123456' },
    ],
  };
}

export function renderDashboard(state = 'loaded') {
  const data = state === 'loaded' || state === 'tooltip' ? dashboardFixture() : null;
  const range = { kind: '7', from: '2026-10-04', to: '2026-10-10' };
  const states = [data, state === 'loading', state === 'error' ? '控制台数据加载失败，请稍后重试。' : '', range, range, range, 0, '2026/10/10 16:00:00', { start: true, end: false }];
  const ui = loadDashboardUi(states, () => {}, state);
  return renderToStaticMarkup(ui.default());
}
