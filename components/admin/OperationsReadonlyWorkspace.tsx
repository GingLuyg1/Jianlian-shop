"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Check, Copy, RefreshCw } from 'lucide-react';
import AdminPageShell from '@/components/admin/AdminPageShell';
import {
  AdminDateRangeFilter,
  getPresetDateRange,
  type DashboardDateFilterValue,
} from '@/components/admin/dashboard/AdminDateRangeFilter';
import { AdminListPagination, AdminListSurface, AdminTableViewport } from '@/components/admin/v2/AdminList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listPagination } from '@/lib/admin/list-pagination.mjs';
import { businessTypeLabel, directionLabel, statusLabel, supplierStatusLabel, workerStatusLabel, booleanLabel, currencyLabel, ledgerBusinessOptions, workerHelpText, operationsDateFilterHelp } from '@/lib/admin/display-labels';

type Kind = 'worker' | 'ledger' | 'supplier-queue';
type Row = Record<string, unknown>;
const ledgerColumns = [
  ['transaction_no','流水号'],['user_email','用户邮箱'],['business_type','业务类型'],['business_id','关联单号'],
  ['direction','方向'],['amount','金额'],['currency','币种'],['status','状态'],['balance_before','变动前余额'],['balance_after','变动后余额'],['created_at','创建时间'],
];
const queueColumns = [
  ['order_no','订单号'],
  ['supplier','供应商'],
  ['supplier_product_id','上游商品 / 规格'],
  ['status','状态'],
  ['provider_order_code','上游平台订单号'],
  ['request_id','采购任务号'],
  ['attempt_count','尝试 / 重试'],
  ['last_error_code','失败原因'],
  ['created_at','创建时间'],
  ['completed_at','完成时间'],
];
const workerLabels: Record<string, string> = {
  timer_enabled:'定时任务是否启用',timer_active:'定时任务是否正在运行',snapshot_observed_at:'服务器任务状态更新时间',snapshot_fresh:'服务器任务状态是否有效',
  last_invocation:'最近一次任务运行编号',heartbeat_status:'最近运行状态',heartbeat_finished_at:'最近运行完成时间',heartbeat_stale:'运行状态是否过期',
  last_successful_run:'最近成功时间',last_error_observed_at:'本次错误时间',error_count:'本次错误数',provider_queries:'本次查询支付平台次数',completed:'本次完成数',observability_note:'使用说明',
};
const COPYABLE_QUEUE_KEYS = new Set(['order_item_id', 'request_id', 'provider_order_code', 'supplier_product_id']);
const SUPPLIER_BADGE_CLASS: Record<string, string> = {
  bitrefill: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  kuajingzy: 'bg-sky-50 text-sky-700 border-sky-200',
};

function value(v: unknown) { return v == null || v === '' ? '—' : typeof v === 'boolean' ? booleanLabel(v) : String(v); }

