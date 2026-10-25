"use client";

import { useCallback, useEffect, useState } from "react";
import type { BitrefillAdminPage } from "@/lib/admin/bitrefill-fulfillment.mjs";
import BitrefillFulfillmentRows from "./BitrefillFulfillmentRows";

export default function BitrefillFulfillmentWorkspace() {
  const [page, setPage] = useState(1), [data, setData] = useState<BitrefillAdminPage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    void fetch(`/api/admin/suppliers/bitrefill/fulfillment?page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "采购记录读取失败");
        if (!Array.isArray(payload.rows)) throw new Error("采购记录格式无效");
        if (!controller.signal.aborted) setData(payload);
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "采购记录读取失败");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, reload]);
  return <section className="min-w-0 space-y-4 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Bitrefill 采购与履约</h1>
      <button type="button" onClick={refresh} disabled={loading} className="min-h-[44px] rounded-lg border px-4 disabled:opacity-50">刷新记录</button></div>
    <p className="rounded-xl border bg-orange-50 p-3 text-sm">真实自动采购关闭。商品映射、商业授权、真实成本和 Child 身份仍待验证。这里不展示卡密，也不提供重发 POST 按钮。</p>
    {loading ? <p role="status">正在读取采购记录…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="min-h-[44px] underline" onClick={refresh}>重试只读查询</button></div> : data ? <>
      <BitrefillFulfillmentRows rows={data.rows} />
      {data.evidenceTruncated ? <p className="text-xs">仅展示本页最近 200 条对账事件。</p> : null}
      <nav aria-label="采购记录分页" className="flex items-center gap-3"><button type="button" className="min-h-[44px] rounded border px-4 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>上一页</button>
        <span>第 {page} 页</span><button type="button" className="min-h-[44px] rounded border px-4 disabled:opacity-50" disabled={!data.hasMore} onClick={() => setPage((n) => n + 1)}>下一页</button></nav>
    </> : null}
  </section>;
}
