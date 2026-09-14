"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createProductSku, deleteProductSku, listProductSkus, updateProductSku,
  type AdminProduct, type AdminProductSku, type DeliveryType, type ProductSkuPayload, type ProductStatus,
} from "@/lib/supabase/admin-catalog";

type Draft = {
  sku_title: string; sku_code: string; price: number | string; original_price: string;
  stock: number | string; status: ProductStatus; delivery_type: DeliveryType | "";
  image_url: string; sort_order: number | string;
};
const emptyDraft = (): Draft => ({ sku_title: "", sku_code: "", price: 0, original_price: "", stock: 0, status: "active", delivery_type: "", image_url: "", sort_order: 0 });
const toDraft = (sku: AdminProductSku): Draft => ({ sku_title: sku.sku_title ?? "", sku_code: sku.sku_code ?? "", price: sku.price, original_price: sku.original_price == null ? "" : String(sku.original_price), stock: sku.stock, status: sku.status, delivery_type: sku.delivery_type ?? "", image_url: sku.image_url ?? "", sort_order: sku.sort_order });

export default function AdminProductSkuManager({ product, refreshKey = 0, onSupplierBinding }: { product: AdminProduct; refreshKey?: number; onSupplierBinding: (product: AdminProduct, sku: AdminProductSku) => void }) {
  const [skus, setSkus] = useState<AdminProductSku[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listProductSkus(product.id);
      setSkus(rows); setDrafts(Object.fromEntries(rows.map((sku) => [sku.id, toDraft(sku)])));
    } catch (error) { toast.error(error instanceof Error ? error.message : "SKU 读取失败"); }
    finally { setLoading(false); }
  }, [product.id]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  function payload(draft: Draft): ProductSkuPayload {
    return { ...draft, sku_title: draft.sku_title.trim(), sku_code: draft.sku_code.trim(), price: Number(draft.price), original_price: draft.original_price === "" ? null : Number(draft.original_price), stock: Number(draft.stock), sort_order: Number(draft.sort_order), delivery_type: draft.delivery_type || null, image_url: draft.image_url.trim() || null };
  }
  async function addSku() {
    if (!newDraft.sku_title.trim() || !newDraft.sku_code.trim()) return toast.error("请填写 SKU 名称和 SKU Code");
    setBusy("new");
    try { await createProductSku(product.id, payload(newDraft)); setNewDraft(emptyDraft()); toast.success("SKU 已新增"); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "SKU 新增失败"); }
    finally { setBusy(""); }
  }
  async function saveSku(sku: AdminProductSku) {
    const draft = drafts[sku.id]; if (!draft) return;
    setBusy(sku.id);
    try { await updateProductSku(product.id, sku.id, payload(draft)); toast.success("SKU 已保存"); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "SKU 保存失败"); }
    finally { setBusy(""); }
  }
  async function removeSku(sku: AdminProductSku) {
    if (!window.confirm(`确认删除 SKU“${sku.sku_title ?? sku.sku_code}”？若已有订单引用，服务端会阻止删除。`)) return;
    setBusy(sku.id);
    try { await deleteProductSku(product.id, sku.id); toast.success("SKU 已删除"); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "SKU 删除失败"); }
    finally { setBusy(""); }
  }

  return <div className="space-y-3">
    <div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-slate-950">SKU / 规格</div><p className="mt-1 text-xs text-slate-500">数据库 SKU 优先用于前台价格、库存和下单；可逐项绑定 Supplier SKU。</p></div><Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新</Button></div>
    {loading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在读取 SKU</div> : null}
    {!loading && skus.map((sku) => <SkuEditor key={sku.id} draft={drafts[sku.id]} metadata={sku.metadata} busy={busy === sku.id} onChange={(next) => setDrafts((current) => ({ ...current, [sku.id]: next }))} onSave={() => void saveSku(sku)} onDelete={() => void removeSku(sku)} onSupplier={() => onSupplierBinding(product, sku)} />)}
    {!loading && skus.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">当前商品没有数据库 SKU。</div> : null}
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="mb-2 text-xs font-semibold text-slate-700">新增 SKU</div><SkuFields draft={newDraft} onChange={setNewDraft} /><div className="mt-3 flex justify-end"><Button type="button" size="sm" onClick={() => void addSku()} disabled={busy === "new"}><Plus className="mr-1.5 h-3.5 w-3.5" />新增 SKU</Button></div></div>
  </div>;
}

function SkuEditor({ draft, metadata, busy, onChange, onSave, onDelete, onSupplier }: { draft?: Draft; metadata: Record<string, unknown> | null; busy: boolean; onChange: (draft: Draft) => void; onSave: () => void; onDelete: () => void; onSupplier: () => void }) {
  if (!draft) return null;
  const bound = metadata?.supplier === "daju";
  return <div className="rounded-xl border border-slate-200 p-3"><SkuFields draft={draft} onChange={onChange} /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{bound ? `已绑定大橘 SKU ${String(metadata?.supplier_sku ?? "待配置")}` : "未绑定供应商 SKU"}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={onSupplier}>供应商绑定</Button><Button type="button" size="sm" variant="outline" onClick={onSave} disabled={busy}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}保存</Button><Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={onDelete} disabled={busy}><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button></div></div></div>;
}

function SkuFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const set = (key: keyof Draft, value: string | number) => onChange({ ...draft, [key]: value });
  return <div className="grid gap-2 md:grid-cols-4">
    <Input aria-label="SKU 名称" placeholder="SKU 名称" value={draft.sku_title} onChange={(e) => set("sku_title", e.target.value)} />
    <Input aria-label="SKU Code" placeholder="SKU Code" value={draft.sku_code} onChange={(e) => set("sku_code", e.target.value)} />
    <Input aria-label="售价" type="number" min="0" step="0.01" placeholder="售价" value={draft.price} onChange={(e) => set("price", e.target.value)} />
    <Input aria-label="原价" type="number" min="0" step="0.01" placeholder="原价（可选）" value={draft.original_price} onChange={(e) => set("original_price", e.target.value)} />
    <Input aria-label="库存" type="number" min="0" step="1" placeholder="库存" value={draft.stock} onChange={(e) => set("stock", e.target.value)} />
    <select aria-label="SKU 状态" className="h-10 rounded-md border bg-white px-3 text-sm" value={draft.status} onChange={(e) => set("status", e.target.value as ProductStatus)}><option value="active">启用</option><option value="inactive">停用</option><option value="sold_out">售罄</option><option value="draft">草稿</option></select>
    <Input aria-label="排序" type="number" min="0" step="1" placeholder="排序" value={draft.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
    <select aria-label="SKU 交付方式" className="h-10 rounded-md border bg-white px-3 text-sm" value={draft.delivery_type} onChange={(e) => set("delivery_type", e.target.value as DeliveryType | "")}><option value="">继承商品</option><option value="manual">人工处理</option><option value="automatic">自动发货</option><option value="shipping">物流发货</option></select>
    <Input aria-label="SKU 图片" className="md:col-span-4" placeholder="SKU 图片 URL（可选）" value={draft.image_url} onChange={(e) => set("image_url", e.target.value)} />
  </div>;
}
