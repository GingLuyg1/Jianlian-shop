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
  if (key === 'status') return kind === 'supplier-queue' ? supplierStatusLabel(v, row.retryable) : statusLabel(v);
  if (key === 'heartbeat_status') return workerStatusLabel(v);
  if (['timer_enabled','timer_active','snapshot_fresh','heartbeat_stale','retryable'].includes(key)) return booleanLabel(v);
  if (key.endsWith('_at') || key === 'last_successful_run') return beijingDateTime(v);
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
  useEffect(() => {
    const requestVersion = ++version.current;
    const controller = new AbortController();
    setLoading(true); setError(''); setRows([]); setWorker(null); setTotal(0);
    const params = new URLSearchParams({ ...filters, page: String(page) });
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
  const title = kind === 'worker' ? '自动任务运行状态' : kind === 'ledger' ? '全历史余额流水' : '供应商自动采购任务';
  const stats = listPagination(total, page, 50);
  return <AdminPageShell variant="v2" title={title} description={kind === 'ledger' ? '查看全部历史余额流水，不提供调账或删除。' : kind === 'worker' ? workerHelpText : '这里只用于查看自动采购进度，不能在这里重新采购或强制完成。'}
    actions={<Button variant="outline" onClick={() => setRevision(v => v + 1)} disabled={loading}>刷新</Button>}>
    <AdminListSurface>
      {kind !== 'worker' && <div className="grid shrink-0 grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input aria-label="搜索" placeholder={kind === 'ledger' ? '邮箱 / 用户名 / 用户ID / 流水号' : '订单号 / 采购任务号 / 上游平台订单号'} value={filters.q ?? ''} onChange={e => change('q', e.target.value)} />
        <select aria-label="状态" className="min-h-11 rounded-md border px-3" value={filters.status ?? ''} onChange={e => change('status', e.target.value)}>
          <option value="">全部状态</option>{(kind === 'ledger' ? ['pending','completed','failed','cancelled'] : ['pending','processing','retryable_failed','permanent_failed','completed','uncertain','needs_input']).map(s => <option key={s} value={s}>{kind === 'ledger' ? statusLabel(s) : supplierStatusLabel(s)}</option>)}
        </select>
        <Input aria-label="开始日期（范围见说明）" type="date" value={filters.start ?? ''} onChange={e => change('start', e.target.value)} />
        <Input aria-label="结束日期（范围见说明）" type="date" value={filters.end ?? ''} onChange={e => change('end', e.target.value)} />
        {kind === 'ledger' && <>
          <select aria-label="业务类型" className="min-h-11 rounded-md border px-3" value={filters.business_type ?? ''} onChange={e => change('business_type', e.target.value)}><option value="">全部业务类型</option>{ledgerBusinessOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select aria-label="方向" className="min-h-11 rounded-md border px-3" value={filters.direction ?? ''} onChange={e => change('direction', e.target.value)}><option value="">全部方向</option><option value="credit">余额增加</option><option value="debit">余额扣减</option></select>
          <select aria-label="币种" className="min-h-11 rounded-md border px-3" value={filters.currency ?? ''} onChange={e => change('currency', e.target.value)}><option value="">全部币种</option><option value="CNY">人民币（CNY）</option><option value="USDT">USDT</option></select>
          <div className="flex gap-2"><Input aria-label="最小金额" placeholder="最小金额" value={filters.min_amount ?? ''} onChange={e => change('min_amount', e.target.value)} /><Input aria-label="最大金额" placeholder="最大金额" value={filters.max_amount ?? ''} onChange={e => change('max_amount', e.target.value)} /></div>
        </>}
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">{operationsDateFilterHelp}</p>
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
