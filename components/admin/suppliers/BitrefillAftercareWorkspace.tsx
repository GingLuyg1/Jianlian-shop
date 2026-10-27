"use client";
import { useEffect, useState } from "react";
type Case = { id: string; orderId: string; orderNo: string | null; kind: string; deliveredUnits: number; failedUnits: number;
  supplierRefundedUnits: number; invoices: string[]; roots: { id: string; orderItemId: string; status: string }[] };
export default function BitrefillAftercareWorkspace({ localMode = false }: { localMode?: boolean }) {
  const [cases, setCases] = useState<Case[]>([]), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0);
  const [message, setMessage] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<{ caseId: string; status: string; note: string; at: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null); setCases([]);
    void fetch(`/api/admin/suppliers/bitrefill/aftercare?page=${page}`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "异常队列读取失败");
      if (!controller.signal.aborted) { setCases(data.cases); setHasMore(data.hasMore); setNotes(data.notes ?? []); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "异常队列读取失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, reload]);
  return <section className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
    <h1 className="text-xl font-semibold">Bitrefill 异常待处理</h1>
    <p className="rounded-xl border bg-orange-50 p-3 text-sm">采购失败、供应商退款、部分失败统一由管理员人工处理。供应商退款不等于客户退款；本页不会自动退余额、退支付款或重发货。客户问题请联系人工客服。</p>
    <nav className="flex flex-wrap gap-4 text-orange-700"><a href={localMode ? "/" : "/admin/suppliers/bitrefill/catalog"}>商品目录</a>{!localMode ? <><a href="/admin/orders">订单人工处理</a><a href="/admin/refunds">原有退款审核</a></> : null}
      <button type="button" disabled={loading} onClick={() => setReload((n) => n + 1)}>刷新异常</button></nav>
    {loading ? <p role="status">正在读取异常记录…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload((n) => n + 1)}>重试异常队列</button></div> : <>
      {!cases.length ? <p>本页暂无异常记录；可继续浏览后续订单页。不会构造异常订单。</p> : cases.map((c) => <article key={c.id} className="min-w-0 break-all rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">{c.kind} · {c.orderNo ?? c.orderId}</h2>
        <p>供应商 Child 已交付 {c.deliveredUnits} · 失败 {c.failedUnits} · 供应商已退款 {c.supplierRefundedUnits}</p>
        <p className="text-xs">供应商状态不等于商城发货完成；本页不会确认或更改私密卡密交付。</p>
        <p>Invoice：{c.invoices.join("，") || "尚未确认"}</p>
        <ul>{c.roots.map((r) => <li key={r.id}>项目 {r.orderItemId} · {r.status}</li>)}</ul>
        {localMode && notes.some((n) => n.caseId === c.id) ? <p>最近人工记录：{[...notes].reverse().find((n) => n.caseId === c.id)?.status} · {[...notes].reverse().find((n) => n.caseId === c.id)?.note}</p> : null}
        {!localMode ? <a className="inline-block py-3 text-orange-700 underline" href={c.orderNo ? `/admin/orders?search=${encodeURIComponent(c.orderNo)}` : "/admin/orders"}>打开订单人工核对</a> : <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage(null);
          try {
            const r = await fetch("/api/admin/suppliers/bitrefill/aftercare-notes", { method: "POST", headers: { "Content-Type": "application/json", "x-jianlian-local-workspace": "v4" },
              body: JSON.stringify({ caseId: c.id, requestId: crypto.randomUUID(), status: form.get("status"), note: form.get("note") }) });
            const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "人工记录失败");
            setMessage("已保存本地人工处理记录；没有退款，没有修改订单或交付状态。");
            setNotes((rows) => [...rows, data]);
          } catch (e) { setMessage(e instanceof Error ? e.message : "记录失败"); } finally { setBusy(false); }
        }}><select name="status" aria-label="人工处理状态" className="min-h-[44px] rounded border"><option value="assigned">人工处理中</option><option value="resolved_manually">人工记录完成（不等于退款或发货）</option></select>
          <input name="note" aria-label="人工处理说明" required minLength={3} maxLength={160} placeholder="不填写客户资料、卡密或密码" className="min-h-[44px] min-w-0 rounded border px-2" />
          <button disabled={busy} className="min-h-[44px] rounded border px-3">保存人工记录（不动账）</button></form>}
      </article>)}
      <nav aria-label="异常订单分页" className="flex items-center gap-3"><button type="button" disabled={page === 1} className="min-h-[44px] rounded border px-3 disabled:opacity-50" onClick={() => setPage((n) => n - 1)}>上一页</button><span>订单扫描第 {page} 页</span><button type="button" disabled={!hasMore} className="min-h-[44px] rounded border px-3 disabled:opacity-50" onClick={() => setPage((n) => n + 1)}>下一页</button></nav>
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
