"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clipboard, ClipboardList, Home, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

function formatMoney(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatShippingAddress(value: Record<string, unknown> | null) {
  if (!value) return "无";
  const region = typeof value.region === "string" ? value.region : "";
  const address = typeof value.address === "string" ? value.address : "";
  const recipient = typeof value.recipient === "string" ? value.recipient : "";
  const phone = typeof value.phone === "string" ? value.phone : "";
  return [recipient, phone, region, address].filter(Boolean).join(" ") || "无";
}

export default function OrderSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("order_no") || searchParams.get("orderNo") || "";
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrder = useCallback(async () => {
    if (!orderNo) {
      setError("缺少订单编号");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`);
      const result = (await response.json().catch(() => null)) as
        | { order?: OrderRecord; error?: string }
        | null;

      if (response.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent(`/order-success?order_no=${orderNo}`)}`);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrder(result?.order ?? null);
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [orderNo, router]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const firstItem = order?.order_items?.[0] ?? null;
  const productName = firstItem?.product_name ?? "订单商品";
  const quantity = firstItem?.quantity ?? 1;
  const orderStatus = normalizeOrderStatus(order?.status);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);

  async function copyOrderNo() {
    if (!order?.order_no) return;
    await navigator.clipboard.writeText(order.order_no);
    toast.success("订单编号已复制");
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>

            <h1 className="mb-3 text-xl font-bold text-foreground">订单创建成功</h1>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
              订单已创建，当前暂未接入真实支付。请在我的订单中继续查看处理状态。
            </p>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-sm text-muted-foreground">
                正在读取订单...
              </div>
            ) : error ? (
              <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div>{error}</div>
                <Button type="button" variant="outline" size="sm" onClick={loadOrder}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新加载
                </Button>
              </div>
            ) : order ? (
              <div className="mb-6 space-y-3 text-left">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">订单编号</span>
                  <button
                    type="button"
                    onClick={copyOrderNo}
                    className="inline-flex min-w-0 items-center gap-2 rounded-md px-2 py-1 font-mono font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="truncate">{order.order_no}</span>
                    <Clipboard className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>
                <InfoRow label="下单时间" value={formatDate(order.created_at)} />
                <InfoRow label="商品名称" value={productName} />
                <InfoRow label="购买数量" value={String(quantity)} />
                <InfoRow label="订单金额" value={formatMoney(order.total_amount)} primary />
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">订单状态</span>
                  <Badge variant="outline" className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                    {getOrderStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">支付状态</span>
                  <Badge variant="outline" className={cn("text-xs", PAYMENT_STATUS_STYLES[paymentStatus])}>
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
                <InfoRow
                  label="交付方式"
                  value={getDeliveryLabel(order.delivery_type ?? firstItem?.delivery_type)}
                />
                <InfoRow label="收货信息" value={formatShippingAddress(order.shipping_address)} />
                <InfoRow label="订单备注" value={order.customer_note || "无"} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                订单不存在或无权限查看。
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" asChild>
                <Link href="/account/orders">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  查看我的订单
                </Link>
              </Button>
              <Button asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  返回商城
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function InfoRow({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium", primary && "font-bold text-primary")}>
        {value}
      </span>
    </div>
  );
}
