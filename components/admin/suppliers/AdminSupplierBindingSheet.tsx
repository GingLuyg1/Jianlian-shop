"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AdminProduct } from "@/lib/supabase/admin-catalog";
import type { DajuProduct, DajuProductDetail } from "@/lib/providers/daju/types";

type SupplierError = { message: string; code: string | null; requestId: string | null };
type BindingSavedProduct = { metadata?: Record<string, unknown> | null; delivery_type?: AdminProduct["delivery_type"] };

type Props = {
  open: boolean;
  product: AdminProduct | null;
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

export default function AdminSupplierBindingSheet({ open, product, onOpenChange, onSaved }: Props) {
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
  const [saveError, setSaveError] = useState<SupplierError | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    const metadata = product.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata) ? product.metadata : {};
    const existingProductId = Number(metadata.supplier_product_id);
    setQuery("");
    setProducts([]);
    setSearchLoaded(false);
    setSearchError(null);
    setDetail(null);
    setDetailError(null);
    setSupplierSku(readString(metadata, "supplier_sku"));
    setMaxUnitCost(readString(metadata, "supplier_max_unit_cost"));
    setInputsMapping(readMapping(metadata));
    setSaveError(null);

    if (metadata.fulfillment_source === "supplier" && metadata.supplier === "daju" && Number.isSafeInteger(existingProductId) && existingProductId > 0) {
      void loadDetail(existingProductId, true);
    }
    // Product identity is sufficient to reset the sheet for a newly opened row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

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
    if (!window.confirm(`确认将商品“${product.name}”绑定到 Daju 商品 #${detail.id}？保存后 delivery_type 将设为 automatic，自动履约将按该供应商配置执行，成本上限为 ¥${maxUnitCost.trim()}。`)) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/admin/suppliers/daju/bindings/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_product_id: detail.id,
          supplier_sku: supplierSku.trim() || null,
          supplier_inputs_mapping: supplierInputsMapping,
          supplier_max_unit_cost: maxUnitCost.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商绑定保存失败");
      toast.success("供应商绑定已保存");
      onSaved(payload.product as BindingSavedProduct);
      onOpenChange(false);
    } catch (error) {
      setSaveError(error && typeof error === "object" && "message" in error ? error as SupplierError : { message: "供应商绑定保存失败", code: null, requestId: null });
    } finally {
      setSaving(false);
    }
  }

  const metadata = product?.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata) ? product.metadata : {};
  const currentSupplier = metadata.fulfillment_source === "supplier" ? readString(metadata, "supplier") : "";
  const currentSupplierProductId = readString(metadata, "supplier_product_id");
  const missingRequiredInputs = detail?.requiredInputs.filter((field) => !ORDER_FIELD_VALUES.has((inputsMapping[field] ?? "").trim())) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader><SheetTitle>供应商绑定</SheetTitle><SheetDescription>将网站商品关联到已接入的供应商商品；当前版本仅支持 Daju。</SheetDescription></SheetHeader>
        {product ? (
          <div className="mt-5 space-y-5">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{product.name}</div><div className="mt-1 font-mono text-xs text-slate-500">{product.id}</div></div><Badge variant={currentSupplier === "daju" ? "secondary" : "outline"}>{currentSupplier === "daju" ? "已绑定：大橘AI" : currentSupplier ? `已绑定：${currentSupplier}` : "未绑定"}</Badge></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div>当前售价：¥{product.price.toFixed(2)}</div><div>交付方式：{product.delivery_type}</div><div>供应商：大橘AI / daju</div><div>当前 Supplier Product ID：{currentSupplierProductId || "—"}</div></div></section>

            <section><div className="mb-2 text-sm font-semibold text-slate-950">1. 搜索并选择供应商商品</div><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchProducts(); }} placeholder="输入 Daju 商品名称" /></div><Button onClick={searchProducts} disabled={searching}>{searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}搜索</Button></div>
              {searchError ? <SupplierErrorCard error={searchError} /> : searching ? <AdminTableSkeleton rows={4} className="mt-2" /> : searchLoaded && products.length === 0 ? <AdminEmptyState className="mt-2 min-h-[150px]" title="没有匹配的供应商商品" /> : products.length ? <div className="mt-2 max-h-56 overflow-auto rounded-xl border"><div className="divide-y">{products.map((item) => <button key={item.id} type="button" onClick={() => loadDetail(item.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-950">{item.title}</div><div className="mt-1 text-xs text-slate-500">#{item.id} · 库存 {item.stock} · 销量 {item.sales}</div></div><div className="shrink-0 text-sm font-medium">¥{item.price}</div></button>)}</div></div> : null}
            </section>

            <section><div className="mb-2 text-sm font-semibold text-slate-950">2. 核对商品详情与绑定参数</div>{detailLoading ? <AdminTableSkeleton rows={5} /> : detailError ? <SupplierErrorCard error={detailError} /> : detail ? <div className="space-y-4 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{detail.title}</div><div className="mt-1 text-xs text-slate-500">Supplier Product ID：{detail.id}</div></div><Badge variant="secondary">已选择</Badge></div><div className="grid gap-3 text-sm sm:grid-cols-3"><Metric label="供应商价格" value={`¥${detail.price}`} /><Metric label="库存" value={String(detail.stock)} /><Metric label="数量范围" value={`${detail.minQty} - ${detail.maxQty}`} /></div><div className="text-sm">SKU 商品：{detail.isSku ? "是" : "否"}</div>
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-sku">Supplier SKU（可选）</Label><Input id="supplier-sku" value={supplierSku} onChange={(event) => setSupplierSku(event.target.value)} placeholder="请按供应商 SKU 原始数据人工确认" /></div><div className="space-y-2"><Label htmlFor="supplier-cost-limit">供应商成本上限</Label><Input id="supplier-cost-limit" value={maxUnitCost} onChange={(event) => setMaxUnitCost(event.target.value)} inputMode="decimal" /><p className="text-xs text-slate-500">供应商实际单价超过此成本上限时，自动采购会被阻止。当前价格 ¥{detail.price}，成本上限 ¥{maxUnitCost || "—"}。</p></div></div>
              {!detail.isAuto ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">该供应商商品不支持自动交付，不能绑定到自动履约商品。</div> : null}
              <div><div className="text-sm font-medium text-slate-900">订单字段映射</div>{detail.requiredInputs.length ? <div className="mt-2 space-y-3">{detail.requiredInputs.map((field) => <div key={field} className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center"><div className="font-mono text-sm text-slate-700">{field}</div><select value={inputsMapping[field] ?? ""} onChange={(event) => setInputsMapping((current) => ({ ...current, [field]: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">不配置</option>{ORDER_FIELD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}（{option.value}）</option>)}</select></div>)}</div> : <p className="mt-2 text-sm text-slate-500">该商品没有 requiredInputs，将提交空映射。</p>}</div>
              {missingRequiredInputs.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">以下供应商必填字段尚未映射：{missingRequiredInputs.join("、")}</div> : null}
              <ReadOnlyJson title="Required Inputs 原始数据" value={detail.requiredInputs} /><ReadOnlyJson title="SKU 原始数据" value={detail.skuVariants} /><ReadOnlyJson title="规格原始数据" value={detail.specs} />
            </div> : <AdminEmptyState className="min-h-[160px]" title="尚未选择供应商商品" description="先搜索并选择一个真实供应商商品。" />}</section>

            {saveError ? <SupplierErrorCard error={saveError} /> : null}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">当前版本仅支持绑定或更新绑定；解绑需要独立、受审计的后端操作。</div>
          </div>
        ) : <AdminErrorState title="未选择网站商品" description="请关闭后从商品列表重新打开。" />}

        <SheetFooter className="mt-6 gap-2 sm:space-x-0"><Button asChild variant="outline"><Link href="/admin/suppliers">打开供应商中心<ExternalLink className="ml-2 h-4 w-4" /></Link></Button><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={saveBinding} disabled={saving || !detail || !detail.isAuto || missingRequiredInputs.length > 0}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}保存供应商绑定</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SupplierErrorCard({ error }: { error: SupplierError }) {
  return <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><div>{error.message}</div>{error.code ? <div className="mt-1 text-xs">错误代码：<span className="font-mono">{error.code}</span></div> : null}{error.requestId ? <div className="mt-1 text-xs">Request ID：<span className="font-mono">{error.requestId}</span></div> : null}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-950">{value}</div></div>;
}

function ReadOnlyJson({ title, value }: { title: string; value: unknown }) {
  return <details><summary className="cursor-pointer text-sm font-medium text-slate-700">{title}</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(value, null, 2)}</pre></details>;
}
