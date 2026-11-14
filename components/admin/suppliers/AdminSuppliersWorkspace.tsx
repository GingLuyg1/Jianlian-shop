"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Factory,
  Info,
  Layers,
  Loader2,
  Package,
  PackageCheck,
  PackageSearch,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { supplierUiRegistry } from "@/components/admin/suppliers/supplier-ui-registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DajuBalance, DajuProduct, DajuProductDetail } from "@/lib/providers/daju/types";
import { cn } from "@/lib/utils";

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

function formatTime(value: string | null) {
  if (!value) return "尚未检测";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getSupplierError(payload: unknown, fallback: string): SupplierError {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : null;
  const requestId = typeof record.requestId === "string" ? record.requestId : null;
  const serviceMessage = typeof record.error === "string" && record.error.trim() ? record.error.trim() : fallback;
  return {
    message: code === "INVALID_IP" ? "供应商拒绝当前服务器 IP / API 访问，请检查 IP 白名单" : serviceMessage,
    code,
    requestId,
  };
}

function SupplierErrorDetails({ error }: { error: SupplierError }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-red-800">{error.message}</div>
      {error.code ? (
        <div className="text-red-700/80">
          错误代码：<span className="font-mono font-semibold">{error.code}</span>
        </div>
      ) : null}
      {error.requestId ? (
        <div className="text-red-700/80">
          请求追踪编号：<span className="font-mono">{error.requestId}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminSuppliersWorkspace() {
  const [activeSupplierCode, setActiveSupplierCode] = useState(supplierUiRegistry[0]?.code ?? "");
  const activeSupplier = supplierUiRegistry.find((supplier) => supplier.code === activeSupplierCode) ?? supplierUiRegistry[0];
  const [balance, setBalance] = useState<DajuBalance | null>(null);
  const [detection, setDetection] = useState<DetectionState>({ status: "idle", checkedAt: null, error: null });
  const [activeArea, setActiveArea] = useState<"overview" | "products">("overview");

  const [query, setQuery] = useState("");
  const [autoDeliveryOnly, setAutoDeliveryOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"sales" | "price_asc" | "price_desc" | "stock">("sales");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
      const response = await fetch(`${activeSupplier.adminEndpoint}?resource=balance`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商连接检测失败");
      setBalance(payload.balance as DajuBalance);
      setDetection({ status: "connected", checkedAt: new Date().toISOString(), error: null });
    } catch (error) {
      const nextError =
        error && typeof error === "object" && "message" in error
          ? (error as SupplierError)
          : { message: "供应商连接检测失败", code: null, requestId: null };
      setBalance(null);
      setDetection({ status: "failed", checkedAt: new Date().toISOString(), error: nextError });
    }
  }, [activeSupplier.adminEndpoint]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const url = `${activeSupplier.adminEndpoint}?resource=products` + (query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "");
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商商品目录读取失败");
      setProducts(Array.isArray(payload.products) ? payload.products : []);
      setProductsLoaded(true);
      setPage(1);
    } catch (error) {
      const nextError =
        error && typeof error === "object" && "message" in error
          ? (error as SupplierError)
          : { message: "供应商商品目录读取失败", code: null, requestId: null };
      setProducts([]);
      setProductsLoaded(true);
      setProductsError(nextError);
    } finally {
      setProductsLoading(false);
    }
  }, [activeSupplier.adminEndpoint, query]);

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
      const response = await fetch(`${activeSupplier.adminEndpoint}?resource=product&id=${productId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw getSupplierError(payload, "供应商商品详情读取失败");
      setDetail(payload.product as DajuProductDetail);
    } catch (error) {
      setDetailError(
        error && typeof error === "object" && "message" in error
          ? (error as SupplierError)
          : { message: "供应商商品详情读取失败", code: null, requestId: null }
      );
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (autoDeliveryOnly && !p.isAuto) return false;
        if (inStockOnly && p.stock <= 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price_asc") return Number(a.price) - Number(b.price);
        if (sortBy === "price_desc") return Number(b.price) - Number(a.price);
        if (sortBy === "stock") return b.stock - a.stock;
        return b.sales - a.sales;
      });
  }, [autoDeliveryOnly, inStockOnly, products, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const pagedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const statusPresentation =
    detection.status === "connected"
      ? { label: "API 通信正常", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> }
      : detection.status === "failed"
        ? { label: "连接异常", className: "border-red-200 bg-red-50 text-red-700", icon: <AlertTriangle className="h-3.5 w-3.5" /> }
        : detection.status === "checking"
          ? { label: "检测中…", className: "border-blue-200 bg-blue-50 text-blue-700", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> }
          : { label: "尚未检测", className: "border-slate-200 bg-slate-50 text-slate-600", icon: <Factory className="h-3.5 w-3.5" /> };

  return (
    <AdminPageShell
      title="供应商管理"
      description="管理第三方供应商连接状态、可用余额、商品目录浏览与商品履约对接。"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/products">
              前往商品管理绑定 <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/supplier-fulfillment">供应商履约日志</Link>
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">供应商渠道：</span>
            {supplierUiRegistry.map((supplier) => (
              <Button
                key={supplier.code}
                type="button"
                size="sm"
                variant={activeSupplier.code === supplier.code ? "default" : "outline"}
                className={cn("h-8 rounded-xl text-xs", activeSupplier.code === supplier.code && "shadow-sm")}
                aria-pressed={activeSupplier.code === supplier.code}
                onClick={() => {
                  setActiveSupplierCode(supplier.code);
                  setProducts([]);
                  setProductsLoaded(false);
                  setDetailOpen(false);
                }}
              >
                <Factory className="mr-1.5 h-3.5 w-3.5" />
                {supplier.name}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveArea("overview")}
              className={cn(
                "rounded-lg px-3 py-1 font-medium transition-colors",
                activeArea === "overview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              供应商概览
            </button>
            <button
              type="button"
              onClick={() => setActiveArea("products")}
              className={cn(
                "rounded-lg px-3 py-1 font-medium transition-colors",
                activeArea === "products" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              供应商商品目录
            </button>
          </div>
        </div>

        {activeArea === "overview" ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <Card className="rounded-2xl border border-slate-200/80 shadow-sm">
              <CardHeader className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    <Factory className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold text-slate-950">{activeSupplier.name}</CardTitle>
                      <Badge variant="outline" className={cn("gap-1 text-[11px]", statusPresentation.className)}>
                        {statusPresentation.icon}
                        {statusPresentation.label}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      系统代码：<span className="font-mono font-semibold text-slate-700">{activeSupplier.code}</span> ·
                      接口网关：<span className="font-mono text-slate-600">{activeSupplier.adminEndpoint}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={checkConnection} disabled={detection.status === "checking"}>
                    <RefreshCcw className={cn("mr-1.5 h-3.5 w-3.5", detection.status === "checking" && "animate-spin")} />
                    检测连接 / 刷新余额
                  </Button>
                  <Button size="sm" onClick={() => setActiveArea("products")}>
                    浏览供应商商品
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 p-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="text-xs text-slate-500">供货商可用余额</div>
                    <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-950">
                      {balance ? `¥${balance.balance}` : "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">采购代扣额度</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="text-xs text-slate-500">累计采购消费</div>
                    <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-950">
                      {balance?.totalSpent ? `¥${balance.totalSpent}` : "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">上游接口历史账单</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="text-xs text-slate-500">累计采购订单</div>
                    <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-950">
                      {balance ? `${balance.totalOrders} 单` : "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">成功发货笔数</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="text-xs text-slate-500">最近检测时间</div>
                    <div className="mt-2 text-sm font-medium text-slate-800">
                      {formatTime(detection.checkedAt)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">通信探活记录</div>
                  </div>
                </div>

                {detection.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <div>
                        <div className="text-xs font-semibold text-red-800">连接异常与排查建议</div>
                        <div className="mt-1">
                          <SupplierErrorDetails error={detection.error} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold text-slate-900">支持的自动化能力</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeSupplier.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                      >
                        <Zap className="h-3 w-3" />
                        {cap}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">
                    💡 提示：本站采用标准契约分层架构，商品下单后自动匹配对应供应商 API 完成代扣代发，支持在商品规格设置中随时解除或绑定。
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 sm:px-4">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void loadProducts();
                    }}
                    className="h-8 pl-8 text-xs"
                    placeholder="搜索供应商商品名称或 ID"
                  />
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={loadProducts} disabled={productsLoading}>
                  {productsLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
                  搜索
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadProducts} disabled={productsLoading}>
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  刷新
                </Button>

                <div className="flex items-center gap-2 ml-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoDeliveryOnly}
                      onChange={(e) => setAutoDeliveryOnly(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    仅看自动交付
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    仅看有库存
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                >
                  <option value="sales">按销量排序</option>
                  <option value="price_asc">按价格从低到高</option>
                  <option value="price_desc">按价格从高到低</option>
                  <option value="stock">按库存排序</option>
                </select>

                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                >
                  <option value={10}>10 条/页</option>
                  <option value={20}>20 条/页</option>
                  <option value={50}>50 条/页</option>
                </select>
              </div>
            </div>

            {productsError ? (
              <AdminErrorState
                title="供应商商品目录读取失败"
                description={productsError.message}
                action={<SupplierErrorDetails error={productsError} />}
              />
            ) : productsLoading ? (
              <AdminTableSkeleton rows={10} />
            ) : filteredProducts.length === 0 ? (
              <AdminEmptyState
                icon={<PackageSearch className="h-6 w-6" />}
                title={query.trim() ? "未找到符合条件的供应商商品" : "供应商商品目录为空"}
                description="请尝试调整搜索关键词或重置筛选条件后刷新。"
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
                <div className="min-h-0 flex-1 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-slate-50">
                      <TableRow className="text-xs">
                        <TableHead className="min-w-[200px]">供应商商品信息</TableHead>
                        <TableHead className="text-center">编号 ID</TableHead>
                        <TableHead className="text-right">供货单价</TableHead>
                        <TableHead className="text-right">当前库存</TableHead>
                        <TableHead className="text-right">历史销量</TableHead>
                        <TableHead className="text-center">交付类型</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedProducts.map((product) => (
                        <TableRow key={product.id} className="text-xs hover:bg-slate-50/70">
                          <TableCell className="min-w-0 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                <Package className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="max-w-[260px] truncate font-medium text-slate-900" title={product.title}>
                                  {product.title}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {product.isAuto ? "自动交付" : "手动处理"} · 排序ID: {product.sortId ?? "—"}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono tabular-nums text-slate-600">{product.id}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-slate-900">¥{product.price}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={product.stock <= 0 ? "font-semibold text-red-600" : "text-slate-700"}>
                              {product.stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-600">{product.sales}</TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                product.isAuto ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                              )}
                            >
                              {product.isAuto ? "自动发货" : "人工交付"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => openProductDetail(product.id)}
                            >
                              查看规格详情
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                  <div>
                    共 <span className="font-semibold text-slate-800">{filteredProducts.length}</span> 款供应商商品 · 第{" "}
                    <span className="font-semibold text-slate-800">{page}</span> / {totalPages} 页
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="mr-0.5 h-3.5 w-3.5" /> 上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页 <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">供应商商品规格详情</SheetTitle>
            <SheetDescription className="text-xs">实时拉取供应商服务端的最新规格、库存与所需买家参数信息。</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <AdminTableSkeleton rows={7} className="mt-4" />
          ) : detailError ? (
            <AdminErrorState title="商品详情读取失败" description={detailError.message} action={<SupplierErrorDetails error={detailError} />} />
          ) : detail ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <h3 className="font-bold text-slate-950">{detail.title}</h3>
                <div className="mt-1 text-xs font-mono text-slate-500">供应商商品编号：{detail.id}</div>
                <div className="mt-2.5 flex flex-wrap gap-3 text-xs">
                  <span className="font-semibold text-slate-900">供货底价：¥{detail.price}</span>
                  <span className="text-slate-600">库存：{detail.stock}</span>
                  <span className="text-slate-600">总销量：{detail.sales}</span>
                  <span className={detail.isAuto ? "text-emerald-700 font-medium" : "text-slate-500"}>
                    {detail.isAuto ? "✓ 自动交付" : "人工交付"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-100 p-2.5">
                  <span className="text-slate-400">最小起购量：</span>
                  <span className="font-medium text-slate-800">{detail.minQty}</span>
                </div>
                <div className="rounded-lg border border-slate-100 p-2.5">
                  <span className="text-slate-400">最大采购量：</span>
                  <span className="font-medium text-slate-800">{detail.maxQty}</span>
                </div>
              </div>

              {detail.requiredInputs && Object.keys(detail.requiredInputs).length > 0 ? (
                <div>
                  <div className="text-xs font-semibold text-slate-900 mb-1.5">下单需采集的买家信息</div>
                  <pre className="max-h-40 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100 font-mono">
                    {JSON.stringify(detail.requiredInputs, null, 2)}
                  </pre>
                </div>
              ) : null}

              {detail.skuVariants && Object.keys(detail.skuVariants).length > 0 ? (
                <div>
                  <div className="text-xs font-semibold text-slate-900 mb-1.5">商品规格子项数据</div>
                  <pre className="max-h-48 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100 font-mono">
                    {JSON.stringify(detail.skuVariants, null, 2)}
                  </pre>
                </div>
              ) : null}

              {detail.description ? (
                <div>
                  <div className="text-xs font-semibold text-slate-900 mb-1.5">供应商商品说明</div>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {detail.description}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AdminPageShell>
  );
}
