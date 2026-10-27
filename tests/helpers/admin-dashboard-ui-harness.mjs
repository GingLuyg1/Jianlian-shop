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

export function loadDashboardUi(initialStates, onStateChange = () => {}) {
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
      if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
      if (name.startsWith('@/lib/supabase/')) return fakeClient;
      if (name.endsWith('dashboard-payment-schema.mjs')) return {};
      if (isDashboard && name === 'react') return { ...React, useEffect: () => {}, useCallback: fn => fn, useState: value => {
        if (stateIndex >= initialStates.length) return React.useState(value);
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
  const metric = (label, value) => ({ label, value, description: '真实数据口径保持不变', change: '昨日 100', href: '/admin/orders', trend: trend.map(p => p.payAmount) });
  const ranks = [{ id: 'synthetic-product', name: '用于布局验收的很长商品名称 Google One Pro 十二个月订阅', stock: 0, status: 'draft', sales: 88, amount: 123456.78 }];
  return {
    trendMetrics: ['今日支付金额', '今日充值金额', '今日订单数', '今日支付成功率', '今日访客数', '今日访问量', '今日新增用户'].map((label, index) => metric(label, index < 2 ? '¥123,456.78' : 12345)),
    statusMetrics: ['待处理订单', '待人工交付', '支付异常', '低库存商品', '商品总数'].map(label => metric(label, 3)),
    trend7: trend, trend30: trend,
    channels: ['alipay', 'wechat', 'usdt_bep20'].map((code, index) => ({ code, label: ['支付宝', '微信支付', 'USDT-BEP20'][index], enabled: false, configured: true, initiated: 100, successful: 90, exceptions: 10, amount: 123456.78 })),
    todos: Array.from({ length: 8 }, (_, index) => ({ label: ['待处理订单', '待人工交付', '自动发货失败', '库存不足订单', '支付回调失败', '对账异常', '待处理充值', '低库存商品'][index], value: index, href: '/admin/orders' })),
    salesRank: ranks, amountRank: ranks, lowStock: [], soldOut: [], recentProducts: [], staleProducts: [],
    recentOrders: [{ order_no: 'JL_SYNTHETIC_VERY_LONG_IDENTIFIER_123456', customer_email: 'synthetic-long-name@example.invalid', total_amount: 18.90, payment_status: 'paid', status: 'completed', created_at: '2026-10-10T08:00:00Z' }],
    recentRecharges: [{ recharge_no: 'RC_SYNTHETIC_123456789', user_email: 'synthetic@example.invalid', amount: 1, channel_name: '微信支付', status: 'pending', created_at: '2026-10-10T08:00:00Z' }],
    userOverview: [{ label: '总用户', value: 1200 }], visitorStats: [{ label: '今日', visitors: 100, views: 200 }],
    systemStatuses: [{ label: '数据库', value: '正常', tone: 'success' }],
  };
}

export function renderDashboard(state = 'loaded') {
  const data = state === 'loaded' ? dashboardFixture() : null;
  const ui = loadDashboardUi([data, state === 'loading', state === 'error' ? '控制台数据加载失败，请稍后重试。' : '', '7', '2026/10/10 16:00:00']);
  return renderToStaticMarkup(ui.default());
}