function formatTimestamp(v: unknown) {
  if (v == null || v === '') return '—';
  const date = new Date(String(v));
  if (Number.isNaN(date.getTime())) return String(v);
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function CopyableCodeCell({ text, maxWidthClass = 'max-w-[168px]' }: { text: string; maxWidthClass?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  const handleCopy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Ignore clipboard write rejection in non-secure / restricted contexts.
    });
  };
  return (
    <div className="group inline-flex items-center gap-1.5">
      <span
        title={text}
        className={`inline-block ${maxWidthClass} truncate rounded bg-slate-100/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700`}
      >
        {text}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? '已复制' : `复制 ${text}`}
        aria-label={`复制 ${text}`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 opacity-60 transition hover:bg-slate-200/70 hover:text-slate-700 group-hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

function displayValue(kind: Kind, key: string, row: Row) {
  const v = row[key];
  if (key === 'observability_note') return workerHelpText;
  if (key === 'business_type') return businessTypeLabel(v);
  if (key === 'direction') return directionLabel(v);
  if (key === 'currency') return currencyLabel(v);
  if (kind === 'supplier-queue') {
    if (key === 'supplier') {
      const s = String(v || '').trim();
      if (!s) return '—';
      const badgeCls = SUPPLIER_BADGE_CLASS[s.toLowerCase()] ?? 'bg-slate-100 text-slate-700 border-slate-200';
      return (
        <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`} title={s}>
          {statusLabel(s.toLowerCase())}
        </span>
      );
    }
    if (key === 'supplier_product_id') {
      const pid = String(v ?? '').trim();
      const sku = String(row.supplier_sku ?? '').trim();
      if (!pid && !sku) return <span className="text-slate-400">—</span>;
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {pid ? <CopyableCodeCell text={pid} maxWidthClass="max-w-[120px]" /> : null}
          {sku ? (
            <span className="inline-flex items-center whitespace-nowrap rounded bg-orange-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-200/80">
              {sku}
            </span>
          ) : null}
        </div>
      );
    }
    if (key === 'attempt_count') {
      const count = v == null ? 0 : Number(v);
      const retryable = row.retryable === true;
      return (
        <span className="whitespace-nowrap text-xs tabular-nums text-slate-700">
          {count} 次{retryable ? ' · 可重试' : ''}
        </span>
      );
    }
    if (COPYABLE_QUEUE_KEYS.has(key)) {
      const s = String(v ?? '').trim();
      if (!s) return <span className="text-slate-400">—</span>;
      return (
        <CopyableCodeCell
          text={s}
          maxWidthClass={key === 'provider_order_code' ? 'max-w-[200px]' : key === 'request_id' ? 'max-w-[180px]' : 'max-w-[150px]'}
        />
      );
    }
    if (key === 'retryable') {
      const isYes = Boolean(v);
      return (
        <span className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${isYes ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
          {booleanLabel(v)}
        </span>
      );
    }
    if (key === 'attempt_count') {
      return <span className="font-mono text-xs font-medium tabular-nums text-slate-700">{value(v)}</span>;
    }
    if (key === 'last_error_code') {
      const s = String(v ?? '').trim();
      if (!s) return <span className="text-slate-400">—</span>;
      return (
        <span title={s} className="inline-block max-w-[180px] truncate rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] text-rose-700">
          {s}
        </span>
      );
    }
  }
  if (key === 'status') {
    if (kind === 'supplier-queue') {
      const s = String(v || '').toUpperCase();
      const isOk = s === 'COMPLETED' || s === 'FULFILLED' || s === 'SUCCEEDED';
      const isFailed = s === 'PERMANENT_FAILED' || s === 'RETRYABLE_FAILED' || s === 'FAILED' || s === 'FAILED_VALIDATION';
      const isProc = s === 'PROCESSING' || s === 'PURCHASING' || s === 'RECONCILIATION' || s === 'SUBMITTING' || s === 'CLAIMED';
      const cls = isOk
        ? 'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200'
        : isFailed
        ? 'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200'
        : isProc
        ? 'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200'
        : 'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200';
      return <span className={cls}>{supplierStatusLabel(v, row.retryable)}</span>;
    }
    return statusLabel(v);
  }
  if (key === 'heartbeat_status') return workerStatusLabel(v);
  if (['timer_enabled','timer_active','snapshot_fresh','heartbeat_stale','retryable'].includes(key)) return booleanLabel(v);
  if (key.endsWith('_at') || key === 'last_successful_run') {
    return <span className="whitespace-nowrap font-mono text-xs tabular-nums text-slate-600">{formatTimestamp(v)}</span>;
  }
  return value(v);
}

export default function OperationsReadonlyWorkspace({ kind }: { kind: Kind }) {
  const searchParams = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';
  const urlStatus = searchParams.get('status') ?? '';
  const [filters, setFilters] = useState<Record<string, string>>(() => ({
    ...(urlQ ? { q: urlQ } : {}),
    ...(urlStatus ? { status: urlStatus } : {}),
  }));
  const [debouncedQ, setDebouncedQ] = useState(urlQ);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [worker, setWorker] = useState<Row | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const [dateRangeFilter, setDateRangeFilter] = useState<DashboardDateFilterValue>(() => getPresetDateRange('30d'));
  const [isAllDates, setIsAllDates] = useState(true);

  useEffect(() => {
    const q = searchParams.get('q');
    const status = searchParams.get('status');
    setFilters((old) => {
      const next = { ...old };
      let changed = false;
      if (q !== null && (old.q ?? '') !== q) {
        next.q = q;
        changed = true;
      }
      if (status !== null && (old.status ?? '') !== status) {
        next.status = status;
        changed = true;
      }
      return changed ? next : old;
    });
  }, [searchParams]);

  useEffect(() => {
    const nextQ = filters.q ?? '';
    const timer = window.setTimeout(() => setDebouncedQ(nextQ), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const filterKey = JSON.stringify({ ...filters, q: debouncedQ });

  useEffect(() => {
    const requestVersion = ++version.current;
    const controller = new AbortController();
    setLoading(true); setError(''); setRows([]); setWorker(null); setTotal(0);
    const effectiveFilters = { ...filters, q: debouncedQ };
    const cleanFilters = Object.fromEntries(Object.entries(effectiveFilters).filter(([k, v]) => !k.startsWith('_') && v !== ''));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, filterKey, page, revision]);
  const change = (key: string, next: string) => { setFilters(old => ({ ...old, [key]: next })); setPage(1); };
  const columns = kind === 'ledger' ? ledgerColumns : queueColumns;
  const title = kind === 'worker' ? '自动任务运行状态' : kind === 'ledger' ? '全历史余额流水' : '供应商采购订单';
  const description = kind === 'ledger'
    ? '查看全部历史余额流水，不提供调账或删除。'
    : kind === 'worker'
    ? workerHelpText
    : '查看上游供应商自动采购订单执行进度、平台回传单号与耗时流水，数据只读受控。';
  const stats = listPagination(total, page, 50);

  const handleSupplierDateChange = (next: DashboardDateFilterValue) => {
    setDateRangeFilter(next);
    setIsAllDates(false);
    setFilters(old => ({
      ...old,
      start: format(next.from, 'yyyy-MM-dd'),
      end: format(next.to, 'yyyy-MM-dd'),
    }));
    setPage(1);
  };

  const handleSelectAllDates = () => {
    setIsAllDates(true);
    setFilters(old => ({ ...old, start: '', end: '' }));
    setPage(1);
  };

  return <AdminPageShell variant="v2" title={title} description={description}
    actions={
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size={kind === 'supplier-queue' ? 'sm' : 'default'} className={kind === 'supplier-queue' ? 'h-8' : undefined} onClick={() => setRevision(v => v + 1)} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>
    }>
    <AdminListSurface>
      {kind !== 'worker' && <div className={kind === 'supplier-queue' ? 'flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b p-3' : 'grid shrink-0 grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4'}>
        {kind === 'supplier-queue' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="搜索" className="h-8 w-72 sm:w-80 text-xs" placeholder="订单号 / 采购任务号 / 上游平台订单号" value={filters.q ?? ''} onChange={e => change('q', e.target.value)} />
              <select aria-label="状态" className="h-8 w-36 rounded-md border bg-white px-2.5 text-xs" value={filters.status ?? ''} onChange={e => change('status', e.target.value)}>
                <option value="">全部状态</option>{['pending','processing','retryable_failed','permanent_failed','completed','uncertain','needs_input'].map(s => <option key={s} value={s}>{supplierStatusLabel(s)}</option>)}
              </select>
            </div>
            <div className="ml-auto">
              <AdminDateRangeFilter
                size="sm"
                allowAll
                isAllSelected={isAllDates}
                onSelectAll={handleSelectAllDates}
                value={dateRangeFilter}
                onChange={handleSupplierDateChange}
              />
            </div>
          </>
        ) : (
          <>
            <Input aria-label="搜索" placeholder="邮箱 / 用户名 / 用户ID / 流水号" value={filters.q ?? ''} onChange={e => change('q', e.target.value)} />
            <select aria-label="状态" className="min-h-11 rounded-md border px-3" value={filters.status ?? ''} onChange={e => change('status', e.target.value)}>
              <option value="">全部状态</option>{['pending','completed','failed','cancelled'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <label className="flex items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs text-slate-500">
              <span className="shrink-0">起</span>
              <input aria-label="开始日期（范围见说明）" title="开始日期" type="date" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-800 focus:outline-none" value={filters.start ?? ''} onChange={e => change('start', e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs text-slate-500">
              <span className="shrink-0">止</span>
              <input aria-label="结束日期（范围见说明）" title="结束日期" type="date" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-800 focus:outline-none" value={filters.end ?? ''} onChange={e => change('end', e.target.value)} />
            </label>
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
        {loading ? <p role="status" className="p-6 text-sm text-slate-500">正在读取…</p> : error ? <div role="alert" className="p-6 text-red-700">{error}<Button variant="outline" className="ml-3" onClick={() => setRevision(v => v + 1)}>重试读取</Button></div>
          : kind === 'worker' ? <dl className="grid gap-3 p-4 sm:grid-cols-2">{Object.entries(workerLabels).map(([key,label]) => <div key={key} className="min-w-0 rounded border p-3"><dt className="text-sm text-slate-500">{label}</dt><dd className="break-words">{displayValue(kind, key, worker ?? {})}</dd></div>)}</dl>
          : !rows.length ? <p role="status" className="p-6 text-slate-500 text-sm">{kind === 'supplier-queue' ? '当前筛选暂无上游供应商采购订单（本地库存自动发货订单请在「订单管理」查看）。' : '当前筛选暂无记录。'}</p>
          : (
            <table className="w-max min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-left backdrop-blur-xs">
                <tr>
                  {columns.map(([key, label]) => (
                    <th
                      key={key}
                      className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-slate-600"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map(row => (
                  <tr key={String(row.id)} className="transition-colors hover:bg-slate-50/80">
                    {columns.map(([key]) => (
                      <td
                        key={key}
                        className="whitespace-nowrap px-3.5 py-2.5 align-middle text-xs text-slate-700"
                      >
                        {key === 'order_no' && row.order_id ? (
                          <Link
                            className="font-mono font-medium text-blue-700 hover:text-blue-800 hover:underline"
                            href={`/admin/orders?search=${encodeURIComponent(String(row.order_no || row.order_id))}`}
                          >
                            {value(row[key])}
                          </Link>
                        ) : (
                          displayValue(kind, key, row)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </AdminTableViewport>
      {kind !== 'worker' && <AdminListPagination page={page} totalPages={stats.totalPages} loading={loading || Boolean(error)} summary={error ? '总数未知' : `共 ${total} 条（全部历史筛选结果）`} onPrevious={() => setPage(p => Math.max(1,p-1))} onNext={() => setPage(p => p+1)} />}
    </AdminListSurface>
  </AdminPageShell>;
}
