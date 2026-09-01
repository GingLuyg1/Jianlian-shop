"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Factory, Loader2, PackageSearch, RefreshCcw, Search } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { supplierUiRegistry } from "@/components/admin/suppliers/supplier-ui-registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DajuBalance, DajuProduct, DajuProductDetail } from "@/lib/providers/daju/types";

type SupplierError = {
  message: string;
  code: string | null;
  requestId: string | null;
};

type DetectionState = {
  status: "idle" | "checking" | "connected" | "failed";
  checkedAt: string | null;
  error: SupplierError | null;
};

const dajuDefinition = supplierUiRegistry[0];

function formatTime(value: string | null) {
  if (!value) return "尚未检测";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getSupplierError(payload: unknown, fallback: string): SupplierError {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : null;
  const requestId = typeof record.requestId === "string" ? record.requestId : null;
  const serviceMessage = typeof record.error === "string" && record.error.trim() ? record.error.trim() : fallback;
  return {
    message: code === "INVALID_IP" ? "供应商拒绝当前服务器 IP / API 访问" : serviceMessage,
    code,
    requestId,
  };
}

function SupplierErrorDetails({ error }: { error: SupplierError }) {
  return (
    <div className="space-y-1 text-sm">
      <div>{error.message}</div>
      {error.code ? <div className="text-xs">错误代码：<span className="font-mono">{error.code}</span></div> : null}
      {error.requestId ? <div className="text-xs">Request ID：<span className="font-mono">{error.requestId}</span></div> : null}
    </div>
  );
}

export default function AdminSuppliersWorkspace() {
  const [balance, setBalance] = useState<DajuBalance | null>(null);
  const [detection, setDetection] = useState<DetectionState>({ status: "idle", checkedAt: null, error: null });
  const [activeArea, setActiveArea] = useState<"overview" | "products">("overview");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<DajuProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productsError, setProductsError] = useState<SupplierError | null>(null);
  const [detail, setDetail] = useState<DajuProductDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<SupplierError | null>(null);

  const checkConnection = useCallback(async () => {
    setDetection((current) => ({ ...current, status: "checking", error: null }));
    try {
      const response = await fetch("/api/admin/suppliers/daju?resource=balance", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商连接检测失败");
      setBalance(payload.balance as DajuBalance);
      setDetection({ status: "connected", checkedAt: new Date().toISOString(), error: null });
    } catch (error) {
      const nextError = error && typeof error === "object" && "message" in error
        ? error as SupplierError
        : { message: "供应商连接检测失败", code: null, requestId: null };
      setBalance(null);
      setDetection({ status: "failed", checkedAt: new Date().toISOString(), error: nextError });
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const url = "/api/admin/suppliers/daju?resource=products" + (query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "");
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商商品目录读取失败");
      setProducts(Array.isArray(payload.products) ? payload.products : []);
      setProductsLoaded(true);
    } catch (error) {
      const nextError = error && typeof error === "object" && "message" in error
        ? error as SupplierError
        : { message: "供应商商品目录读取失败", code: null, requestId: null };
      setProducts([]);
      setProductsLoaded(true);
      setProductsError(nextError);
    } finally {
      setProductsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  useEffect(() => {
    if (activeArea === "products" && !productsLoaded) void loadProducts();
  }, [activeArea, loadProducts, productsLoaded]);

  async function openProductDetail(productId: number) {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/suppliers/daju?resource=product&id=${productId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商商品详情读取失败");
      setDetail(payload.product as DajuProductDetail);
    } catch (error) {
      setDetailError(error && typeof error === "object" && "message" in error
        ? error as SupplierError
        : { message: "供应商商品详情读取失败", code: null, requestId: null });
    } finally {
      setDetailLoading(false);
    }
  }

  const statusPresentation = detection.status === "connected"
    ? { label: "连接正常", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="h-4 w-4" /> }
    : detection.status === "failed"
      ? { label: "连接失败", className: "border-red-200 bg-red-50 text-red-700", icon: <AlertTriangle className="h-4 w-4" /> }
      : detection.status === "checking"
        ? { label: "检测中", className: "border-blue-200 bg-blue-50 text-blue-700", icon: <Loader2 className="h-4 w-4 animate-spin" /> }
        : { label: "未检测", className: "border-slate-200 bg-slate-50 text-slate-600", icon: <Factory className="h-4 w-4" /> };

  return (
    <AdminPageShell
      title="供应商管理"
      description="管理供应商连接状态、余额、商品目录和商品履约绑定。"
      actions={<Button asChild variant="outline"><Link href="/admin/products">前往商品管理<ExternalLink className="ml-2 h-4 w-4" /></Link></Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <nav className="flex shrink-0 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="供应商工作区">
          <Button variant={activeArea === "overview" ? "default" : "ghost"} size="sm" onClick={() => setActiveArea("overview")}>供应商概览</Button>
          <Button variant={activeArea === "products" ? "default" : "ghost"} size="sm" onClick={() => setActiveArea("products")}>商品目录</Button>
        </nav>

        {activeArea === "overview" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Factory className="h-5 w-5" /></div>
                  <div><h2 className="text-lg font-semibold text-slate-950">{dajuDefinition.name}</h2><div className="mt-1 text-xs text-slate-500">供应商代码：<span className="font-mono">{dajuDefinition.code}</span></div></div>
                </div>
                <Badge variant="outline" className={`gap-1.5 ${statusPresentation.className}`}>{statusPresentation.icon}{statusPresentation.label}</Badge>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Metric label="可用余额" value={balance ? `¥${balance.balance}` : "—"} />
                <Metric label="累计消费" value={balance?.totalSpent ? `¥${balance.totalSpent}` : "—"} />
                <Metric label="累计订单" value={balance ? String(balance.totalOrders) : "—"} />
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-medium text-slate-900">最近一次检测</div><div className="mt-1 text-xs text-slate-500">{formatTime(detection.checkedAt)}</div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={checkConnection} disabled={detection.status === "checking"}><RefreshCcw className={`mr-2 h-4 w-4 ${detection.status === "checking" ? "animate-spin" : ""}`} />检测连接 / 刷新余额</Button><Button size="sm" onClick={() => setActiveArea("products")}>浏览商品</Button></div></div>
                {detection.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"><SupplierErrorDetails error={detection.error} /></div> : null}
              </div>

              <div className="mt-5"><div className="text-sm font-semibold text-slate-950">已接入能力</div><div className="mt-2 flex flex-wrap gap-2">{dajuDefinition.capabilities.map((capability) => <Badge key={capability} variant="secondary">{capability}</Badge>)}</div><p className="mt-3 text-xs text-slate-500">此处仅为运营展示；实际履约路由仍由服务端 Supplier Registry 决定。</p></div>
            </section>
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-100 p-3">
              <div className="relative min-w-[280px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadProducts(); }} className="pl-9" placeholder="搜索供应商商品" /></div>
              <Button onClick={loadProducts} disabled={productsLoading}>{productsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}搜索</Button>
              <Button variant="outline" onClick={loadProducts} disabled={productsLoading}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>
            </div>
            {productsError ? <AdminErrorState title="供应商商品目录不可用" description={productsError.message} action={<div className="text-left text-red-700"><SupplierErrorDetails error={productsError} /></div>} /> : productsLoading ? <AdminTableSkeleton rows={8} /> : products.length === 0 ? <AdminEmptyState icon={<PackageSearch className="h-5 w-5" />} title={query.trim() ? "没有匹配的供应商商品" : "供应商商品目录为空"} description="请调整搜索关键词或稍后刷新。" /> : (
              <div className="min-h-0 flex-1 overflow-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">供应商商品</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">价格</th><th className="px-4 py-3">库存</th><th className="px-4 py-3">销量</th><th className="px-4 py-3">自动交付</th><th className="px-4 py-3">排序 ID</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product) => <tr key={product.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100"><PackageSearch className="h-4 w-4 text-slate-400" /></div><div className="min-w-0"><div className="max-w-[360px] truncate font-medium text-slate-950" title={product.title}>{product.title}</div><div className="max-w-[360px] truncate text-xs text-slate-500" title={product.cover ?? ""}>Cover：{product.cover || "—"}</div></div></div></td><td className="px-4 py-3 font-mono text-xs">{product.id}</td><td className="px-4 py-3 tabular-nums">¥{product.price}</td><td className="px-4 py-3 tabular-nums">{product.stock}</td><td className="px-4 py-3 tabular-nums">{product.sales}</td><td className="px-4 py-3"><Badge variant={product.isAuto ? "secondary" : "outline"}>{product.isAuto ? "是" : "否"}</Badge></td><td className="px-4 py-3">{product.sortId ?? "—"}</td><td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => openProductDetail(product.id)}>查看详情</Button></td></tr>)}</tbody></table></div>
            )}
          </section>
        )}
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader><SheetTitle>供应商商品详情</SheetTitle><SheetDescription>详情来自本站 Admin API 返回的实时供应商数据。</SheetDescription></SheetHeader>
          {detailLoading ? <AdminTableSkeleton rows={7} className="mt-4" /> : detailError ? <AdminErrorState title="商品详情读取失败" description={detailError.message} action={<SupplierErrorDetails error={detailError} />} /> : detail ? <div className="mt-5 space-y-4"><div><h3 className="font-semibold text-slate-950">{detail.title}</h3><div className="mt-1 font-mono text-xs text-slate-500">ID {detail.id}</div><div className="mt-2 text-sm">¥{detail.price} · 库存 {detail.stock} · 销量 {detail.sales}</div><div className="mt-2 break-all text-xs text-slate-500">Cover：{detail.cover || "—"}</div></div><DetailGrid detail={detail} /><ReadOnlyJson title="Required Inputs" value={detail.requiredInputs} /><ReadOnlyJson title="规格原始数据" value={detail.specs} /><ReadOnlyJson title="SKU 原始数据" value={detail.skuVariants} />{detail.description ? <div><div className="text-sm font-medium text-slate-900">商品说明</div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{detail.description}</p></div> : null}</div> : null}
        </SheetContent>
      </Sheet>
    </AdminPageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums text-slate-950">{value}</div></div>;
}

function DetailGrid({ detail }: { detail: DajuProductDetail }) {
  return <div className="grid gap-3 sm:grid-cols-2"><Metric label="最小数量" value={String(detail.minQty)} /><Metric label="最大数量" value={String(detail.maxQty)} /><Metric label="SKU 商品" value={detail.isSku ? "是" : "否"} /><Metric label="自动交付" value={detail.isAuto ? "是" : "否"} /></div>;
}

function ReadOnlyJson({ title, value }: { title: string; value: unknown }) {
  return <div><div className="text-sm font-medium text-slate-900">{title}</div><pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(value, null, 2)}</pre></div>;
}
