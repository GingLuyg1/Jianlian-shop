"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Home } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getOrderStatusLabel,
  getPaymentStatusLabel,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
  normalizeOrderStatus,
  normalizePaymentStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const orderNo =
    searchParams.get("order_no") || searchParams.get("orderNo") || "";
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrder() {
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

        if (!response.ok) {
          throw new Error(result?.error ?? "订单读取失败");
        }

        if (active) setOrder(result?.order ?? null);
      } catch (loadError) {
        if (active) setError(getOrderErrorMessage(loadError, "订单读取失败"));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadOrder();
    return () => {
      active = false;
    };
  }, [orderNo]);

  const productName = order?.order_items?.[0]?.product_name ?? "订单商品";
  const orderStatus = normalizeOrderStatus(order?.status);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>

            <h1 className="mb-3 text-xl font-bold text-foreground">
              订单创建成功
            </h1>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
              订单已创建，请按照页面说明完成付款或等待客服处理。
            </p>

            {loading ? (
              <div className="rounded-xl border bg-slate-50 p-6 text-sm text-muted-foreground">
                正在读取订单...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : order ? (
              <div className="mb-6 space-y-3 text-left">
                <InfoRow label="订单号" value={order.order_no} mono />
                <InfoRow label="商品名称" value={productName} />
                <InfoRow
                  label="应付金额"
                  value={`¥${Number(order.total_amount).toFixed(2)}`}
                  primary
                />
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">订单状态</span>
                  <Badge
                    variant="outline"
                    className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}
                  >
                    {getOrderStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">支付状态</span>
                  <Badge
                    variant="outline"
                    className={cn("text-xs", PAYMENT_STATUS_STYLES[paymentStatus])}
                  >
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
                <InfoRow
                  label="创建时间"
                  value={new Date(order.created_at).toLocaleString("zh-CN", {
                    hour12: false,
                  })}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" asChild>
                <Link href={`/account/orders/${encodeURIComponent(orderNo)}`}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  查看订单
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
  mono,
  primary,
}: {
  label: string;
  value: string;
  mono?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-medium",
          mono && "font-mono",
          primary && "font-bold text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}
