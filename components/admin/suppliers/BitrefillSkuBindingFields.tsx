"use client";
// A provider-specific field group INSIDE the existing supplier binding sheet.
import { useEffect, useRef, useState } from "react";
import type { AdminProduct, AdminProductSku } from "@/lib/supabase/admin-catalog";
import type { CatalogPage, CatalogProduct } from "@/lib/providers/bitrefill/catalog-management.mjs";
import { mappingPreview } from "@/lib/providers/bitrefill/mapping-financials.mjs";
type Detail = { product: CatalogProduct; fingerprint: string };
export default function BitrefillSkuBindingFields({ product, sku, onSaved }: {
  product: AdminProduct; sku: AdminProductSku; onSaved: (saved: { sku: AdminProductSku; product?: AdminProduct }) => void;
}) {
  const raw = sku.metadata?.supplier_binding_candidate;
  const prior = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const [q, setQ] = useState(""), [country, setCountry] = useState(String(prior.supplier_country ?? "US")), [international, setInternational] = useState(true);
  const [data, setData] = useState<CatalogPage | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState(prior.range_value ? "range" : "package"), [packageId, setPackageId] = useState(String(prior.supplier_package_id ?? ""));
  const [range, setRange] = useState(String(prior.range_value ?? ""));
  const [facts, setFacts] = useState({ country: String(prior.supplier_country ?? "US"), currency: String(prior.supplier_currency ?? "USD"), face_value: String(prior.supplier_face_value ?? "") });
  const [cost, setCost] = useState(String(prior.supplier_cost ?? "")), [costCurrency, setCostCurrency] = useState(String(prior.supplier_cost_currency ?? "")), [fees, setFees] = useState(String(prior.supplier_configured_fees ?? ""));
  const [note, setNote] = useState(String(prior.supplier_review_note ?? "")), [reviewed, setReviewed] = useState(false), [confirmed, setConfirmed] = useState(false);
  const controller = useRef<AbortController | null>(null), detailController = useRef<AbortController | null>(null);
  const [lastSearch, setLastSearch] = useState<{ q: string; country: string; includeInternational: string } | null>(null);
  async function selectProduct(id: string, preserve = false) {
    detailController.current?.abort(); const abort = new AbortController(); detailController.current = abort;
    setDetail(null); setReviewed(false); setConfirmed(false); setError(null);
    try {
      const r = await fetch(`/api/admin/suppliers/bitrefill/catalog?productId=${encodeURIComponent(id)}`, { cache: "no-store", signal: abort.signal });
      const body = await r.json(); if (!r.ok) throw Error(body.error ?? "商品详情不可用");
      if (abort.signal.aborted) return;
      setDetail(body); if (!preserve) { setPackageId(""); setRange(""); setMode(body.product.packages.length ? "package" : "range"); }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "商品详情不可用"); }
  }
  useEffect(() => {
    if (typeof prior.supplier_product_id === "string") void selectProduct(prior.supplier_product_id, true);
    return () => { controller.current?.abort(); detailController.current?.abort(); };
    // Sheet identity key remounts this field group for every SKU.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function search(page = 1) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const query = page > 1 && lastSearch ? lastSearch : { q: q.trim(), country, includeInternational: String(international) };
    setLastSearch(query); setLoading(true); setError(null); setData(null);
    try {
      const r = await fetch(`/api/admin/suppliers/bitrefill/catalog?${new URLSearchParams({ ...query, page: String(page) })}`, { cache: "no-store", signal: abort.signal });
      const body = await r.json(); if (!r.ok) throw Error(body.error ?? "商品目录无权限或暂不可用");
      if (!abort.signal.aborted) setData(body);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "搜索失败"); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  let profit: string | null = null;
  try { profit = mappingPreview({ salePrice: String(sku.price), saleCurrency: "CNY", source: "current_sku_price" },
    { configuredCost: cost || null, configuredFees: fees || null, costCurrency: cost ? costCurrency : null }).estimatedProfit; } catch { /* Invalid partial input stays unknown. */ }
  return <section className="mt-4 min-w-0 space-y-4" aria-label="Bitrefill SKU 供应商绑定">
    <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">仅保存到当前 SKU 的统一供应商配置候选。真实采购关闭；不会覆盖有效 Daju 来源、自动退款或更改历史订单。商品类型/必需字段、商业许可及真实成本未验证时不能启用。</p>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <label>商品名称或 ID<input aria-label="Bitrefill 搜索" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} className="block min-h-[44px] max-w-full rounded border px-2" /></label>
      <label>国家<input aria-label="Bitrefill 国家" value={country} maxLength={2} pattern="[A-Z]{2}" required onChange={(e) => setCountry(e.target.value.toUpperCase())} className="block min-h-[44px] w-20 rounded border px-2" /></label>
      <label><input type="checkbox" checked={international} onChange={(e) => setInternational(e.target.checked)} /> 包含 XI 国际商品（不等于适用 US）</label>
      <button disabled={loading} className="min-h-[44px] rounded border px-3">搜索 Bitrefill</button>
      <button type="button" disabled={!q.trim() || loading} className="min-h-[44px] rounded border px-3" onClick={() => void selectProduct(q.trim())}>按精确 Product ID 读取</button>
    </form>
    {loading ? <p role="status">正在查询官方商品目录…</p> : null}{error ? <p role="alert" className="break-all text-red-700">{error}</p> : null}
    {data ? <div className="space-y-2"><p>共 {data.total} 项 · {q.trim() ? "官方全目录搜索后按国家筛选" : "国家目录"}{data.truncated ? " · 达到查询上限，结果不完整" : ""}</p>
      {!data.products.length ? <p>未找到当前账户可见商品；不代表所有账户均无此商品，也不会猜测或自动绑定。</p> : <div className="max-h-64 overflow-auto rounded border">{data.products.map((p) => <button type="button" key={p.id} onClick={() => void selectProduct(p.id)} className="block min-h-[44px] w-full break-all border-b p-3 text-left"><strong>{p.name}</strong><br />{p.id} · {p.country} · {p.currency} · {p.category} · {p.available ? "可供货（数量未知）" : "不可供货"}</button>)}</div>}
      <nav className="flex gap-3"><button type="button" disabled={data.page === 1} onClick={() => void search(data.page - 1)}>上一页</button><span>第 {data.page} 页</span><button type="button" disabled={!data.hasMore} onClick={() => void search(data.page + 1)}>下一页</button></nav></div> : null}
    {detail ? <form className="space-y-3 rounded-xl border p-3" onSubmit={async (event) => {
      event.preventDefault(); setSaving(true); setError(null);
      try {
        const r = await fetch(`/api/admin/suppliers/bitrefill/bindings/${product.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          website_sku_id: sku.id, expected_updated_at: sku.updated_at, expected_binding_version: sku.metadata?.supplier_binding_version ?? 0,
          supplier_product_id: detail.product.id, catalog_fingerprint: detail.fingerprint, mode,
          supplier_package_id: mode === "package" ? packageId : null, range_value: mode === "range" ? range : null, sku_facts: facts,
          configured_cost: cost || null, cost_currency: cost ? costCurrency : null, configured_fees: fees || null,
          review_status: reviewed ? "manual_reviewed_unverified" : "draft", review_note: note,
          identity_confirmed: confirmed, denomination_confirmed: confirmed, brand_country_confirmed: confirmed,
          verified: false, automatic_purchase_enabled: false }) });
        const body = await r.json(); if (!r.ok) throw Error(body.code ?? body.error ?? "绑定候选保存失败");
        onSaved(body);
      } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); }
    }}>
      <h3 className="font-semibold break-all">核对 {detail.product.name} / {detail.product.id}</h3>
      <p>国家 {detail.product.country} · 面额币种 {detail.product.currency} · 类型 {detail.product.category} · 分类 {detail.product.categories.join("、") || "未提供"} · {detail.product.available ? "可供货（数量未知）" : "不可供货"}</p>
      <label>面额方式<select aria-label="Bitrefill 面额方式" value={mode} onChange={(e) => { setMode(e.target.value); setConfirmed(false); }} className="ml-2 min-h-[44px] rounded border"><option value="package" disabled={!detail.product.packages.length}>固定 Package</option><option value="range" disabled={!detail.product.range}>Range Value</option></select></label>
      {mode === "package" ? <label className="block">Package ID<select aria-label="Bitrefill Package ID" value={packageId} required onChange={(e) => { setPackageId(e.target.value); setConfirmed(false); }} className="block min-h-[44px] w-full max-w-full rounded border"><option value="">人工选择准确套餐</option>{detail.product.packages.map((p) => <option key={p.packageId} value={p.packageId}>{p.packageId} / {p.faceValue ?? p.valueLabel} {detail.product.currency}</option>)}</select></label>
        : <label className="block">Range Value（{detail.product.range?.min}–{detail.product.range?.max}，步长 {detail.product.range?.step}）<input aria-label="Bitrefill Range Value" required value={range} onChange={(e) => { setRange(e.target.value); setConfirmed(false); }} className="block min-h-[44px] w-full rounded border px-2" /></label>}
      <p className="text-xs">商城 SKU 规格需人工逐项核对，不根据 SKU 名称推测；输入值为未验证声明。XI 不能自动视为 US。非 gift_card / 类型未知只允许草稿，必需下单参数未核验，不启用。</p>
      <div className="grid gap-2 sm:grid-cols-3">{([['country', 'SKU 地区'], ['currency', 'SKU 面额币种'], ['face_value', 'SKU 面值']] as const).map(([field, title]) => <label key={field}>{title}<input aria-label={title} value={facts[field]} required onChange={(e) => { setFacts((f) => ({ ...f, [field]: e.target.value })); setConfirmed(false); }} className="block min-h-[44px] w-full rounded border px-2" /></label>)}</div>
      <div className="grid gap-2 sm:grid-cols-3"><label>配置成本（未验证）<input aria-label="绑定配置成本" value={cost} onChange={(e) => setCost(e.target.value)} className="block min-h-[44px] w-full rounded border px-2" /></label><label>成本币种<input aria-label="绑定成本币种" value={costCurrency} required={Boolean(cost)} pattern="[A-Z]{3}" onChange={(e) => setCostCurrency(e.target.value.toUpperCase())} className="block min-h-[44px] w-full rounded border px-2" /></label><label>同币种费用（未知留空）<input aria-label="绑定费用" value={fees} onChange={(e) => setFees(e.target.value)} className="block min-h-[44px] w-full rounded border px-2" /></label></div>
      <p>商城售价 ¥{sku.price.toFixed(2)} CNY · 预估利润：{profit !== null ? `${profit} CNY（未验证预览）` : "未知（缺成本、费用或可信汇率）"} · 实际采购成本：暂无真实记录</p>
      <label className="block">审核说明<input aria-label="Bitrefill 审核说明" required minLength={3} maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} className="block min-h-[44px] w-full rounded border px-2" placeholder="不填写客户资料、卡密或凭据" /></label>
      <label className="block"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 已逐项核对商品身份、国家、币种、面值及 Apple/Amazon 使用地区</label>
      <label className="block"><input type="checkbox" checked={reviewed} disabled={detail.product.category !== "gift_card"} onChange={(e) => setReviewed(e.target.checked)} /> 记录人工核对（仍未验证，不启用采购）</label>
      <p className="text-sm">保存版本 {(Number(sku.metadata?.supplier_binding_version) || 0) + 1}；原采购来源和已创建订单快照均不改变。</p>
      <button disabled={saving || !sku.updated_at} className="min-h-[44px] rounded bg-orange-600 px-4 text-white">保存 Bitrefill SKU 候选</button>
    </form> : null}
  </section>;
}
