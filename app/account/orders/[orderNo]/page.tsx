"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clipboard, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Bep20OrderPaymentSummary } from "@/components/account/orders/Bep20OrderPaymentSummary";
import PublicLayout from "@/components/layout/PublicLayout";
import { OrderRefundPanel } from "@/components/refunds/OrderRefundPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  canUserCancelOrder,
  getBep20PaymentAction,
  getBep20PaymentNotice,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { getPaymentMethodLabel } from "@/lib/payments/payment-methods";
import { cn } from "@/lib/utils";

type DeliveryContent = {
  id: string;
  delivery_type: string | null;
  delivery_status: string | null;
  content: string | null;
  masked_content: string | null;
  delivered_at: string | null;
  delivery_note: string | null;
};

type OrderDetailResponse = {
  order?: OrderRecord;
  error?: string;
};

type OrderActionResponse = {
  ok?: boolean;
  error?: string | { message?: string | null } | null;
  message?: string | null;
  code?: string | null;
};

type DeliveryResponse = {
  status?: string;
  deliveries?: DeliveryContent[];
  error?: string;
};

function formatMoney(value: number | string | null | undefined, currency = "CNY") {
  const amount = Number(value ?? 0);
  const symbol = currency === "CNY" ? "¥" : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function statusClass(value: string, styles: Record<string, string>) {
  return styles[value] ?? "border-slate-200 bg-slate-50 text-slate-600";
}

function getSafeOrderActionMessage(payload: OrderActionResponse | null | undefined, fallback: string) {
  if (!payload) return fallback;
  if (payload.error && typeof payload.error === "object" && typeof payload.error.message === "string" && payload.error.message.trim()) {
    return payload.error.message.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
  return fallback;
}

export default function AccountOrderDetailPage({ params }: { params: { orderNo: string } }) {
  const router = useRouter();
  const orderNo = decodeURIComponent(params.orderNo);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryContent[]>([]);
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [visibleDeliveryIds, setVisibleDeliveryIds] = useState<Record<string, boolean>>({});

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as OrderDetailResponse;
      if (!response.ok || !data.order) {
        throw new Error(data.error || "订单加载失败");
      }
      setOrder(data.order);
    } catch (err) {
      setError(getOrderErrorMessage(err));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const mergedDeliveries = useMemo(() => {
    const map = new Map<string, DeliveryContent>();
    (order?.order_deliveries ?? []).forEach((delivery) => {
      map.set(delivery.id, {
        id: delivery.id,
        delivery_type: delivery.delivery_type ?? null,
        delivery_status: delivery.delivery_status ?? null,
        content: null,
        masked_content: delivery.delivery_content ? "••••••••" : null,
        delivered_at: delivery.delivered_at ?? null,
        delivery_note: delivery.delivery_note ?? null,
      });
    });
    deliveries.forEach((delivery) => map.set(delivery.id, delivery));
    return Array.from(map.values());
  }, [deliveries, order?.order_deliveries]);

  const orderStatus = normalizeOrderStatus(order?.status);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);
  const canCancel = order ? canUserCancelOrder(order.status) && paymentStatus === "unpaid" : false;
  const paymentAction = order ? getBep20PaymentAction(order) : null;
  const paymentNotice = order ? getBep20PaymentNotice(order) : null;
  const isBep20Order = String(order?.payment_method ?? "").toLowerCase() === "usdt_bep20";

  async function cancelOrder() {
    if (!order || !canCancel || canceling) return;
    const confirmed = window.confirm("确认取消该订单吗？取消后不能继续支付。");
    if (!confirmed) return;
    setCanceling(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.order_no)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "用户主动取消" }),
      });
      const data = (await response.json().catch(() => ({}))) as OrderActionResponse;
      if (!response.ok || data.ok === false) {
        throw new Error(getSafeOrderActionMessage(data, "订单取消失败，请稍后重试"));
      }
      toast.success("订单已取消");
      await loadOrder();
      router.refresh();
    } catch (err) {
      toast.error(getOrderErrorMessage(err, "订单取消失败，请稍后重试"));
    } finally {
      setCanceling(false);
    }
  }

  async function fetchDeliveryContent() {
    if (!order || deliveryLoading) return;
    setDeliveryLoading(true);
    setDeliveryError(null);
    setDeliveryRequested(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.order_no)}/delivery`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as DeliveryResponse;
      if (!response.ok) {
        throw new Error(data.error || "交付内容加载失败");
      }
      setDeliveries(data.deliveries ?? []);
      if (!data.deliveries?.length) {
        toast.info(data.status === "processing" ? "订单正在处理，请稍后查看" : "暂无交付内容");
      }
    } catch (err) {
      const message = getOrderErrorMessage(err);
      setDeliveryError(message);
      toast.error(message);
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function copyOrderNo() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.order_no);
      toast.success("订单编号已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function copyDeliveryContent(content: string | null) {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success("交付内容已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <PublicLayout contentClassName="bg-[#fbf7f1] p-0">
      <main className="mx-auto flex h-[calc(100vh-78px)] max-w-7xl flex-col gap-4 overflow-hidden px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="gap-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            返回上一页
          </Button>
          <Button variant="outline" className="gap-2" onClick={loadOrder} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            重新加载
          </Button>
        </div>

        {loading ? (
          <Card className="flex min-h-[360px] items-center justify-center border-orange-100 bg-white">
            <div className="text-sm text-muted-foreground">订单加载中...</div>
          </Card>
        ) : error ? (
          <Card className="flex min-h-[360px] items-center justify-center border-orange-100 bg-white">
            <div className="space-y-3 text-center">
              <div className="text-base font-semibold text-slate-900">订单加载失败</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button onClick={loadOrder}>重试</Button>
            </div>
          </Card>
        ) : !order ? (
          <Card className="flex min-h-[360px] items-center justify-center border-orange-100 bg-white">
            <div className="space-y-3 text-center">
              <div className="text-base font-semibold text-slate-900">订单不存在</div>
              <Link href="/account/orders">
                <Button>查看我的订单</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-h-0 overflow-y-auto pr-1">
              <div className="space-y-4">
                <Card className="border-orange-100 bg-white">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-2xl">订单详情</CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{order.order_no}</span>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={copyOrderNo}>
                            <Clipboard className="h-3.5 w-3.5" />
                            复制
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={cn("border", statusClass(orderStatus, ORDER_STATUS_STYLES))} variant="outline">
                          {getOrderStatusLabel(orderStatus)}
                        </Badge>
                        <Badge className={cn("border", statusClass(paymentStatus, PAYMENT_STATUS_STYLES))} variant="outline">
                          {getPaymentStatusLabel(paymentStatus)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-5">
                      <InfoCard label="订单金额" value={formatMoney(order.total_amount, order.currency)} />
                      <InfoCard label="支付方式" value={order.payment_method ? getPaymentMethodLabel(order.payment_method) : "—"} />
                      <InfoCard label="下单时间" value={formatDate(order.created_at)} />
                      <InfoCard label="交付方式" value={order.delivery_type || "—"} />
                      <InfoCard label="收货信息" value={order.customer_email || order.customer_name || "—"} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-orange-100 bg-white">
                  <CardHeader>
                    <CardTitle>订单商品</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(order.order_items ?? []).length ? (
                      order.order_items!.map((item) => (
                        <div key={item.id} className="rounded-xl border border-orange-100 bg-orange-50/30 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{item.product_name}</div>
                              {item.sku_title ? <div className="mt-1 text-sm text-muted-foreground">SKU：{item.sku_title}</div> : null}
                              {item.product_snapshot ? (
                                <div className="mt-1 text-xs text-muted-foreground">商品快照已保存</div>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-orange-600">{formatMoney(item.line_total, order.currency)}</div>
                              <div className="text-sm text-muted-foreground">
                                {formatMoney(item.unit_price, order.currency)} × {item.quantity}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-orange-200 p-8 text-center text-sm text-muted-foreground">
                        暂无商品明细
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Bep20OrderPaymentSummary order={order} onUpdated={loadOrder} />

                <Card className="border-orange-100 bg-white">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle>数字交付</CardTitle>
                      <Button size="sm" onClick={fetchDeliveryContent} disabled={deliveryLoading || paymentStatus !== "paid"}>
                        {deliveryLoading ? "加载中..." : "查看交付内容"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {paymentStatus !== "paid" ? (
                      <div className="rounded-xl border border-dashed border-orange-200 p-8 text-center text-sm text-muted-foreground">
                        订单支付完成后可查看交付内容。
                      </div>
                    ) : deliveryError ? (
                      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{deliveryError}</div>
                    ) : mergedDeliveries.length ? (
                      mergedDeliveries.map((delivery) => {
                        const visible = visibleDeliveryIds[delivery.id];
                        const displayContent = visible ? delivery.content || delivery.masked_content || "—" : delivery.masked_content || "••••••••";
                        return (
                          <div key={delivery.id} className="rounded-xl border border-orange-100 bg-orange-50/20 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-slate-900">{delivery.delivery_type || "交付内容"}</div>
                                <div className="mt-1 text-sm text-muted-foreground">交付时间：{formatDate(delivery.delivered_at)}</div>
                              </div>
                              <Badge variant="outline">{delivery.delivery_status || "—"}</Badge>
                            </div>
                            <div className="mt-3 rounded-lg bg-white p-3 font-mono text-sm text-slate-900 break-all">
                              {displayContent}
                            </div>
                            {delivery.delivery_note ? (
                              <div className="mt-2 text-sm text-muted-foreground">{delivery.delivery_note}</div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => setVisibleDeliveryIds((prev) => ({ ...prev, [delivery.id]: !visible }))}
                              >
                                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                {visible ? "隐藏" : "显示完整内容"}
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => copyDeliveryContent(delivery.content)} disabled={!delivery.content}>
                                <Clipboard className="h-4 w-4" />
                                复制内容
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-orange-200 p-8 text-center text-sm text-muted-foreground">
                        {["manual", "manual_delivery"].includes(String(order.delivery_type ?? order.order_items?.[0]?.delivery_type ?? ""))
                          ? orderStatus === "processing" ? "人工处理中。" : "待人工处理。"
                          : deliveryRequested ? "暂无交付内容，请联系客服确认。" : "交付内容默认隐藏，点击后单独请求服务端。"}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <OrderRefundPanel
                  orderNo={order.order_no}
                  totalAmount={Number(order.total_amount ?? 0)}
                  currency={order.currency ?? "CNY"}
                  status={order.status}
                  paymentStatus={order.payment_status}
                />
              </div>
            </section>

            <aside className="min-h-0 overflow-y-auto">
              <Card className="border-orange-100 bg-white">
                <CardHeader>
                  <CardTitle>订单操作</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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
                  <Link href="/account/orders" className="block">
                    <Button variant="outline" className="w-full">查看我的订单</Button>
                  </Link>
                  <Link href="/products/sim-cards" className="block">
                    <Button variant="outline" className="w-full">返回商城</Button>
                  </Link>
                  {canCancel ? (
                    <Button variant="destructive" className="w-full" onClick={cancelOrder} disabled={canceling}>
                      {canceling ? "取消中..." : "取消订单"}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="mt-4 border-orange-100 bg-white">
                <CardHeader>
                  <CardTitle>状态记录</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(order.order_status_logs ?? []).length ? (
                    order.order_status_logs!.map((log) => (
                      <div key={log.id} className="rounded-lg border border-orange-100 p-3 text-sm">
                        <div className="font-medium text-slate-900">
                          {log.from_status || "—"} → {log.to_status || "—"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDate(log.created_at)}</div>
                        {log.note ? <div className="mt-2 text-muted-foreground">{log.note}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-orange-200 p-6 text-center text-sm text-muted-foreground">
                      暂无状态记录
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>
    </PublicLayout>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-semibold text-slate-900" title={value}>
        {value}
      </div>
    </div>
  );
}

