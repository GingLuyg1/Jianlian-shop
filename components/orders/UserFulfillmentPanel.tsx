"use client";

import { useState } from "react";
import { Clipboard, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderRecord } from "@/lib/orders/order-types";
import {
  computeOrderFulfillmentStatus,
  getOrderFulfillmentStatusLabel,
  getOrderItemDeliveryStatusLabel,
  getOrderItemDeliveryTypeLabel,
  summarizeFulfillmentItems,
} from "@/lib/orders/order-fulfillment-status";

type FulfillmentDelivery = {
  order_item_id: string;
  product_name: string;
  delivery_status: string;
  delivery_type: string;
  quantity: number;
  delivered_quantity: number;
  delivered_at: string | null;
  masked_content: string | null;
  content: string | null;
  delivery_note: string | null;
};

function statusClass(status: string) {
  if (status === "delivered" || status === "not_required") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "processing") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function maskSecret(value: string | null | undefined) {
  if (!value) return "********";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

export default function UserFulfillmentPanel({ order }: { order: OrderRecord }) {
  const [deliveries, setDeliveries] = useState<FulfillmentDelivery[]>([]);
  const [showFull, setShowFull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const summaries = summarizeFulfillmentItems(order.order_items ?? [], order.order_deliveries ?? []);
  const aggregate = computeOrderFulfillmentStatus(summaries);

  async function loadFulfillment() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.order_no)}/fulfillment`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { deliveries?: FulfillmentDelivery[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "交付信息读取失败");
      setDeliveries(payload?.deliveries ?? []);
      setShowFull(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "交付信息读取失败");
    } finally {
      setLoading(false);
    }
  }

  async function copyContent(content: string | null) {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    toast.success("交付内容已复制");
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">订单项交付</h3>
          <p className="mt-1 text-xs text-muted-foreground">按商品单独展示交付状态，完整内容仅在点击后从服务端读取。</p>
        </div>
        <Badge variant="outline" className={statusClass(aggregate)}>{getOrderFulfillmentStatusLabel(aggregate)}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {summaries.map((item) => {
          const loaded = deliveries.find((delivery) => delivery.order_item_id === item.itemId);
          const content = loaded?.content ?? null;
          const masked = loaded?.masked_content ?? maskSecret(content);
          return (
            <div key={item.itemId} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{item.productName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {getOrderItemDeliveryTypeLabel(item.deliveryType)} · 数量 {item.quantity} · 已交付 {item.deliveredQuantity}
                  </div>
                </div>
                <Badge variant="outline" className={statusClass(item.deliveryStatus)}>
                  {getOrderItemDeliveryStatusLabel(item.deliveryStatus, item.deliveryType)}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">交付时间：{formatDate(item.deliveredAt)}</div>
              {item.deliveryStatus === "delivered" ? (
                <div className="mt-2 rounded-md border bg-white p-3 font-mono text-xs">
                  {showFull && content ? content : maskSecret(masked)}
                </div>
              ) : item.deliveryStatus === "failed" ? (
                <div className="mt-2 text-xs text-amber-700">正在人工处理，请联系客服。</div>
              ) : item.deliveryStatus === "not_required" ? (
                <div className="mt-2 text-xs text-emerald-700">该商品无需卡密交付。</div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">正在处理。</div>
              )}
              {loaded?.delivery_note ? <div className="mt-2 text-xs text-muted-foreground">{loaded.delivery_note}</div> : null}
              {showFull && content ? (
                <div className="mt-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => copyContent(content)}>
                    <Clipboard className="mr-2 h-4 w-4" />复制内容
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowFull((value) => !value)} disabled={!deliveries.some((item) => item.content)}>
          {showFull ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {showFull ? "隐藏完整内容" : "显示已读取内容"}
        </Button>
        <Button variant="outline" size="sm" onClick={loadFulfillment} disabled={loading}>
          {loading ? "读取中..." : "查看交付内容"}
        </Button>
      </div>
      {error ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{error}</div> : null}
    </section>
  );
}
