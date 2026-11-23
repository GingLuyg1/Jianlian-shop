"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminPageShell from '@/components/admin/AdminPageShell';
import { AdminListPagination, AdminListSurface, AdminTableViewport } from '@/components/admin/v2/AdminList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listPagination } from '@/lib/admin/list-pagination.mjs';
import { businessTypeLabel, directionLabel, statusLabel, supplierStatusLabel, workerStatusLabel, booleanLabel, currencyLabel, beijingDateTime, ledgerBusinessOptions, workerHelpText, operationsDateFilterHelp } from '@/lib/admin/display-labels';

type Kind = 'worker' | 'ledger' | 'supplier-queue';
type Row = Record<string, unknown>;
type DatePresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function toIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toShortDate(iso: string) {
  return iso && iso.length >= 10 ? iso.slice(5, 10) : iso;
}

function computePresetDates(preset: Exclude<DatePresetKey, 'custom'>) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = toIsoDate(today);
  if (preset === 'today') return { start: end, end };
  if (preset === 'yesterday') {
    const y = new Date(today.getTime() - 86400000);
    const yStr = toIsoDate(y);
    return { start: yStr, end: yStr };
  }
  if (preset === '7d') {
    const d7 = new Date(today.getTime() - 6 * 86400000);
    return { start: toIsoDate(d7), end };
  }
  const d30 = new Date(today.getTime() - 29 * 86400000);
  return { start: toIsoDate(d30), end };
}
const ledgerColumns = [
  ['transaction_no','流水号'],['user_email','用户邮箱'],['business_type','业务类型'],['business_id','关联单号'],
  ['direction','方向'],['amount','金额'],['currency','币种'],['status','状态'],['balance_before','变动前余额'],['balance_after','变动后余额'],['created_at','创建时间'],
];
const queueColumns = [
  ['order_no','订单'],['order_item_id','商品项'],['supplier','供应商'],['supplier_product_id','供应商商品ID'],['supplier_sku','供应商商品规格'],
  ['request_id','采购任务号'],['provider_order_code','上游平台订单号'],['status','状态'],['retryable','是否可以再次尝试'],['attempt_count','已尝试次数'],
  ['last_error_code','失败原因代码'],['last_attempt_at','最近处理时间'],['completed_at','完成时间'],['created_at','创建时间'],['updated_at','更新时间'],
];
const workerLabels: Record<string, string> = {
  timer_enabled:'定时任务是否启用',timer_active:'定时任务是否正在运行',snapshot_observed_at:'服务器任务状态更新时间',snapshot_fresh:'服务器任务状态是否有效',
  last_invocation:'最近一次任务运行编号',heartbeat_status:'最近运行状态',heartbeat_finished_at:'最近运行完成时间',heartbeat_stale:'运行状态是否过期',
  last_successful_run:'最近成功时间',last_error_observed_at:'本次错误时间',error_count:'本次错误数',provider_queries:'本次查询支付平台次数',completed:'本次完成数',observability_note:'使用说明',
};
function value(v: unknown) { return v == null || v === '' ? '—' : typeof v === 'boolean' ? booleanLabel(v) : String(v); }
function displayValue(kind: Kind, key: string, row: Row) {
  const v = row[key];
  if (key === 'observability_note') return workerHelpText;
  if (key === 'business_type') return businessTypeLabel(v);
  if (key === 'direction') return directionLabel(v);
  if (key === 'currency') return currencyLabel(v);
  if (key === 'status') {
    if (kind === 'supplier-queue') {
      const s = String(v);
      const isOk = s === 'completed';
      const isFailed = s === 'permanent_failed' || s === 'retryable_failed';
      const isProc = s === 'processing';
      const cls = isOk
        ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200'
        : isFailed
        ? 'inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 border border-rose-200'
        : isProc
        ? 'inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200'
        : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 border border-amber-200';
      return <span className={cls}>{supplierStatusLabel(v, row.retryable)}</span>;
    }
    return statusLabel(v);
  }
  if (key === 'heartbeat_status') return workerStatusLabel(v);
  if (['timer_enabled','timer_active','snapshot_fresh','heartbeat_stale','retryable'].includes(key)) return booleanLabel(v);
  if (key.endsWith('_at') || key === 'last_successful_run') {
    if (v == null || v === '') return '—';
    const date = new Date(String(v));
    if (Number.isNaN(date.getTime())) return String(v);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  return value(v);
}

export default function OperationsReadonlyWorkspace({ kind }: { kind: Kind }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [worker, setWorker] = useState<Row | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const datePopoverRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const requestVersion = ++version.current;
    const controller = new AbortController();
    setLoading(true); setError(''); setRows([]); setWorker(null); setTotal(0);
    const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([k, v]) => !k.startsWith('_') && v !== ''));
    const params = new URLSearchParams({ ...cleanFilters, page: String(page) });
    fetch(`/api/admin/operations/${kind}?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '工作台读取失败');
        if (version.current !== requestVersion) return;
        if (kind === 'worker') setWorker(body.worker);
        else { setRows(body.rows); setTotal(body.total); }
      }).catch(e => { if (version.current === requestVersion && !controller.signal.aborted) setError(e instanceof Error ? e.message : '读取失败'); })
      .finally(() => { if (version.current === requestVersion) setLoading(false); });
    return () => { version.current++; controller.abort(); };
  }, [kind, filters, page, revision]);
  const change = (key: string, next: string) => { setFilters(old => ({ ...old, [key]: next })); setPage(1); };
  const columns = kind === 'ledger' ? ledgerColumns : queueColumns;
  const title = kind === 'worker' ? '自动任务运行状态' : kind === 'ledger' ? '全历史余额流水' : '供应商采购订单';
  const description = kind === 'ledger'
    ? '查看全部历史余额流水，不提供调账或删除。'
    : kind === 'worker'
    ? workerHelpText
    : '查看供应商自动采购任务执行进度、平台回传单号与耗时流水，数据只读受控。';
  const stats = listPagination(total, page, 50);

  const default30d = computePresetDates('30d');
  const activePreset = (filters._preset as DatePresetKey | undefined) || '30d';
  const displayStart = filters.start || default30d.start;
  const displayEnd = filters.end || default30d.end;
  const applyPreset = (preset: Exclude<DatePresetKey, 'custom'>) => {
    const range = computePresetDates(preset);
    setFilters(old => ({ ...old, _preset: preset, start: range.start, end: range.end }));
    setPage(1);
  };

  return <AdminPageShell variant="v2" title={title} description={description}
    actions={
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size={kind === 'supplier-queue' ? 'sm' : 'default'} className={kind === 'supplier-queue' ? 'h-8' : undefined} onClick={() => setRevision(v => v + 1)} disabled={loading}>刷新</Button>
      </div>
    }>
    <AdminListSurface>
      {kind !== 'worker' && <div className={kind === 'supplier-queue' ? 'flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b p-3' : 'grid shrink-0 grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4'}>
        {kind === 'supplier-queue' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="搜索" className="h-8 w-52 sm:w-60 text-xs" placeholder="订单号 / 采购任务号 / 上游平台订单号" value={filters.q ?? ''} onChange={e => change('q', e.target.value)} />
              <select aria-label="状态" className="h-8 w-36 rounded-md border bg-white px-2.5 text-xs" value={filters.status ?? ''} onChange={e => change('status', e.target.value)}>
                <option value="">全部状态</option>{['pending','processing','retryable_failed','permanent_failed','completed','uncertain','needs_input'].map(s => <option key={s} value={s}>{supplierStatusLabel(s)}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 ml-auto" role="group" aria-label="时间范围筛选">
              <div className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                {([
                  ['today', '今日'],
                  ['yesterday', '昨日'],
                  ['7d', '近 7 天'],
                  ['30d', '近 30 天'],
                ] as const).map(([key, label]) => {
                  const isSelected = activePreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      style={isSelected ? { backgroundColor: '#1d4ed8', color: '#ffffff' } : undefined}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${isSelected ? 'shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <details ref={datePopoverRef} className="relative">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50">
                  <span className="tabular-nums">{toShortDate(displayStart)} ~ {toShortDate(displayEnd)}</span>
                </summary>
                <div className="absolute right-0 top-9 z-30 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl">
                  <Input aria-label="开始日期" type="date" className="h-8 w-36 text-xs" value={displayStart} onChange={e => { setFilters(old => ({ ...old, _preset: 'custom', start: e.target.value, end: old.end || displayEnd })); setPage(1); }} />
                  <span className="text-xs text-slate-400">~</span>
                  <Input aria-label="结束日期" type="date" className="h-8 w-36 text-xs" value={displayEnd} onChange={e => { setFilters(old => ({ ...old, _preset: 'custom', start: old.start || displayStart, end: e.target.value })); setPage(1); }} />
                </div>
              </details>
            </div>
          </>
        ) : (
          <>
            <Input aria-label="搜索" placeholder="邮箱 / 用户名 / 用户ID / 流水号" value={filters.q ?? ''} onChange={e => change('q', e.target.value)} />
            <select aria-label="状态" className="min-h-11 rounded-md border px-3" value={filters.status ?? ''} onChange={e => change('status', e.target.value)}>
              <option value="">全部状态</option>{['pending','completed','failed','cancelled'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <Input aria-label="开始日期（范围见说明）" type="date" value={filters.start ?? ''} onChange={e => change('start', e.target.value)} />
            <Input aria-label="结束日期（范围见说明）" type="date" value={filters.end ?? ''} onChange={e => change('end', e.target.value)} />
          </>
        )}
        {kind === 'ledger' && <>
          <select aria-label="业务类型" className="min-h-11 rounded-md border px-3" value={filters.business_type ?? ''} onChange={e => change('business_type', e.target.value)}><option value="">全部业务类型</option>{ledgerBusinessOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select aria-label="方向" className="min-h-11 rounded-md border px-3" value={filters.direction ?? ''} onChange={e => change('direction', e.target.value)}><option value="">全部方向</option><option value="credit">余额增加</option><option value="debit">余额扣减</option></select>
          <select aria-label="币种" className="min-h-11 rounded-md border px-3" value={filters.currency ?? ''} onChange={e => change('currency', e.target.value)}><option value="">全部币种</option><option value="CNY">人民币（CNY）</option><option value="USDT">USDT</option></select>
          <div className="flex gap-2"><Input aria-label="最小金额" placeholder="最小金额" value={filters.min_amount ?? ''} onChange={e => change('min_amount', e.target.value)} /><Input aria-label="最大金额" placeholder="最大金额" value={filters.max_amount ?? ''} onChange={e => change('max_amount', e.target.value)} /></div>
        </>}
        <p className="w-full text-xs text-slate-500 sm:col-span-2 lg:col-span-4">{operationsDateFilterHelp}</p>
      </div>}
      <AdminTableViewport>
        {loading ? <p role="status" className="p-6">正在读取…</p> : error ? <div role="alert" className="p-6 text-red-700">{error}<Button variant="outline" className="ml-3" onClick={() => setRevision(v => v + 1)}>重试读取</Button></div>
          : kind === 'worker' ? <dl className="grid gap-3 p-4 sm:grid-cols-2">{Object.entries(workerLabels).map(([key,label]) => <div key={key} className="min-w-0 rounded border p-3"><dt className="text-sm text-slate-500">{label}</dt><dd className="break-words">{displayValue(kind, key, worker ?? {})}</dd></div>)}</dl>
          : !rows.length ? <p role="status" className="p-6">当前筛选暂无记录。</p>
          : <table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50 text-left"><tr>{columns.map(([key,label]) => <th className="p-3" key={key}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row.id)} className="border-b">{columns.map(([key]) => <td className="max-w-64 break-words p-3" key={key}>{key === 'order_no' && row.order_id ? <Link className="text-blue-700 underline" href={`/admin/orders?search=${encodeURIComponent(String(row.order_no || row.order_id))}`}>{value(row[key])}</Link> : displayValue(kind, key, row)}</td>)}</tr>)}</tbody></table>}
      </AdminTableViewport>
      {kind !== 'worker' && <AdminListPagination page={page} totalPages={stats.totalPages} loading={loading || Boolean(error)} summary={error ? '总数未知' : `共 ${total} 条（全部历史筛选结果）`} onPrevious={() => setPage(p => Math.max(1,p-1))} onNext={() => setPage(p => p+1)} />}
    </AdminListSurface>
  </AdminPageShell>;
}
