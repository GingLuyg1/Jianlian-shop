"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminProduct, AdminProductSku } from "@/lib/supabase/admin-catalog";

type KjProductItem = {
  id: string;
  title: string;
  price: string;
  currency?: string;
  stock: number;
  isAuto: boolean;
};

type KjSkuVariant = {
  id: string;
  sku: string;
  title: string;
  price: string;
  currency?: string;
  stock: number | null;
};

type KjProductDetail = KjProductItem & {
  description?: string | null;
  skuVariants?: KjSkuVariant[];
};

export default function KuajingZySkuBindingFields({
  product,
  sku,
  onSaved,
}: {
  product: AdminProduct;
  sku: AdminProductSku | null;
  onSaved: (saved: { product?: AdminProduct; sku?: AdminProductSku | null }) => void;
}) {
  const rawMeta = sku?.metadata ?? product.metadata;
  const meta = rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta) ? (rawMeta as Record<string, unknown>) : {};
  const isCurrentKj = meta.supplier === "kuajingzy";

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<KjProductItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [detail, setDetail] = useState<KjProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [supplierProductId, setSupplierProductId] = useState(isCurrentKj && meta.supplier_product_id ? String(meta.supplier_product_id) : "");
  const [supplierSku, setSupplierSku] = useState(isCurrentKj && meta.supplier_sku ? String(meta.supplier_sku) : "");
  const [supplierCost, setSupplierCost] = useState(isCurrentKj && meta.supplier_cost ? String(meta.supplier_cost) : "");
  const [maxUnitCost, setMaxUnitCost] = useState(isCurrentKj && meta.supplier_max_unit_cost ? String(meta.supplier_max_unit_cost) : "");
  const [minUnitProfit, setMinUnitProfit] = useState(isCurrentKj && meta.supplier_min_unit_profit ? String(meta.supplier_min_unit_profit) : "0.50");
  const [minMarginBps, setMinMarginBps] = useState(isCurrentKj && meta.supplier_min_margin_bps != null ? String(meta.supplier_min_margin_bps) : "3000");
  const [autoPurchaseEnabled, setAutoPurchaseEnabled] = useState(Boolean(isCurrentKj && meta.supplier_auto_purchase_enabled === true));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (supplierProductId) {
      void loadDetail(supplierProductId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchCatalog() {
    setSearching(true);
    setSearchError(null);
    try {
      const url = "/api/admin/suppliers/kuajingzy?resource=products" + (query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "");
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "跨境资源网商品目录读取失败");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setSearching(false);
    }
  }

  async function loadDetail(itemId: string, preserve = false) {
    if (!itemId.trim()) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/suppliers/kuajingzy?resource=product&id=${encodeURIComponent(itemId.trim())}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "商品详情读取失败");
      const prod = data.product as KjProductDetail;
      setDetail(prod);
      setSupplierProductId(String(prod.id));
      if (!preserve) {
        const firstVar = prod.skuVariants?.[0];
        if (firstVar) {
          setSupplierSku(firstVar.sku);
          setSupplierCost(firstVar.price);
          if (!maxUnitCost) setMaxUnitCost(firstVar.price);
        } else {
          setSupplierSku("");
          setSupplierCost(prod.price);
          if (!maxUnitCost) setMaxUnitCost(prod.price);
        }
      }
    } catch {
      // Allow manual ID binding even if upstream API key is not configured locally
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!supplierProductId.trim()) {
      toast.error("请填写或选择跨境资源网商品 ID");
      return;
    }
    if (!maxUnitCost.trim() || Number(maxUnitCost) <= 0) {
      toast.error("请填写有效的正数最高成本上限（CNY）");
      return;
    }
    if (autoPurchaseEnabled) {
      const confirmed = window.confirm(
        `确认开启「${product.name}」的跨境资源网自动采购开关？\n上游商品 ID：${supplierProductId.trim()}\n最高成本上限：¥${maxUnitCost.trim()} CNY\n开启后用户付款将直接自动向下游扣款下单。`
      );
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/suppliers/kuajingzy/bindings/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website_sku_id: sku?.id ?? null,
          supplier_product_id: supplierProductId.trim(),
          supplier_sku: supplierSku.trim() || null,
          supplier_cost: supplierCost.trim() || null,
          supplier_max_unit_cost: maxUnitCost.trim(),
          supplier_min_unit_profit: minUnitProfit.trim() || "0.50",
          supplier_min_margin_bps: Number(minMarginBps) || 3000,
          supplier_auto_purchase_enabled: autoPurchaseEnabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存跨境资源网绑定失败");
      toast.success("跨境资源网（KuajingZY）绑定已保存");
      onSaved({ product: data.product, sku: data.sku ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnbind() {
    if (!window.confirm("确认解除当前跨境资源网供应商绑定？")) return;
    setSaving(true);
    try {
      const url = `/api/admin/suppliers/kuajingzy/bindings/${product.id}${sku ? `?website_sku_id=${sku.id}` : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "解除绑定失败");
      toast.success("已解除跨境资源网绑定");
      onSaved({ product: data.product, sku: data.sku ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解除失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-5 space-y-4" aria-label="跨境资源网供应商绑定">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
        <div className="text-xs font-semibold text-slate-900">1. 搜索或拉取跨境资源网商品目录</div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchCatalog();
              }}
              placeholder="输入关键词搜索，或直接点右侧抓取目录"
              className="h-9 pl-8 text-xs bg-white"
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={searchCatalog} disabled={searching}>
            {searching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            抓取 / 搜索商品
          </Button>
        </div>

        {searchError ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            {searchError}（您也可以直接在下方手动填入已知的上游商品 ID 与规格编码保存绑定）
          </p>
        ) : null}

        {products.length > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-xs">
            {products.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void loadDetail(String(item.id), false)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50/60"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-slate-900 truncate">{item.title}</div>
                  <div className="font-mono text-[11px] text-slate-500">{item.id}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold text-emerald-700">¥{item.price}</div>
                  <div className="text-[10px] text-slate-500">库存 {item.stock}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-900">2. 配置跨境资源网商品与规格参数</div>
          {detailLoading ? <span className="text-xs text-slate-500">正在读取规格...</span> : null}
        </div>

        {detail && detail.skuVariants && detail.skuVariants.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs">点选上游商品规格（自动填入规格编码与进价）</Label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 max-h-40 overflow-y-auto p-1">
              {detail.skuVariants.map((v) => {
                const active = supplierSku === v.sku;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setSupplierSku(v.sku);
                      setSupplierCost(v.price);
                      setMaxUnitCost(v.price);
                    }}
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                      active ? "border-orange-500 bg-orange-50 font-semibold text-orange-950" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate pr-2">
                      {v.title} <span className="font-mono text-[11px] text-slate-500">(#{v.sku})</span>
                    </span>
                    <span className="shrink-0 font-mono text-emerald-700">¥{v.price}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">上游商品 ID (supplier_product_id) *</Label>
            <div className="mt-1 flex gap-1.5">
              <Input
                value={supplierProductId}
                onChange={(e) => setSupplierProductId(e.target.value)}
                placeholder="例如：imp_8f97c91003b23347934cb14e"
                className="h-9 font-mono text-xs"
              />
              <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 text-xs" onClick={() => void loadDetail(supplierProductId, false)}>
                读规格
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">上游规格编码 (supplier_sku)</Label>
            <Input
              value={supplierSku}
              onChange={(e) => setSupplierSku(e.target.value)}
              placeholder="例如：9（无子规格可留空）"
              className="mt-1 h-9 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">当前参考进价 (CNY)</Label>
            <Input
              value={supplierCost}
              onChange={(e) => setSupplierCost(e.target.value)}
              placeholder="例如：0.09"
              className="mt-1 h-9 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">最高允许采购单价上限 (supplier_max_unit_cost) *</Label>
            <Input
              value={maxUnitCost}
              onChange={(e) => setMaxUnitCost(e.target.value)}
              placeholder="例如：0.15"
              className="mt-1 h-9 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">最低单件利润保护 (CNY) *</Label>
            <Input
              value={minUnitProfit}
              onChange={(e) => setMinUnitProfit(e.target.value)}
              placeholder="例如：0.50"
              className="mt-1 h-9 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">最低毛利率基点 (bps，3000 = 30%) *</Label>
            <Input
              value={minMarginBps}
              onChange={(e) => setMinMarginBps(e.target.value)}
              placeholder="例如：3000"
              className="mt-1 h-9 font-mono text-xs"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={autoPurchaseEnabled}
            onChange={(e) => setAutoPurchaseEnabled(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span>开启此商品/SKU 的自动采购开关（supplier_auto_purchase_enabled）</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {isCurrentKj ? (
            <Button type="button" variant="destructive" size="sm" onClick={handleUnbind} disabled={saving}>
              解除绑定
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            保存跨境资源网绑定
          </Button>
        </div>
      </div>
    </section>
  );
}
