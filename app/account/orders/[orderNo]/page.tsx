"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clipboard, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  canUserCancelOrder,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

function maskSecret(value: string) {
  if (!value) return "********";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

type DeliveryContent = {
  product_name: string;
  delivery_status: string;
  delivery_type: string;
  delivered_at: string | null;
  viewed_at: string | null;
  masked_content: string;
  content: string | null;
  delivery_note: string | null;
};

export default function UserOrderDetailPage({
  params,
}: {
  params: { orderNo: string };
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showDelivery, setShowDelivery] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryContents, setDeliveryContents] = useState<DeliveryContent[]>([]);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(params.orderNo)}`);
      const result = (await response.json().catch(() => null)) as
        | { order?: OrderRecord; error?: string }
        | null;

      if (response.status === 401) {
        router.push(`/login?redirect=/account/orders/${params.orderNo}`);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrder(result?.order ?? null);
      setShowDelivery(false);
      setDeliveryContents([]);
      setDeliveryError("");
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [params.orderNo, router]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  async function cancelOrder() {
    if (!order || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.order_no)}`, {
        method: "PATCH",
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "订单取消失败");
      }

      await loadOrder();
    } catch (cancelError) {
      setError(getOrderErrorMessage(cancelError, "订单取消失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function fetchDeliveryContent() {
    if (!order || deliveryLoading) return;
    setDeliveryLoading(true);
    setDeliveryError("");

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.order_no)}/delivery`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as
        | { deliveries?: DeliveryContent[]; error?: string; message?: string }
        | null;

      if (response.status === 401) {
        router.push(`/login?redirect=/account/orders/${order.order_no}`);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "交付内容读取失败");
      }

      const deliveries = result?.deliveries ?? [];
      setDeliveryContents(deliveries);
      setShowDelivery(deliveries.some((item) => Boolean(item.content)));
      if (deliveries.length === 0) {
        setDeliveryError(result?.message ?? "正在处理");
      }
    } catch (fetchError) {
      setDeliveryError(getOrderErrorMessage(fetchError, "交付内容读取失败"));
    } finally {
      setDeliveryLoading(false);
    }
  }

  const orderStatus = normalizeOrderStatus(order?.status);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);
  const delivery = order?.order_deliveries?.[0];
  const deliveryFailed = orderStatus === "failed" || delivery?.delivery_status === "failed";
  const cancelled = orderStatus === "cancelled";
  const delivered = delivery?.delivery_status === "delivered" || deliveryContents.length > 0;
  const mergedDeliveryContents = useMemo(() => {
    if (deliveryContents.length > 0) return deliveryContents;
    if (!delivery) return [];
    return [
      {
        product_name: order?.order_items?.[0]?.product_name ?? "—",
        delivery_status: delivery.delivery_status,
        delivery_type: delivery.delivery_type ?? "—",
        delivered_at: delivery.delivered_at,
        viewed_at: delivery.viewed_at ?? null,
        masked_content: "********",
        content: null,
        delivery_note: delivery.delivery_note ?? null,
      },
    ];
  }, [delivery, deliveryContents, order?.order_items]);

  async function copyDeliveryContent(content: string | null) {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    toast.success("交付内容已复制");
  }

  return (
    <PublicLayout contentClassName="max-w-none px-4 py-4 md:px-6">
      <div className="mx-auto max-w-[1200px] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href="/account/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回订单
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={loadOrder}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            重新加载
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>订单详情</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 rounded-xl bg-slate-100" />
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : !order ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                订单不存在或无权查看
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <InfoCard label="订单编号" value={order.order_no} mono />
                  <InfoCard label="订单金额" value={`¥${Number(order.total_amount).toFixed(2)}`} primary />
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs text-muted-foreground">状态</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                        {getOrderStatusLabel(order.status)}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", PAYMENT_STATUS_STYLES[paymentStatus])}>
                        {getPaymentStatusLabel(order.payment_status)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <section className="rounded-xl border">
                  <div className="border-b px-4 py-3 font-semibold">商品列表</div>
                  <div className="divide-y">
                    {(order.order_items ?? []).map((item) => (
                      <div key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_120px_100px_120px]">
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.category_name || "未记录分类"} · {item.delivery_type || "未记录交付方式"}
                          </div>
                        </div>
                        <div className="text-sm">单价 ¥{Number(item.unit_price).toFixed(2)}</div>
                        <div className="text-sm">数量 {item.quantity}</div>
                        <div className="font-semibold text-primary">¥{Number(item.line_total).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">交付信息</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        完整卡密或账号信息默认隐藏，点击后从服务端重新读取。
                      </p>
                    </div>
                    {delivered && !cancelled ? (
                      <Button variant="outline" size="sm" onClick={fetchDeliveryContent} disabled={deliveryLoading}>
                        {showDelivery ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {deliveryLoading ? "读取中..." : showDelivery ? "刷新交付内容" : "查看交付内容"}
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2">
                    {cancelled ? (
                      <DeliveryNotice>订单已取消，不显示交付内容。</DeliveryNotice>
                    ) : deliveryFailed ? (
                      <DeliveryNotice className="bg-amber-50 text-amber-700">
                        交付处理失败，请联系客服，不展示内部错误。
                      </DeliveryNotice>
                    ) : delivered ? (
                      mergedDeliveryContents.map((item, index) => (
                        <div key={`${item.product_name}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm leading-6">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-xs text-muted-foreground">
                              交付时间：{item.delivered_at ? new Date(item.delivered_at).toLocaleString("zh-CN", { hour12: false }) : "未记录"}
                            </div>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap break-words rounded-md border bg-white p-3 font-mono text-xs">
                            {showDelivery && item.content ? item.content : maskSecret(item.masked_content)}
                          </div>
                          {showDelivery && item.content ? (
                            <div className="mt-2 flex justify-end">
                              <Button variant="outline" size="sm" onClick={() => copyDeliveryContent(item.content)}>
                                <Clipboard className="mr-2 h-4 w-4" />
                                复制内容
                              </Button>
                            </div>
                          ) : null}
                          {item.delivery_note ? <div className="mt-2 text-xs text-muted-foreground">{item.delivery_note}</div> : null}
                        </div>
                      ))
                    ) : (
                      <DeliveryNotice>正在处理。</DeliveryNotice>
                    )}
                    {deliveryError ? <DeliveryNotice className="bg-amber-50 text-amber-700">{deliveryError}</DeliveryNotice> : null}
                  </div>
                </section>

                <section className="rounded-xl border p-4">
                  <h3 className="font-semibold">状态时间线</h3>
                  <div className="mt-3 space-y-2">
                    {(order.order_status_logs ?? []).map((log) => (
                      <div key={log.id} className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span>
                          {getOrderStatusLabel(log.to_status)}
                          {log.note ? ` · ${log.note}` : ""}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString("zh-CN", { hour12: false })}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {canUserCancelOrder(order.status) ? (
                  <div className="flex justify-end">
                    <Button variant="outline" disabled={submitting} onClick={cancelOrder}>
                      {submitting ? "正在取消..." : "取消订单"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function InfoCard({
  label,
  value,
  mono,
  primary,
}: {
  label: string;
  value: string;
  mono?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-2 truncate font-semibold", mono && "font-mono", primary && "text-primary")}>
        {value}
      </div>
    </div>
  );
}

function DeliveryNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground", className)}>{children}</div>;
}

