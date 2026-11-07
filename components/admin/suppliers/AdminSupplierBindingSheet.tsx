"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import glass from "@/components/admin/v2/AdminPremiumGlass.module.css";
import { cn } from "@/lib/utils";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AdminProduct } from "@/lib/supabase/admin-catalog";
import type { AdminProductSku } from "@/lib/supabase/admin-catalog";
import type { DajuProduct, DajuProductDetail } from "@/lib/providers/daju/types";
import { listDajuSkuStockOptions } from "@/lib/providers/daju/stock.mjs";
import BitrefillSkuBindingFields from "./BitrefillSkuBindingFields";

type SupplierError = { message: string; code: string | null; requestId: string | null };
type BindingSavedProduct = { metadata?: Record<string, unknown> | null; delivery_type?: AdminProduct["delivery_type"]; stock?: number; sku?: AdminProductSku | null };

type Props = {
  open: boolean;
  product: AdminProduct | null;
  sku?: AdminProductSku | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: BindingSavedProduct) => void;
};

const ORDER_FIELD_OPTIONS = [
  { value: "customer_email", label: "客户邮箱" },
  { value: "customer_name", label: "客户姓名" },
  { value: "customer_phone", label: "客户电话" },
  { value: "customer_note", label: "客户备注" },
] as const;

const ORDER_FIELD_VALUES = new Set<string>(ORDER_FIELD_OPTIONS.map((option) => option.value));

function readString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function readMapping(metadata: Record<string, unknown>) {
  const value = metadata.supplier_inputs_mapping;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && ORDER_FIELD_VALUES.has(entry[1])));
}

function getSupplierError(payload: unknown, fallback: string): SupplierError {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : null;
  return {
    message: code === "INVALID_IP"
      ? "供应商拒绝当前服务器 IP / API 访问"
      : typeof record.error === "string" && record.error.trim() ? record.error : fallback,
    code,
    requestId: typeof record.requestId === "string" ? record.requestId : null,
  };
}

