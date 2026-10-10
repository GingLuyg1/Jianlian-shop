import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from '../helpers/payment-session-guard-harness.mjs';
import { operationsFilters } from '../../lib/admin/operations-readonly.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import * as jsx from 'react/jsx-runtime';
import { listPagination } from '../../lib/admin/list-pagination.mjs';
const labels = loadTs('lib/admin/display-labels.ts', {});
const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');

test('business and direction labels preserve actual ledger filter enum values', () => {
  assert.equal(labels.businessTypeLabel('account_recharge'), '账户充值');
  assert.equal(labels.directionLabel('credit'), '余额增加');
  assert.equal(labels.directionLabel('debit'), '余额扣减');
  assert.deepEqual(labels.ledgerBusinessOptions.map(o => o.value), ['account_recharge','order_payment','admin_adjustment','refund','promotion','system']);
  for (const option of labels.ledgerBusinessOptions) {
    const filters = operationsFilters(new URLSearchParams({business_type: option.value, direction: 'credit'}));
    assert.equal(filters.business_type, option.value);
    assert.equal(filters.direction, 'credit');
    assert.notEqual(option.label, option.value);
  }
});
test('all supplier filter aliases and actual uppercase queue states are understandable', () => {
  for (const raw of ['pending','processing','retryable_failed','permanent_failed','completed','uncertain','needs_input','PENDING','PURCHASING','RECONCILIATION','FULFILLED','UNCERTAIN','NEEDS_INPUT']) {
    assert.match(labels.supplierStatusLabel(raw), /[\u4e00-\u9fff]/);
    assert.equal(operationsFilters(new URLSearchParams({status: raw})).status, raw);
  }
  assert.equal(labels.supplierStatusLabel('FAILED', true), '采购失败，可再次尝试');
  assert.equal(labels.supplierStatusLabel('FAILED', false), '采购失败，需要人工检查');
  assert.equal(labels.supplierStatusLabel('FAILED_VALIDATION', false), '采购失败，需要人工检查');
  assert.match(labels.supplierStatusLabel('FAILED'), /需核查/);
});
test('worker states and true/false/unknown never imply unavailable telemetry is stopped', () => {
  assert.equal(labels.workerStatusLabel('finished'), '已正常完成');
  for (const raw of ['disabled','execute_not_enabled','no_progress','partial_failure','unavailable']) assert.match(labels.workerStatusLabel(raw), /[\u4e00-\u9fff]/);
  for (const raw of [true,'yes']) assert.equal(labels.booleanLabel(raw), '是');
  for (const raw of [false,'no']) assert.equal(labels.booleanLabel(raw), '否');
  for (const raw of ['unknown',null,undefined]) assert.equal(labels.booleanLabel(raw), '暂未获取');
  assert.match(labels.workerHelpText, /不代表任务已经停止/);
});
test('unknown status/type remains diagnosable and null renders safely', () => {
  assert.equal(labels.statusLabel('new_status'), 'new_status（未识别状态）');
  assert.equal(labels.businessTypeLabel('new_type'), 'new_type（系统类型）');
  assert.equal(labels.statusLabel(null), '—');
  assert.equal(labels.supplierStatusLabel('NEW_PROVIDER_STATE'), 'NEW_PROVIDER_STATE（未识别状态）');
});
test('record dates use Beijing time while existing date filter contract stays unchanged', () => {
  assert.match(labels.beijingDateTime('2026-10-10T00:00:00.000Z'), /08:00:00.*北京时间/);
  assert.equal(labels.beijingDateTime(null), '—');
  assert.equal(labels.beijingDateTime('invalid-date'), 'invalid-date');
  assert.match(labels.operationsDateFilterHelp, /当天08:00至次日08:00/);
  assert.equal(operationsFilters(new URLSearchParams('start=2026-10-10')).start, '2026-10-10T00:00:00.000Z');
});
test('workspaces render explicit raw option values and Chinese display helpers, without write controls', () => {
  const ui = source('components/admin/OperationsReadonlyWorkspace.tsx');
  assert.match(ui, /value=\{s\}/);
  assert.match(ui, /value=\{option.value\}/);
  assert.match(ui, /value="credit">余额增加/);
  assert.match(ui, /value="debit">余额扣减/);
  for (const helper of ['businessTypeLabel','directionLabel','supplierStatusLabel','workerStatusLabel','booleanLabel','operationsDateFilterHelp']) assert.ok(ui.includes(helper));
  assert.doesNotMatch(ui, /method:\s*['"](?:POST|PATCH|DELETE)|\.update\(|\.rpc\(/);
  assert.equal(labels.currencyLabel('CNY'), '人民币（CNY）');
  assert.equal(labels.currencyLabel('USDT'), 'USDT');
});
function renderWorkspace(kind, row, worker = {}) {
  const states = [{},1,0,[row],worker,1,false,''];
  let cursor=0;
  const wrap = ({children}) => createElement('div',null,children);
  const component=loadTs('components/admin/OperationsReadonlyWorkspace.tsx', {
    react: {useEffect(){},useRef: v=>({current:v}),useState:()=>[states[cursor++],()=>{}]},
    'react/jsx-runtime': jsx,
    'next/link': ({children,href})=>createElement('a',{href},children),
    '@/components/admin/AdminPageShell': ({children,title,description})=>createElement('section',null,createElement('h1',null,title),createElement('p',null,description),children),
    '@/components/admin/v2/AdminList': {AdminListSurface:wrap,AdminTableViewport:wrap,AdminListPagination:wrap},
    '@/components/ui/button': {Button:wrap}, '@/components/ui/input':{Input:props=>createElement('input',props)},
    '@/lib/admin/list-pagination.mjs': {listPagination}, '@/lib/admin/display-labels':labels,
  }).default;
  return renderToStaticMarkup(component({kind}));
}
test('actual ledger rendering translates data but retains all raw dropdown query values', () => {
  const html=renderWorkspace('ledger',{id:'synthetic',business_type:'account_recharge',direction:'credit',status:'completed',currency:'CNY'});
  assert.match(html,/账户充值/);assert.match(html,/余额增加/);assert.match(html,/已完成/);assert.match(html,/人民币（CNY）/);
  assert.match(html,/value="account_recharge"/);assert.match(html,/value="credit"/);assert.match(html,/value="debit"/);
  assert.doesNotMatch(html,/>account_recharge<|>credit<|>completed</);
});
test('actual supplier and worker rendering handle retry flags and unavailable timer without raw jargon', () => {
  const supplier=renderWorkspace('supplier-queue',{id:'synthetic',status:'FAILED',retryable:true});
  assert.match(supplier,/供应商自动采购任务/);assert.match(supplier,/采购失败，可再次尝试/);
  assert.doesNotMatch(supplier,/>FAILED<|>yes<|Provider|SKU/);
  const worker=renderWorkspace('worker',{}, {timer_enabled:'unknown',timer_active:false,heartbeat_status:'finished',heartbeat_stale:false});
  assert.match(worker,/自动任务运行状态/);assert.match(worker,/暂未获取/);assert.match(worker,/已正常完成/);
  assert.doesNotMatch(worker,/Timer|Systemd|heartbeat|invocation|Provider|>unknown</);
});
test('client pages keep use client before all imports', () => {
  for(const file of ['components/admin/payments/AdminPaymentRecordsPage.tsx','components/admin/payments/AdminReconciliationPanel.tsx','components/admin/OperationsReadonlyWorkspace.tsx']) {
    assert.match(source(file).replace(/^\uFEFF/,''), /^['"]use client['"];\s/);
  }
});
