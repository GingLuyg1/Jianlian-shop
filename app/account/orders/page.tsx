"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clipboard, ClipboardList, Eye, EyeOff, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Bep20OrderPaymentSummary } from "@/components/account/orders/Bep20OrderPaymentSummary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { normalizeOrderItemDeliveryType } from "@/lib/orders/order-fulfillment-status";
import {
  getBep20PaymentAction,
  getBep20PaymentNotice,
  getUserOrderDisplayStatus,
  normalizeOrderStatus,
  normalizePaymentStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function formatMoney(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

function maskSecret(value: string) {
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [queryOpen, setQueryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const response = await fetch(`/api/orders?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as {
        orders?: OrderRecord[];
        count?: number;
        error?: string;
      } | null;

      if (response.status === 401) {
        toast.error("登录状态已失效，请重新登录。");
        router.push("/login?redirect=/account/orders");
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrders(result?.orders ?? []);
      setCount(Number(result?.count ?? 0));
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [page, router]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const rows = useMemo(() => orders, [orders]);

  async function copyOrderNo(orderNo: string) {
    await navigator.clipboard.writeText(orderNo);
    toast.success("订单编号已复制");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="shrink-0 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">我的订单</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  查询当前账号的订单记录、支付状态和交付信息。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setQueryOpen(true)}>
                <Search className="mr-2 h-4 w-4" />
                订单查询
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 overflow-hidden px-5 pb-0">
            {loading ? (
              <div className="w-full space-y-2.5">
                {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                  <div key={index} className="h-12 rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : error ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                <div className="text-center">
                  <div>{error}</div>
                  <Button variant="outline" size="sm" className="mt-4" onClick={loadOrders}>
                    重试
                  </Button>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <div className="w-full max-w-[340px] rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 px-7 py-7 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">暂无订单</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    当前筛选条件下没有订单记录。
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/">返回商城</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full w-full overflow-auto rounded-lg border">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[27%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[15%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">订单编号</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">商品名称</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">数量</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">金额</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">状态</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">下单时间</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order) => {
                      const displayStatus = getUserOrderDisplayStatus(order);
                      const paymentAction = getBep20PaymentAction(order);
                      const firstItem = order.order_items?.[0];
                      const productName = firstItem?.product_name ?? "订单商品";
                      const quantity = (order.order_items ?? []).reduce(
                        (sum, item) => sum + Number(item.quantity ?? 0),
                        0
                      );

                      return (
                        <tr key={order.id} className="border-b hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => copyOrderNo(order.order_no)}
                              className="inline-flex items-center justify-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                            >
                              {order.order_no}
                              <Clipboard className="h-3 w-3" />
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-center align-middle font-medium">
                            <div className="mx-auto max-w-[260px] truncate whitespace-nowrap" title={productName}>
                              {productName}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle">{quantity || 1}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-semibold text-primary">
                            {formatMoney(order.total_amount)}
                          </td>
                          <td className="px-3 py-2.5 text-center align-middle">
                            <Badge variant="outline" className={cn("whitespace-nowrap text-xs", displayStatus.className)}>
                              {displayStatus.label}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle text-muted-foreground">
                            {formatDate(order.created_at)}
                          </td>
                          <td className="px-3 py-2.5 text-center align-middle">
                            <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                              {paymentAction && paymentAction.kind !== "renew" ? (
                                <Button asChild size="sm">
                                  <Link href={`/payment?order=${encodeURIComponent(order.order_no)}`}>{paymentAction.label}</Link>
                                </Button>
                              ) : null}
                              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                                查看详情
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>

          <div className="flex h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 text-sm text-muted-foreground">
            <span>共 {count} 条订单</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                上一页
              </Button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                下一页
              </Button>
            </div>
          </div>
      </Card>

      <OrderEmailQueryDialog
        open={queryOpen}
        onClose={() => setQueryOpen(false)}
        onCopyOrderNo={copyOrderNo}
        onViewOrder={setSelectedOrder}
      />

      <UserOrderDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onCopyOrderNo={copyOrderNo}
      />
    </div>
  );
}

function OrderEmailQueryDialog({
  open,
  onClose,
  onCopyOrderNo,
  onViewOrder,
}: {
  open: boolean;
  onClose: () => void;
  onCopyOrderNo: (orderNo: string) => void | Promise<void>;
  onViewOrder: (order: OrderRecord) => void;
}) {
  const [email, setEmail] = useState("");
  const [queryEmail, setQueryEmail] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const normalizedEmail = email.trim().toLowerCase();

  const queryOrders = useCallback(
    async (targetPage = page, emailToQuery = queryEmail) => {
      if (!emailToQuery) {
        setError("请输入下单邮箱");
        setOrders([]);
        setCount(0);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
          email: emailToQuery,
        });
        const response = await fetch(`/api/orders?${params.toString()}`);
        const result = (await response.json().catch(() => null)) as {
          orders?: OrderRecord[];
          count?: number;
          error?: string;
        } | null;

        if (response.status === 401) {
          throw new Error("登录状态已失效，请重新登录。");
        }

        if (!response.ok) {
          throw new Error(result?.error ?? "订单查询失败");
        }

        setOrders(result?.orders ?? []);
        setCount(Number(result?.count ?? 0));
      } catch (queryError) {
        setError(getOrderErrorMessage(queryError, "订单查询失败，请稍后重试"));
        setOrders([]);
        setCount(0);
      } finally {
        setLoading(false);
      }
    },
    [page, queryEmail]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !queryEmail) return;
    queryOrders(page);
  }, [open, page, queryEmail, queryOrders]);

  useEffect(() => {
    if (open) return;
    setEmail("");
    setOrders([]);
    setCount(0);
    setPage(1);
    setQueryEmail("");
    setError("");
    setSubmitted(false);
  }, [open]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!normalizedEmail) {
      setError("请输入下单邮箱");
      setOrders([]);
      setCount(0);
      setQueryEmail("");
      return;
    }
    const shouldQueryNow = queryEmail === normalizedEmail && page === 1;
    setQueryEmail(normalizedEmail);
    setPage(1);
    if (shouldQueryNow) {
      queryOrders(1, normalizedEmail);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 px-4 py-6" onClick={onClose}>
      <div
        className="mx-auto flex h-full max-h-[760px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <div className="text-lg font-bold text-slate-950">订单查询</div>
            <p className="mt-1 text-sm text-muted-foreground">输入下单邮箱，查询当前账号下匹配的订单。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭订单查询"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-3 border-b px-5 py-4 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="输入下单邮箱"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "查询中..." : "查询"}
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <div className="text-center">
                <div>{error}</div>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => queryOrders(page)}>
                  重试
                </Button>
              </div>
            </div>
          ) : !submitted ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-muted-foreground">
              请输入邮箱后查询订单。
            </div>
          ) : orders.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50/50 text-sm text-muted-foreground">
              当前邮箱下没有可显示的订单。
            </div>
          ) : (
            <div className="h-full overflow-auto rounded-lg border">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[27%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[15%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">订单编号</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">商品名称</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">数量</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">金额</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">状态</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">下单时间</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const firstItem = order.order_items?.[0];
                    const productName = firstItem?.product_name ?? "订单商品";
                    const quantity = (order.order_items ?? []).reduce(
                      (sum, item) => sum + Number(item.quantity ?? 0),
                      0
                    );
                    const displayStatus = getUserOrderDisplayStatus(order);

                    return (
                      <tr key={order.id} className="border-b hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => onCopyOrderNo(order.order_no)}
                            className="inline-flex items-center justify-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                          >
                            {order.order_no}
                            <Clipboard className="h-3 w-3" />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle font-medium">
                          <div className="mx-auto max-w-[260px] truncate whitespace-nowrap" title={productName}>
                            {productName}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle">{quantity || 1}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-semibold text-primary">
                          {formatMoney(order.total_amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <Badge variant="outline" className={cn("whitespace-nowrap text-xs", displayStatus.className)}>
                            {displayStatus.label}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center align-middle text-muted-foreground">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onClose();
                              onViewOrder(order);
                            }}
                          >
                            查看详情
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground">
          <span>共 {count} 条订单</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading || !queryEmail}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </Button>
            <span>
              第 {page} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading || !queryEmail}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserOrderDrawer({
  order,
  onClose,
  onCopyOrderNo,
}: {
  order: OrderRecord | null;
  onClose: () => void;
  onCopyOrderNo: (orderNo: string) => void;
}) {
  const [showDelivery, setShowDelivery] = useState(false);

  useEffect(() => {
    if (!order) return;
    setShowDelivery(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, order]);

  if (!order) return null;

  const orderStatus = normalizeOrderStatus(order.status);
  const paymentStatus = normalizePaymentStatus(order.payment_status);
  const paymentAction = getBep20PaymentAction(order);
  const paymentNotice = getBep20PaymentNotice(order);
  const isBep20Order = String(order.payment_method ?? "").toLowerCase() === "usdt_bep20";
  const displayStatus = getUserOrderDisplayStatus(order);
  const firstItem = order.order_items?.[0];
  const isShippingOrder = normalizeOrderItemDeliveryType(order.delivery_type ?? firstItem?.delivery_type) === "physical";
  const delivery = order.order_deliveries?.[0];
  const deliveryContent = delivery?.delivery_content ?? "";
  const cancelled = orderStatus === "cancelled";
  const failed = orderStatus === "failed" || delivery?.delivery_status === "failed";

  async function copyDeliveryContent() {
    if (!deliveryContent) return;
    await navigator.clipboard.writeText(deliveryContent);
    toast.success("交付内容已复制");
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <div className="text-lg font-bold text-slate-950">订单详情</div>
            <button
              type="button"
              onClick={() => onCopyOrderNo(order.order_no)}
              className="mt-1 inline-flex items-center gap-2 rounded px-1 py-0.5 font-mono text-xs text-slate-500 hover:bg-muted"
            >
              {order.order_no}
              <Clipboard className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭订单详情"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {paymentAction && !isBep20Order ? (
            <Button asChild className="w-full">
              <Link href={`/payment?order=${encodeURIComponent(order.order_no)}`}>{paymentAction.label}</Link>
            </Button>
          ) : null}
          {!paymentAction && !isBep20Order && paymentNotice ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {paymentNotice}
            </div>
          ) : null}
          <section className="grid gap-3 md:grid-cols-2">
            <InfoBlock label="订单金额" value={formatMoney(order.total_amount)} primary />
            <StatusBlock label="状态" value={displayStatus.label} className={displayStatus.className} />
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">订单商品</div>
            <div className="divide-y">
              {(order.order_items ?? []).map((item) => (
                <div key={item.id} className="grid items-center gap-3 px-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_120px_80px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold" title={item.product_name}>{item.product_name}</div>
                    {item.sku_title ? (
                      <div className="mt-1 truncate text-xs text-muted-foreground">SKU: {item.sku_title}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.category_name || "未记录分类"} · {getDeliveryLabel(item.delivery_type)}
                    </div>
                  </div>
                  <div className="text-center font-semibold text-primary">{formatMoney(item.unit_price)}</div>
                  <div className="text-center text-muted-foreground">x {item.quantity}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border p-4 text-sm">
            <div className="mb-3 font-semibold">订单信息</div>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoLine label="下单时间" value={formatDate(order.created_at)} />
              <InfoLine label="更新时间" value={formatDate(order.updated_at)} />
              <InfoLine label="交付方式" value={getDeliveryLabel(order.delivery_type ?? firstItem?.delivery_type)} />
              {isShippingOrder ? (
                <InfoLine label="收货信息" value={formatShippingAddress(order)} />
              ) : null}
              <InfoLine label="订单备注" value={order.customer_note || "无"} wide />
            </div>
          </section>

          <Bep20OrderPaymentSummary order={order} compact />

          <section className="rounded-xl border p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-semibold">交付信息</div>
              {deliveryContent ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowDelivery((value) => !value)}>
                    {showDelivery ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {showDelivery ? "隐藏完整内容" : "显示完整内容"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyDeliveryContent}>
                    <Clipboard className="mr-2 h-4 w-4" />
                    复制
                  </Button>
                </div>
              ) : null}
            </div>
            {cancelled ? (
              <div className="rounded-lg bg-slate-50 p-3 text-muted-foreground">
                订单已取消，不显示交付内容。
              </div>
            ) : failed ? (
              <div className="rounded-lg bg-amber-50 p-3 text-amber-700">
                交付处理中，请联系管理员。
              </div>
            ) : deliveryContent ? (
              <div className="rounded-lg bg-slate-50 p-3 leading-6">
                <div className="whitespace-pre-wrap break-words">
                  {showDelivery ? deliveryContent : maskSecret(deliveryContent)}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  交付时间：{formatDate(delivery?.delivered_at ?? delivery?.updated_at)}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 p-3 text-muted-foreground">
                {paymentStatus !== "paid"
                  ? "等待支付。"
                  : ["manual", "manual_delivery"].includes(String(order.delivery_type ?? firstItem?.delivery_type ?? ""))
                    ? orderStatus === "processing" ? "人工处理中。" : "待人工处理。"
                    : orderStatus === "processing" ? "交付处理中。" : "等待交付。"}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function InfoBlock({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="flex min-h-[88px] flex-col items-center justify-center rounded-xl border bg-slate-50 p-4 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-2 font-semibold", primary && "text-primary")}>{value}</div>
    </div>
  );
}

function StatusBlock({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="flex min-h-[88px] flex-col items-center justify-center rounded-xl border bg-slate-50 p-4 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <Badge variant="outline" className={cn("mt-2 whitespace-nowrap text-xs", className)}>
        {value}
      </Badge>
    </div>
  );
}

function InfoLine({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "md:col-span-2")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

function formatShippingAddress(order: OrderRecord) {
  const value = order.shipping_address;
  const region = value && typeof value.region === "string" ? value.region : "";
  const address = value && typeof value.address === "string" ? value.address : "";
  const recipient = value && typeof value.recipient === "string" ? value.recipient : order.customer_name ?? "";
  const phone = value && typeof value.phone === "string" ? value.phone : order.customer_phone ?? "";
  return [recipient, phone, region, address].filter(Boolean).join(" ") || "未填写";
}
