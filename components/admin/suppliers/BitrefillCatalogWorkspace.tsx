"use client";

import { useEffect, useState } from "react";
import type { CatalogPage, CatalogProduct } from "@/lib/providers/bitrefill/catalog-management.mjs";
import BitrefillLocalMappingEditor from "./BitrefillLocalMappingEditor";
const base = "/api/admin/suppliers/bitrefill";
export default function BitrefillCatalogWorkspace({ localMode = false }: { localMode?: boolean }) {
  const [country, setCountry] = useState("US"), [q, setQ] = useState(""), [category, setCategory] = useState("all"), [stock, setStock] = useState("all");
  const [query, setQuery] = useState({ country: "US", q: "", category: "all", stock: "all", page: 1 });
  const [data, setData] = useState<CatalogPage | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0), [selection, setSelection] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ product: CatalogProduct; fingerprint: string } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null); setData(null);
    const params = new URLSearchParams({ ...query, page: String(query.page) });
    void fetch(`${base}/catalog?${params}`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const body = await r.json(); if (!r.ok) throw new Error(body.error ?? "目录读取失败");
      if (!Array.isArray(body.products) || !Array.isArray(body.categories) || body.categories.some((c: unknown) => typeof c !== "string")) throw new Error("目录格式无效");
      if (!controller.signal.aborted) { setData(body); setCategoryOptions((prior) => Array.from(new Set<string>([...prior, ...body.categories])).sort()); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "目录读取失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, reload]);
  useEffect(() => {
    setDetail(null); setDetailError(null); if (!selection) return;
    const controller = new AbortController();
    void fetch(`${base}/catalog?productId=${encodeURIComponent(selection)}`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const body = await r.json(); if (!r.ok) throw new Error(body.error ?? "详情读取失败");
      if (!controller.signal.aborted) setDetail(body);
    }).catch((e: unknown) => { if (!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : "详情读取失败"); });
    return () => controller.abort();
  }, [selection, reload]);
  return <main className="min-w-0 space-y-4 p-4 md:p-6">
    <h1 className="text-xl font-semibold">Bitrefill 商品目录与人工映射</h1>
    <p className="rounded-xl border bg-orange-50 p-3 text-sm">Personal API 仅查询商品，不代表商业转售许可。人工映射不启用采购；没有真实报价时成本和利润始终未验证。</p>
    <nav className="flex flex-wrap gap-4 text-sm text-orange-700">{!localMode ? <a href="/admin/suppliers/bitrefill">采购记录</a> : null}<a href="/admin/suppliers/bitrefill/aftercare">异常待处理</a></nav>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border p-3" onSubmit={(e) => {
      e.preventDefault(); setSelection(null); if (country !== query.country) setCategoryOptions([]); setQuery({ country, q, category, stock, page: 1 });
    }}>
      <label className="text-sm">国家<input aria-label="国家" className="ml-2 min-h-[44px] w-20 rounded border px-2" value={country} maxLength={2} pattern="[A-Z]{2}" onChange={(e) => setCountry(e.target.value.toUpperCase())} required /></label>
      <label className="min-w-0 text-sm">搜索<input aria-label="商品搜索" className="ml-2 min-h-[44px] max-w-full rounded border px-2" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="名称或 Product ID" /></label>
      <label className="text-sm">分类（已读取的 categories / type）<select aria-label="分类" className="ml-2 min-h-[44px] rounded border" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">全部</option>{categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="text-sm">库存<select aria-label="库存" className="ml-2 min-h-[44px] rounded border" value={stock} onChange={(e) => setStock(e.target.value)}><option value="all">全部</option><option value="available">可供货</option><option value="unavailable">不可供货</option></select></label>
      <button className="min-h-[44px] rounded-lg bg-orange-600 px-4 text-white" disabled={loading}>查询商品</button>
    </form>
    {loading ? <p role="status">正在读取目录；同一国家快照缓存最多 5 分钟…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="min-h-[44px] underline" onClick={() => setReload((n) => n + 1)}>重试目录</button></div> : data && data.page === query.page ? <>
      <p className="text-xs text-slate-600">匹配 {data.total} 项 · 查询时间 {data.checkedAt} · 库存仅有布尔值，数量未知。{data.truncated ? "已达到有界查询上限，结果不完整。" : "当前国家快照未截断。"}</p>
      {!data.products.length ? <p>没有匹配商品；不会猜测或自动绑定 Apple / Amazon US。</p> : <div className="grid min-w-0 gap-3 lg:grid-cols-2">{data.products.map((p) => <article key={p.id} className="min-w-0 break-words rounded-xl border bg-white p-4">
        <h2 className="font-semibold">{p.name}</h2><p className="break-all text-xs">Product ID：{p.id}</p>
        <p className="mt-2 text-sm">{p.country} · {p.category} · {p.currency} · {p.available ? "可供货（数量未知）" : "不可供货"}</p>
        <p className="text-sm">固定套餐 {p.packages.length} 个{p.range ? ` · Range ${p.range.min}–${p.range.max}，步长 ${p.range.step}` : ""}</p>
        <button type="button" className="mt-2 min-h-[44px] rounded border px-3" onClick={() => setSelection(p.id)}>查看套餐 / 人工映射</button>
      </article>)}</div>}
      <nav aria-label="目录分页" className="flex items-center gap-3"><button type="button" disabled={query.page === 1} className="min-h-[44px] rounded border px-3 disabled:opacity-50" onClick={() => setQuery((s) => ({ ...s, page: s.page - 1 }))}>上一页</button><span>第 {query.page} 页</span><button type="button" disabled={!data.hasMore} className="min-h-[44px] rounded border px-3 disabled:opacity-50" onClick={() => setQuery((s) => ({ ...s, page: s.page + 1 }))}>下一页</button></nav>
    </> : null}
    {selection ? <section aria-label="供应商商品详情" className="min-w-0 space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">商品详情：{selection}</h2><button type="button" onClick={() => setSelection(null)}>关闭详情</button></div>
      {detailError ? <p role="alert">{detailError}</p> : !detail ? <p role="status">正在读取商品详情…</p> : <>
        <div className="max-h-80 overflow-auto rounded border"><table className="w-full table-fixed text-left text-sm"><caption className="p-2 text-left">{detail.product.packages.length} 个固定套餐；catalogPrice 不是已核验采购成本</caption><thead><tr><th>Package ID</th><th>面值 / 标签</th><th>目录报价（结算单位未核验）</th></tr></thead><tbody>{detail.product.packages.map((p) => <tr key={p.packageId} className="border-t"><td className="break-all p-2">{p.packageId}</td><td className="p-2">{p.faceValue ?? p.valueLabel} {detail.product.currency}</td><td className="p-2">{p.catalogPrice ?? "未提供"}</td></tr>)}</tbody></table></div>
        {detail.product.range ? <p>Range：{detail.product.range.min}–{detail.product.range.max} {detail.product.currency}，步长 {detail.product.range.step}；真实 Range 采购未启用。</p> : null}
        {localMode ? <BitrefillLocalMappingEditor key={`${detail.product.id}:${detail.fingerprint}`} product={detail.product} fingerprint={detail.fingerprint} />
          : <p className="rounded border p-3 text-sm">请到<a href="/admin/products" className="text-orange-700 underline">商品管理 → 编辑商品 → 商品规格 → 供应商绑定</a>，选择 Bitrefill 并逐个 SKU 核对保存。这里仅浏览目录，不创建第二套绑定。</p>}
      </>}
    </section> : null}
  </main>;
}
