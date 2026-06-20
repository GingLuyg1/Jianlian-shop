"use client";

import { useCallback, useEffect, useState } from "react";
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
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

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
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

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

  const orderStatus = normalizeOrderStatus(order?.status);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);
  const delivery = order?.order_deliveries?.[0];
  const deliveryContent = delivery?.delivery_content ?? "";
  const deliveryFailed = orderStatus === "failed" || delivery?.delivery_status === "failed";
  const cancelled = orderStatus === "cancelled";

  async function copyDeliveryContent() {
    if (!deliveryContent) return;
    await navigator.clipboard.writeText(deliveryContent);
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
                  <InfoCard
                    label="订单金额"
                    value={`¥${Number(order.total_amount).toFixed(2)}`}
                    primary
                  />
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs text-muted-foreground">状态</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}
                      >
                        {getOrderStatusLabel(order.status)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", PAYMENT_STATUS_STYLES[paymentStatus])}
                      >
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
                        <div className="font-semibold text-primary">
                          ¥{Number(item.line_total).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">交付信息</h3>
                    {deliveryContent ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowDelivery((value) => !value)}>
                          {showDelivery ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                          {showDelivery ? "隐藏完整内容" : "查看完整内容"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={copyDeliveryContent}>
                          <Clipboard className="mr-2 h-4 w-4" />
                          复制
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    {cancelled ? (
                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
                        订单已取消，不显示交付内容。
                      </div>
                    ) : deliveryFailed ? (
                      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                        交付处理中，请联系管理员。
                      </div>
                    ) : deliveryContent ? (
                      <div className="rounded-lg bg-slate-50 p-3 text-sm leading-6">
                        <div className="whitespace-pre-wrap break-words">
                          {showDelivery ? deliveryContent : maskSecret(deliveryContent)}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          交付时间：{delivery?.delivered_at ? new Date(delivery.delivered_at).toLocaleString("zh-CN", { hour12: false }) : "未记录"}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
                        等待交付。
                      </div>
                    )}
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
                          {new Date(log.created_at).toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {canUserCancelOrder(order.status) ? (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      disabled={submitting}
                      onClick={cancelOrder}
                    >
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
      <div
        className={cn(
          "mt-2 truncate font-semibold",
          mono && "font-mono",
          primary && "text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}
