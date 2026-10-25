"use client";
import { useEffect, useState } from "react";
import type { CatalogProduct } from "@/lib/providers/bitrefill/catalog-management.mjs";
import type { LocalMapping, LocalSku } from "@/lib/providers/bitrefill/local-mapping.mjs";
const base = "/api/admin/suppliers/bitrefill";
export default function BitrefillLocalMappingEditor({ product, fingerprint }: { product: CatalogProduct; fingerprint: string }) {
  const [skus, setSkus] = useState<LocalSku[]>([]), [mappings, setMappings] = useState<LocalMapping[]>([]);
  const [skuId, setSkuId] = useState(""), [mode, setMode] = useState(product.packages.length ? "package" : "range"), [packageId, setPackageId] = useState(product.packages[0]?.packageId ?? ""), [rangeValue, setRangeValue] = useState("");
  const [cost, setCost] = useState(""), [currency, setCurrency] = useState(""), [fees, setFees] = useState("");
  const [note, setNote] = useState(""), [review, setReview] = useState(false), [identity, setIdentity] = useState(false), [denomination, setDenomination] = useState(false), [brand, setBrand] = useState(false), [localAck, setLocalAck] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const [newSku, setNewSku] = useState({ id: "", title: "", brand: "Amazon", country: "US", denominationCurrency: "USD", faceValue: "", saleCurrency: "CNY", salePrice: "" });
  useEffect(() => {
    const controller = new AbortController(); setLoadError(false);
    void fetch(`${base}/mappings`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const body = await r.json(); if (!r.ok || body.localOnly !== true) throw new Error("LOCAL_WORKSPACE_REQUIRED");
      if (!controller.signal.aborted) { setSkus(body.skus); setMappings(body.mappings); }
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [reload]);
  const sku = skus.find((s) => s.id === skuId), current = mappings.find((m) => m.skuId === skuId);
  function clearReview() { setReview(false); setIdentity(false); setDenomination(false); setBrand(false); setLocalAck(false); }
  function selectSku(id: string) {
    setSkuId(id); clearReview(); setMessage(null);
    const saved = mappings.find((m) => m.skuId === id && m.productId === product.id);
    setMode(saved?.mode ?? (product.packages.length ? "package" : "range"));
    setPackageId(saved?.packageId ?? product.packages[0]?.packageId ?? ""); setRangeValue(saved?.rangeValue ?? "");
    setCost(saved?.configuredCost ?? ""); setCurrency(saved?.costCurrency ?? ""); setFees(saved?.configuredFees ?? ""); setNote(saved?.reviewNote ?? "");
  }
  async function write(path: string, body: unknown) {
    const r = await fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-jianlian-local-workspace": "v4" }, body: JSON.stringify(body) });
    const result = await r.json(); if (!r.ok) throw new Error(result.error ?? "LOCAL_WRITE_FAILED"); return result;
  }
  return <section className="space-y-3 rounded-xl bg-orange-50 p-3">
    <h3 className="font-semibold">本地隔离映射（无生产效力）</h3>
    <p className="text-xs">售价来自本地 SKU 参考记录，不代表当前线上售价。费用留空表示未知，不默认填零。不要输入客户资料、卡密、密码或密钥。</p>
    {loadError ? <p role="alert">本地记录读取失败。<button type="button" onClick={() => setReload((n) => n + 1)}>重试映射</button></p> : null}
    <form className="grid min-w-0 gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMessage(null);
      try {
        const result = await write("mappings", { skuId, productId: product.id, mode, packageId: mode === "package" ? packageId : null,
          rangeValue: mode === "range" ? rangeValue : null, expectedVersion: current?.version ?? 0, status: review ? "manual_reviewed" : "draft",
          reviewNote: note, configuredCost: cost || null, costCurrency: cost ? currency : null, configuredFees: fees || null,
          productIdentityConfirmed: identity, denominationConfirmed: denomination, brandCountryConfirmed: brand, localOnlyAcknowledged: localAck, catalogFingerprint: fingerprint });
        setMappings((rows) => [...rows.filter((r) => r.skuId !== skuId), result]);
        setMessage(`已保存本地版本 ${result.version}；成本未验证，真实采购仍关闭。预估利润：${result.financials.estimatedProfit ?? "未知（缺成本、费用或可信汇率）"}`);
      } catch (err) { setMessage(err instanceof Error ? err.message : "保存失败"); } finally { setBusy(false); }
    }}>
      <label>商城 SKU<select aria-label="商城 SKU" required value={skuId} onChange={(e) => selectSku(e.target.value)} className="block min-h-[44px] w-full max-w-full rounded border bg-white px-2"><option value="">逐个选择 SKU</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.id})</option>)}</select></label>
      <p className="break-all text-sm">参考售价：{sku?.salePrice ?? "未知"} {sku?.saleCurrency ?? ""} · 来源 {sku?.source ?? "未选择"} · 当前版本 {current?.version ?? 0}</p>
      <label>面额模式<select aria-label="面额模式" value={mode} onChange={(e) => { setMode(e.target.value); clearReview(); }} className="block min-h-[44px] w-full rounded border"><option value="package">固定 Package ID</option><option value="range" disabled={!product.range}>Range Value（仅映射准备）</option></select></label>
      {mode === "package" ? <label>Package ID<select aria-label="Package ID" required value={packageId} onChange={(e) => { setPackageId(e.target.value); clearReview(); }} className="block min-h-[44px] w-full max-w-full rounded border"><option value="">选择准确套餐</option>{product.packages.map((p) => <option key={p.packageId} value={p.packageId}>{p.packageId} / {p.faceValue ?? p.valueLabel} {product.currency}</option>)}</select></label>
        : <label>Range Value<input aria-label="Range Value" required inputMode="decimal" value={rangeValue} onChange={(e) => { setRangeValue(e.target.value); clearReview(); }} className="block min-h-[44px] w-full rounded border px-2" /></label>}
      <label>配置采购成本（未验证，可空）<input aria-label="配置采购成本" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="block min-h-[44px] w-full rounded border px-2" /></label>
      <label>成本币种<input aria-label="成本币种" required={Boolean(cost)} value={currency} maxLength={3} pattern="[A-Z]{3}" onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="block min-h-[44px] w-full rounded border px-2" /></label>
      <label>同币种费用（未知留空）<input aria-label="配置费用" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} className="block min-h-[44px] w-full rounded border px-2" /></label>
      <label>人工审核说明<input aria-label="人工审核说明" required minLength={3} maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} className="block min-h-[44px] w-full rounded border px-2" /></label>
      <div className="space-y-2 text-sm sm:col-span-2">
        <label className="block"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> 标记为人工审核（不会启用采购）</label>
        <label className="block"><input type="checkbox" checked={identity} onChange={(e) => setIdentity(e.target.checked)} /> 已逐个核对供应商 Product ID 与商品身份</label>
        <label className="block"><input type="checkbox" checked={denomination} onChange={(e) => setDenomination(e.target.checked)} /> 已核对国家、面额币种和准确面值</label>
        <label className="block"><input type="checkbox" checked={brand} onChange={(e) => setBrand(e.target.checked)} /> Apple / Amazon US 品牌和使用地区已人工确认</label>
        <label className="block"><input type="checkbox" checked={localAck} onChange={(e) => setLocalAck(e.target.checked)} /> 确认仅保存本地配置，商业许可和真实成本仍未验证</label>
      </div>
      <button disabled={busy || loadError || !skuId} className="min-h-[44px] rounded-lg bg-orange-600 px-4 text-white disabled:opacity-50">保存本地映射</button>
    </form>
    {message ? <p role="status" className="break-all text-sm">{message}</p> : null}
    {current ? <p className="break-all text-xs">已保存：{current.productId} / {current.packageId ?? current.rangeValue} · {current.status} · 预估利润：{current.financials.estimatedProfit ?? "未验证 / 缺可信汇率"} · 实际采购成本：尚无真实记录</p> : null}
    <details><summary className="cursor-pointer py-2">新增本地 SKU 参考记录（例如 Amazon US，不创建线上 SKU）</summary>
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { const saved = await write("local-skus", { ...newSku, salePrice: newSku.salePrice || null }); setSkus((rows) => [...rows, saved]); setSkuId(saved.id); clearReview(); setMessage("本地 SKU 参考记录已保存，非 Production SKU"); }
        catch (err) { setMessage(err instanceof Error ? err.message : "本地 SKU 保存失败"); } finally { setBusy(false); }
      }}>
        {(["id", "title", "country", "denominationCurrency", "faceValue", "saleCurrency", "salePrice"] as const).map((field) => <label key={field}>{field}<input aria-label={`本地SKU ${field}`} required={field !== "salePrice"} value={newSku[field]} onChange={(e) => setNewSku((s) => ({ ...s, [field]: e.target.value }))} className="block min-h-[44px] w-full rounded border px-2" /></label>)}
        <label>品牌<select value={newSku.brand} onChange={(e) => setNewSku((s) => ({ ...s, brand: e.target.value }))} className="block min-h-[44px] w-full rounded border"><option>Amazon</option><option>Apple</option><option>Other</option></select></label>
        <button disabled={busy} className="min-h-[44px] rounded border px-3">新增本地 SKU</button>
      </form>
    </details>
  </section>;
}
