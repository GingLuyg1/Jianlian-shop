"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminPageShell from '@/components/admin/AdminPageShell';
import { AdminListPagination, AdminListSurface, AdminTableViewport } from '@/components/admin/v2/AdminList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listPagination } from '@/lib/admin/list-pagination.mjs';

type Kind = 'worker' | 'ledger' | 'supplier-queue';
type Row = Record<string, unknown>;
const ledgerColumns = [
  ['transaction_no','流水号'],['user_email','用户邮箱'],['business_type','业务类型'],['business_id','业务引用'],
  ['direction','方向'],['amount','金额'],['currency','币种'],['status','状态'],['balance_before','之前余额'],['balance_after','之后余额'],['created_at','创建时间'],
];
const queueColumns = [
  ['order_no','订单'],['order_item_id','订单项'],['supplier','供应商'],['supplier_product_id','供应商商品'],['supplier_sku','供应商 SKU'],
  ['request_id','采购请求'],['provider_order_code','Provider 引用'],['status','状态'],['retryable','可重试'],['attempt_count','尝试次数'],
  ['last_error_code','错误代码'],['last_attempt_at','最近尝试'],['completed_at','完成时间'],['created_at','创建时间'],['updated_at','更新时间'],
];
const workerLabels: Record<string, string> = {
  timer_enabled:'Timer 已启用',timer_active:'Timer 运行状态',snapshot_observed_at:'Systemd 观测时间',snapshot_fresh:'Systemd 观测有效',
  last_invocation:'最近 invocation',heartbeat_status:'最近 heartbeat 状态',heartbeat_finished_at:'最近 heartbeat 时间',heartbeat_stale:'Heartbeat 已过期',
  last_successful_run:'最近成功',last_error_observed_at:'本次错误时间',error_count:'本次错误数',provider_queries:'本次 Provider 查询数',completed:'本次完成数',observability_note:'观测边界',
};
function value(v: unknown) { return v == null || v === '' ? '—' : typeof v === 'boolean' ? v ? 'yes' : 'no' : String(v); }

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
  const title = kind === 'worker' ? 'Worker 状态' : kind === 'ledger' ? '全历史余额流水' : '供应商履约队列';
  const stats = listPagination(total, page, 50);
  return <AdminPageShell variant="v2" title={title} description={kind === 'ledger' ? '超级管理员只读工作台；服务端分页查询全部历史，不提供调账或删除。' : '只读观测，不提供重试、强制完成或系统控制。'}
    actions={<Button variant="outline" onClick={() => setRevision(v => v + 1)} disabled={loading}>刷新</Button>}>
    <AdminListSurface>
      {kind !== 'worker' && <div className="grid shrink-0 grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input aria-label="搜索" placeholder={kind === 'ledger' ? '邮箱 / 用户名 / 用户ID / 流水号' : '订单号 / 订单ID / 请求号 / Provider 引用'} value={filters.q ?? ''} onChange={e => change('q', e.target.value)} />
        <select aria-label="状态" className="min-h-11 rounded-md border px-3" value={filters.status ?? ''} onChange={e => change('status', e.target.value)}>
          <option value="">全部状态</option>{(kind === 'ledger' ? ['pending','completed','failed','cancelled'] : ['pending','processing','retryable_failed','permanent_failed','completed','uncertain','needs_input']).map(s => <option key={s}>{s}</option>)}
        </select>
        <Input aria-label="开始日期 UTC" type="date" value={filters.start ?? ''} onChange={e => change('start', e.target.value)} />
        <Input aria-label="结束日期 UTC" type="date" value={filters.end ?? ''} onChange={e => change('end', e.target.value)} />
        {kind === 'ledger' && <>
          <Input aria-label="业务类型" placeholder="业务类型，例如 account_recharge" value={filters.business_type ?? ''} onChange={e => change('business_type', e.target.value)} />
          <select aria-label="方向" className="min-h-11 rounded-md border px-3" value={filters.direction ?? ''} onChange={e => change('direction', e.target.value)}><option value="">全部方向</option><option>credit</option><option>debit</option></select>
          <Input aria-label="币种" placeholder="币种，例如 CNY" value={filters.currency ?? ''} onChange={e => change('currency', e.target.value)} />
          <div className="flex gap-2"><Input aria-label="最小金额" placeholder="最小金额" value={filters.min_amount ?? ''} onChange={e => change('min_amount', e.target.value)} /><Input aria-label="最大金额" placeholder="最大金额" value={filters.max_amount ?? ''} onChange={e => change('max_amount', e.target.value)} /></div>
        </>}
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">日期按 UTC 筛选。搜索过宽会提示缩小范围；不返回截断的用户匹配结果。</p>
      </div>}
      <AdminTableViewport>
        {loading ? <p role="status" className="p-6">正在读取…</p> : error ? <div role="alert" className="p-6 text-red-700">{error}<Button variant="outline" className="ml-3" onClick={() => setRevision(v => v + 1)}>重试读取</Button></div>
          : kind === 'worker' ? <dl className="grid gap-3 p-4 sm:grid-cols-2">{Object.entries(workerLabels).map(([key,label]) => <div key={key} className="min-w-0 rounded border p-3"><dt className="text-sm text-slate-500">{label}</dt><dd className="break-words">{value(worker?.[key])}</dd></div>)}</dl>
          : !rows.length ? <p role="status" className="p-6">当前筛选暂无记录。</p>
          : <table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50 text-left"><tr>{columns.map(([key,label]) => <th className="p-3" key={key}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row.id)} className="border-b">{columns.map(([key]) => <td className="max-w-64 break-words p-3" key={key}>{key === 'order_no' && row.order_id ? <Link className="text-blue-700 underline" href={`/admin/orders?search=${encodeURIComponent(String(row.order_no || row.order_id))}`}>{value(row[key])}</Link> : value(row[key])}</td>)}</tr>)}</tbody></table>}
      </AdminTableViewport>
      {kind !== 'worker' && <AdminListPagination page={page} totalPages={stats.totalPages} loading={loading || Boolean(error)} summary={error ? '总数未知' : `共 ${total} 条（全部历史筛选结果）`} onPrevious={() => setPage(p => Math.max(1,p-1))} onNext={() => setPage(p => p+1)} />}
    </AdminListSurface>
  </AdminPageShell>;
}
