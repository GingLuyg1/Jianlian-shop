"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clipboard, ClipboardList, Eye, EyeOff, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
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
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [search, setSearch] = useState("");
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
        status,
        paymentStatus,
        search,
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
  }, [page, paymentStatus, router, search, status]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const rows = useMemo(() => orders, [orders]);

  async function copyOrderNo(orderNo: string) {
    await navigator.clipboard.writeText(orderNo);
    toast.success("订单编号已复制");
  }

  return (
    <div className="grid gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">我的订单</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          查询当前账号的订单记录、支付状态和交付信息。
        </p>
      </div>
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-4 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">订单查询</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  支持按订单编号、订单状态和支付状态筛选。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadOrders}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_170px_170px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索订单编号"
                  className="pl-9"
                />
              </div>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">全部订单状态</option>
                {ORDER_STATUS_VALUES.map((item) => (
                  <option key={item} value={item}>
                    {getOrderStatusLabel(item)}
                  </option>
                ))}
              </select>
              <select
                value={paymentStatus}
                onChange={(event) => {
                  setPaymentStatus(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">全部支付状态</option>
                {PAYMENT_STATUS_VALUES.map((item) => (
                  <option key={item} value={item}>
                    {getPaymentStatusLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                <div>{error}</div>
                <Button variant="outline" size="sm" className="mt-4" onClick={loadOrders}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  重新加载
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                    <ClipboardList className="h-7 w-7" />
                  </div>
                  <h2 className="mt-5 text-xl font-semibold">暂无订单</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    当前筛选条件下没有订单记录。
                  </p>
                  <Button asChild className="mt-5">
                    <Link href="/">返回商城</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="sticky top-0 z-10 bg-white text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="whitespace-nowrap px-3 py-3 text-left">订单编号</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left">商品名称</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left">数量</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left">金额</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left">订单状态</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left">支付状态</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left">下单时间</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order) => {
                      const orderStatus = normalizeOrderStatus(order.status);
                      const nextPaymentStatus = normalizePaymentStatus(order.payment_status);
                      const firstItem = order.order_items?.[0];
                      const quantity = (order.order_items ?? []).reduce(
                        (sum, item) => sum + Number(item.quantity ?? 0),
                        0
                      );

                      return (
                        <tr key={order.id} className="border-b hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => copyOrderNo(order.order_no)}
                              className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                            >
                              {order.order_no}
                              <Clipboard className="h-3 w-3" />
                            </button>
                          </td>
                          <td className="max-w-[280px] truncate px-3 py-4 font-medium">
                            {firstItem?.product_name ?? "订单商品"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4">{quantity || 1}</td>
                          <td className="whitespace-nowrap px-3 py-4 font-semibold text-primary">
                            {formatMoney(order.total_amount)}
                          </td>
                          <td className="px-3 py-4">
                            <Badge variant="outline" className={cn("whitespace-nowrap text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                              {getOrderStatusLabel(order.status)}
                            </Badge>
                          </td>
                          <td className="px-3 py-4">
                            <Badge variant="outline" className={cn("whitespace-nowrap text-xs", PAYMENT_STATUS_STYLES[nextPaymentStatus])}>
                              {getPaymentStatusLabel(order.payment_status)}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">
                            {formatDate(order.created_at)}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
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
          </CardContent>

          <div className="flex shrink-0 items-center justify-between border-t px-6 py-3 text-sm text-muted-foreground">
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

      <UserOrderDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onCopyOrderNo={copyOrderNo}
      />
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
  const firstItem = order.order_items?.[0];
  const delivery = order.order_deliveries?.[0];
  const deliveryContent = delivery?.delivery_content ?? "";

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
          <section className="grid gap-3 md:grid-cols-3">
            <InfoBlock label="订单金额" value={formatMoney(order.total_amount)} primary />
            <StatusBlock label="订单状态" value={getOrderStatusLabel(order.status)} className={ORDER_STATUS_STYLES[orderStatus]} />
            <StatusBlock label="支付状态" value={getPaymentStatusLabel(order.payment_status)} className={PAYMENT_STATUS_STYLES[paymentStatus]} />
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">订单商品</div>
            <div className="divide-y">
              {(order.order_items ?? []).map((item) => (
                <div key={item.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1fr_100px_80px_110px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{item.product_name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.category_name || "未记录分类"} · {getDeliveryLabel(item.delivery_type)}
                    </div>
                  </div>
                  <div>{formatMoney(item.unit_price)}</div>
                  <div>x {item.quantity}</div>
                  <div className="font-semibold text-primary">{formatMoney(item.line_total)}</div>
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
              <InfoLine label="收货信息" value={formatShippingAddress(order.shipping_address)} />
              <InfoLine label="订单备注" value={order.customer_note || "无"} wide />
            </div>
          </section>

          <section className="rounded-xl border p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-semibold">交付信息</div>
              {deliveryContent ? (
                <Button variant="outline" size="sm" onClick={() => setShowDelivery((value) => !value)}>
                  {showDelivery ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                  {showDelivery ? "隐藏完整内容" : "显示完整内容"}
                </Button>
              ) : null}
            </div>
            {deliveryContent ? (
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
                暂无交付信息。
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
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-2 font-semibold", primary && "text-primary")}>{value}</div>
    </div>
  );
}

function StatusBlock({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
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

function formatShippingAddress(value: Record<string, unknown> | null) {
  if (!value) return "无";
  const region = typeof value.region === "string" ? value.region : "";
  const address = typeof value.address === "string" ? value.address : "";
  const recipient = typeof value.recipient === "string" ? value.recipient : "";
  const phone = typeof value.phone === "string" ? value.phone : "";
  return [recipient, phone, region, address].filter(Boolean).join(" ") || "无";
}