export default function AdminSupplierBindingSheet({ open, product, sku = null, onOpenChange, onSaved }: Props) {
  const [provider, setProvider] = useState("daju");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<DajuProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [searchError, setSearchError] = useState<SupplierError | null>(null);
  const [detail, setDetail] = useState<DajuProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<SupplierError | null>(null);
  const [supplierSku, setSupplierSku] = useState("");
  const [maxUnitCost, setMaxUnitCost] = useState("");
  const [inputsMapping, setInputsMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !product) return;
    const sourceMetadata = sku?.metadata ?? product.metadata;
    const metadata = sourceMetadata && typeof sourceMetadata === "object" && !Array.isArray(sourceMetadata) ? sourceMetadata : {};
    const existingProductId = Number(metadata.supplier_product_id);
    setProvider(metadata.supplier === "bitrefill" || metadata.supplier_binding_candidate ? "bitrefill" : "daju");
    setQuery("");
    setProducts([]);
    setSearchLoaded(false);
    setSearchError(null);
    setDetail(null);
    setDetailError(null);
    setSupplierSku(readString(metadata, "supplier_sku"));
    setMaxUnitCost(readString(metadata, "supplier_max_unit_cost"));
    setInputsMapping(readMapping(metadata));

    if (metadata.fulfillment_source === "supplier" && metadata.supplier === "daju" && Number.isSafeInteger(existingProductId) && existingProductId > 0) {
      void loadDetail(existingProductId, true);
    }
    // Product identity is sufficient to reset the sheet for a newly opened row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, sku?.id]);

  async function searchProducts() {
    setSearching(true);
    setSearchError(null);
    try {
      const url = "/api/admin/suppliers/daju?resource=products" + (query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "");
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商商品搜索失败");
      setProducts(Array.isArray(payload.products) ? payload.products : []);
      setSearchLoaded(true);
    } catch (error) {
      setProducts([]);
      setSearchLoaded(true);
      setSearchError(error && typeof error === "object" && "message" in error ? error as SupplierError : { message: "供应商商品搜索失败", code: null, requestId: null });
    } finally {
      setSearching(false);
    }
  }

  async function loadDetail(productId: number, preserveExisting = false) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/admin/suppliers/daju?resource=product&id=${productId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商商品详情读取失败");
      const selected = payload.product as DajuProductDetail;
      setDetail(selected);
      if (!preserveExisting) {
        setSupplierSku("");
        setMaxUnitCost(selected.price);
        setInputsMapping({});
      }
    } catch (error) {
      setDetail(null);
      setDetailError(error && typeof error === "object" && "message" in error ? error as SupplierError : { message: "供应商商品详情读取失败", code: null, requestId: null });
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveBinding() {
    if (!product || !detail) {
      toast.error("请先选择并读取供应商商品详情");
      return;
    }
    if (!detail.isAuto) {
      toast.error("该供应商商品不支持自动交付，不能绑定到自动履约商品。");
      return;
    }
    if (detail.isSku && !supplierSku.trim()) {
      toast.error("该供应商商品包含商品规格，请先选择明确的 供应商商品规格。");
      return;
    }
    const missingRequiredInputs = detail.requiredInputs.filter((field) => !ORDER_FIELD_VALUES.has((inputsMapping[field] ?? "").trim()));
    if (missingRequiredInputs.length > 0) {
      toast.error(`以下供应商必填字段尚未映射：${missingRequiredInputs.join("、")}`);
      return;
    }
    if (!maxUnitCost.trim() || !Number.isFinite(Number(maxUnitCost)) || Number(maxUnitCost) <= 0) {
      toast.error("请填写有效的供应商成本上限");
      return;
    }
    const supplierInputsMapping = Object.fromEntries(
      detail.requiredInputs.map((field) => [field, (inputsMapping[field] ?? "").trim()]).filter((entry) => entry[1])
    );
    if (!window.confirm(`确认将商品“${product.name}”绑定到 Daju 商品 #${detail.id}？保存后 delivery_type 将设为 自动交付，自动履约将按该供应商配置执行，成本上限为 ¥${maxUnitCost.trim()}。`)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/suppliers/daju/bindings/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_product_id: detail.id,
          supplier_sku: supplierSku.trim() || null,
          supplier_inputs_mapping: supplierInputsMapping,
          supplier_max_unit_cost: maxUnitCost.trim(),
          website_sku_id: sku?.id ?? null,
          ...(sku ? { expected_updated_at: sku.updated_at } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商绑定保存失败");
      toast.success("供应商绑定已保存");
      onSaved({
        ...(payload.product && typeof payload.product === "object" ? payload.product : {}),
        sku: payload.sku && typeof payload.sku === "object" ? payload.sku as AdminProductSku : null,
      } as BindingSavedProduct);
      onOpenChange(false);
    } catch (error) {
      toast.error(error && typeof error === "object" && "message" in error ? String(error.message) : "供应商绑定保存失败");
    } finally {
      setSaving(false);
    }
  }

  const sourceMetadata = sku?.metadata ?? product?.metadata;
  const metadata = sourceMetadata && typeof sourceMetadata === "object" && !Array.isArray(sourceMetadata) ? sourceMetadata : {};
  const currentSupplier = metadata.fulfillment_source === "supplier" ? readString(metadata, "supplier") : "";
  const currentSupplierProductId = readString(metadata, "supplier_product_id");
  const missingRequiredInputs = detail?.requiredInputs.filter((field) => !ORDER_FIELD_VALUES.has((inputsMapping[field] ?? "").trim())) ?? [];
  const supplierSkuOptions = detail ? listDajuSkuStockOptions(detail) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={glass.supplierSheet}>
        <SheetHeader className={glass.supplierHeader}>
          <SheetTitle className="text-xl text-slate-900">供应商绑定</SheetTitle>
          <SheetDescription>选择供货来源，核对商品、规格和成本后保存。</SheetDescription>
        </SheetHeader>
        <div className={glass.supplierBody}>
          {product ? (
            <>
              <section className={glass.supplierSummary}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-slate-900">{product.name}</h2>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {sku ? `${sku.sku_title ?? sku.sku_code} · ${sku.id}` : product.id}
                    </p>
                  </div>
                  <Badge variant="outline">{currentSupplier === "daju" ? "已绑定：大橘AI" : currentSupplier ? `已绑定：${currentSupplier}` : "未绑定"}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div><dt className="text-slate-500">当前售价</dt><dd className="mt-1 font-semibold text-slate-900">¥{(sku?.price ?? product.price).toFixed(2)}</dd></div>
                  <div><dt className="text-slate-500">绑定层级</dt><dd className="mt-1">{sku ? "网站商品规格" : "商品"}</dd></div>
                  <div><dt className="text-slate-500">当前供应商</dt><dd className="mt-1">{currentSupplier || "尚未绑定"}</dd></div>
                  <div><dt className="text-slate-500">当前供应商商品 ID</dt><dd className="mt-1 break-all">{currentSupplierProductId || "—"}</dd></div>
                </dl>
              </section>

              <div className={glass.providerTabs} role="group" aria-label="选择供应商">
                {[
                  { value: "daju", name: "大橘 AI", note: "Daju · 商品与规格绑定" },
                  { value: "bitrefill", name: "Bitrefill", note: "仅保存待审核候选，不启用" },
                ].map(option => (
                  <button key={option.value} type="button" aria-pressed={provider === option.value} disabled={saving} onClick={() => setProvider(option.value)}>
                    <span><span className="block text-sm font-semibold">{option.name}</span><span className="mt-1 block text-xs">{option.note}</span></span>
                    {provider === option.value ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>

              {provider === "bitrefill" ? (
                sku ? (
                  <div className="mt-5">
                    <BitrefillSkuBindingFields
                      key={`${product.id}:${sku.id}`}
                      product={product}
                      sku={sku}
                      onSaved={saved => {
                        onSaved({ sku: saved.sku });
                        toast.success("Bitrefill 候选已保存，原采购来源未改变");
                        onOpenChange(false);
                      }}
                    />
                  </div>
                ) : (
                  <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Bitrefill 仅允许逐个商品规格绑定，请从商品规格行打开。
                  </p>
                )
              ) : (
                <>
                  <div className={glass.supplierColumns}>
                    <section aria-label="搜索并选择供应商商品">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">1. 选择供应商商品</h3>
                      <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                          <Input
                            className="pl-9"
                            aria-label="搜索 Daju 商品"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            onKeyDown={event => { if (event.key === "Enter") void searchProducts(); }}
                            placeholder="名称或关键词"
                          />
                        </div>
                        <Button className={glass.primary} onClick={searchProducts} disabled={searching}>
                          {searching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}搜索
                        </Button>
                      </div>
                      {searchError ? <SupplierErrorCard error={searchError} /> : searching ? (
                        <AdminTableSkeleton rows={4} className="mt-3" />
                      ) : searchLoaded && products.length === 0 ? (
                        <AdminEmptyState className="mt-3 min-h-[180px]" title="没有匹配的供应商商品" />
                      ) : products.length ? (
                        <div className={glass.supplierResults}>
                          {products.map(item => (
                            <button key={item.id} type="button" aria-pressed={detail?.id === item.id} onClick={() => loadDetail(item.id)}>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-900" title={item.title}>{item.title}</span>
                                <span className="mt-1 block text-xs text-slate-500">#{item.id} · 库存 {item.stock} · 销量 {item.sales}</span>
                              </span>
                              <span className="shrink-0 text-sm font-semibold text-slate-700">¥{item.price}</span>
                            </button>
                          ))}
                        </div>
                      ) : <AdminEmptyState className="min-h-[200px]" title="搜索供应商商品" description="输入名称后选择需要绑定的供货商品。" />}
                    </section>

                    <section aria-label="核对商品详情与绑定参数">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">2. 核对详情与绑定参数</h3>
                      {detailLoading ? <AdminTableSkeleton rows={5} /> : detailError ? <SupplierErrorCard error={detailError} /> : detail ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div><h4 className="font-semibold text-slate-900">{detail.title}</h4><p className="mt-1 text-xs text-slate-500">供应商商品 ID：{detail.id}</p></div>
                            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">已选择</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <Metric label="供应商价格" value={`¥${detail.price}`} />
                            <Metric label="库存" value={String(detail.stock)} />
                            <Metric label="数量范围" value={`${detail.minQty} – ${detail.maxQty}`} />
                          </div>
                          <p className="text-xs text-slate-500">商品规格商品：{detail.isSku ? "是" : "否"}</p>
                          <div className="space-y-2">
                            <Label htmlFor="supplier-sku">供应商商品规格{detail.isSku ? "（必选）" : "（可选）"}</Label>
                            {supplierSkuOptions.length ? (
                              <div className="grid gap-2">
                                {supplierSkuOptions.map(option => (
                                  <button
                                    type="button" key={option.sku} aria-pressed={supplierSku === option.sku}
                                    onClick={() => { setSupplierSku(option.sku); if (option.price) setMaxUnitCost(option.price); }}
                                    className={cn("w-full rounded-xl border p-3 text-left text-sm", supplierSku === option.sku ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50")}
                                  >
                                    <span className="block font-medium text-slate-900">{option.title}</span>
                                    <span className="mt-1 block text-xs text-slate-500">规格 {option.sku} · 成本 {option.price ? `¥${option.price}` : "—"} · 库存 {option.stock}</span>
                                  </button>
                                ))}
                              </div>
                            ) : <Input id="supplier-sku" value={supplierSku} onChange={event => setSupplierSku(event.target.value)} placeholder="按供应商原始规格数据确认" />}
                            {detail.isSku && !supplierSku.trim() ? <p className="text-xs text-amber-700">必须明确选择供应商规格，不能使用商品总库存。</p> : null}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="supplier-cost-limit">供应商成本上限</Label>
                            <Input id="supplier-cost-limit" value={maxUnitCost} onChange={event => setMaxUnitCost(event.target.value)} inputMode="decimal" />
                            <p className="text-xs leading-5 text-slate-500">实际单价超过此上限时阻止自动采购。当前价格 ¥{detail.price}，上限 ¥{maxUnitCost || "—"}。</p>
                          </div>
                          {!detail.isAuto ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">该供应商商品不支持自动交付，不能绑定到自动履约商品。</div> : null}
                          {detail.id === 15 && supplierSkuOptions.some(option => option.sku === "14") ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Daju #15 / 规格 #14 须确认网站零售价、展示规格和公开销售方案后单独绑定，不得继承父商品映射或总库存。</div>
                          ) : null}
                          <div>
                            <h4 className="text-sm font-medium text-slate-900">订单字段映射</h4>
                            {detail.requiredInputs.length ? (
                              <div className="mt-2 space-y-3">
                                {detail.requiredInputs.map(field => (
                                  <label key={field} className="grid min-w-0 gap-2 text-sm">
                                    <span className="break-all font-mono text-slate-600">{field}</span>
                                    <select value={inputsMapping[field] ?? ""} onChange={event => setInputsMapping(current => ({ ...current, [field]: event.target.value }))} className="h-10 w-full rounded-lg border px-3 text-sm">
                                      <option value="">不配置</option>
                                      {ORDER_FIELD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}（{option.value}）</option>)}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            ) : <p className="mt-2 text-xs text-slate-500">该商品无需额外订单信息，将提交空映射。</p>}
                          </div>
                          {missingRequiredInputs.length > 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">必填字段尚未映射：{missingRequiredInputs.join("、")}</p> : null}
                          <div className="space-y-2 border-t border-slate-100 pt-3">
                            <ReadOnlyJson title="需填写的信息原始数据" value={detail.requiredInputs} />
                            <ReadOnlyJson title="商品规格原始数据" value={detail.skuVariants} />
                            <ReadOnlyJson title="规格原始数据" value={detail.specs} />
                          </div>
                        </div>
                      ) : <AdminEmptyState className="min-h-[240px]" title="尚未选择供应商商品" description="从左侧搜索结果中选择商品，核对详情。" />}
                    </section>
                  </div>
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    当前仅支持绑定或更新绑定；解绑须使用独立、受审计的后端操作。
                  </p>
                </>
              )}
            </>
          ) : <AdminErrorState title="未选择网站商品" description="请关闭后从商品列表重新打开。" />}
        </div>
        <SheetFooter className={glass.supplierFooter}>
          <Button asChild variant="outline" className={glass.secondary}><Link href="/admin/suppliers">供应商中心<ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
          <Button variant="outline" className={glass.secondary} onClick={() => onOpenChange(false)}>取消</Button>
          {provider === "daju" ? (
            <Button className={glass.primary} onClick={saveBinding} disabled={saving || !detail || !detail.isAuto || (detail.isSku && !supplierSku.trim()) || missingRequiredInputs.length > 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}保存供应商绑定
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
function SupplierErrorCard({ error }: { error: SupplierError }) {
  return <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><div>{error.message}</div>{error.code ? <div className="mt-1 text-xs">错误代码：<span className="font-mono">{error.code}</span></div> : null}{error.requestId ? <div className="mt-1 text-xs">请求追踪编号：<span className="font-mono">{error.requestId}</span></div> : null}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-950">{value}</div></div>;
}

function ReadOnlyJson({ title, value }: { title: string; value: unknown }) {
  return <details><summary className="cursor-pointer text-sm font-medium text-slate-700">{title}</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(value, null, 2)}</pre></details>;
}
