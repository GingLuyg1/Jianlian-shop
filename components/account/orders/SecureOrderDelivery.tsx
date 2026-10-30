"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clipboard, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { pollForPaymentDelivery } from "@/lib/orders/delivery-polling.mjs";
import { normalizeOrderStatus, normalizePaymentStatus } from "@/lib/orders/order-status";
import { cn } from "@/lib/utils";

type SecureDelivery = {
  id: string;
  product_name?: string | null;
  delivery_type: string | null;
  delivery_status: string | null;
  content: string | null;
  masked_content: string | null;
  delivered_at: string | null;
  delivery_note: string | null;
};

type DeliveryResponse = {
  status?: string;
  deliveries?: SecureDelivery[];
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function SecureOrderDelivery({
  orderNo,
  paymentStatus,
  orderStatus,
  fulfillmentStatus,
  deliveryStatus,
  deliveryType,
  pollUntilDelivered = false,
  onDelivered,
  className,
}: {
  orderNo: string;
  paymentStatus: string | null | undefined;
  orderStatus: string | null | undefined;
  fulfillmentStatus?: string | null;
  deliveryStatus?: string | null;
  deliveryType?: string | null;
  pollUntilDelivered?: boolean;
  onDelivered?: () => void | Promise<void>;
  className?: string;
}) {
  const [deliveryResult, setDeliveryResult] = useState<{ orderNo: string; rows: SecureDelivery[] }>({ orderNo, rows: [] });
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);
  const [pollOutcome, setPollOutcome] = useState<"idle" | "polling" | "timeout" | "error" | "delivered">("idle");
  const [visibleIds, setVisibleIds] = useState<Record<string, boolean>>({});
  const activeRequestRef = useRef<{ orderNo: string; controller: AbortController } | null>(null);
  const deliveredNotifiedRef = useRef(false);

  const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);
  const normalizedOrderStatus = normalizeOrderStatus(orderStatus);
  const cancelled = normalizedOrderStatus === "cancelled";
  const failed = normalizedOrderStatus === "failed" || deliveryStatus === "failed";
  const deliveredHint = fulfillmentStatus === "delivered"
    || normalizedOrderStatus === "delivered"
    || deliveryStatus === "delivered";
  // Never render the previous order's private content, even during the render
  // before the context-reset effect has run.
  const deliveries = deliveryResult.orderNo === orderNo ? deliveryResult.rows : [];
  const deliveredRows = deliveries.filter((delivery) => delivery.delivery_status === "delivered");
  const delivered = deliveredRows.length > 0;

  const loadDelivery = useCallback(async () => {
    if (!orderNo || normalizedPaymentStatus !== "paid") return "pending" as const;
    const active = activeRequestRef.current;
    if (active?.orderNo === orderNo && !active.controller.signal.aborted) return "pending" as const;
    active?.controller.abort();
    const request = { orderNo, controller: new AbortController() };
    activeRequestRef.current = request;
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/delivery`, { cache: "no-store", signal: request.controller.signal });
      const result = (await response.json().catch(() => null)) as DeliveryResponse | null;
      if (activeRequestRef.current !== request || request.controller.signal.aborted) return "pending" as const;
      if (!response.ok) throw new Error("DELIVERY_LOAD_FAILED");
      setDeliveryResult({ orderNo, rows: result?.deliveries ?? [] });
      setError(false);
      return (result?.deliveries ?? []).some((delivery) => delivery.delivery_status === "delivered")
        ? "delivered" as const
        : "pending" as const;
    } catch {
      if (activeRequestRef.current !== request || request.controller.signal.aborted) return "pending" as const;
      setError(true);
      return "error" as const;
    } finally {
      if (activeRequestRef.current === request && !request.controller.signal.aborted) {
        setRequested(true);
        activeRequestRef.current = null;
        setLoading(false);
      }
    }
  }, [normalizedPaymentStatus, orderNo]);

  useEffect(() => {
    setDeliveryResult({ orderNo, rows: [] });
    setLoading(false);
    setError(false);
    setRequested(false);
    setVisibleIds({});
    setPollOutcome("idle");
    deliveredNotifiedRef.current = false;
    if (normalizedPaymentStatus === "paid" && !pollUntilDelivered) void loadDelivery();
    return () => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    };
  }, [loadDelivery, normalizedPaymentStatus, orderNo, pollUntilDelivered]);

  useEffect(() => {
    if (!delivered || deliveredNotifiedRef.current) return;
    deliveredNotifiedRef.current = true;
    void onDelivered?.();
  }, [delivered, onDelivered]);

  useEffect(() => {
    if (!pollUntilDelivered || normalizedPaymentStatus !== "paid" || delivered || cancelled || failed) return;
    const controller = new AbortController();
    setPollOutcome("polling");
    void pollForPaymentDelivery({ load: loadDelivery, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted || result.kind === "cancelled") return;
      if (result.kind === "delivered" || result.kind === "timeout" || result.kind === "error") {
        setPollOutcome(result.kind);
      }
    });
    return () => {
      controller.abort();
    };
  }, [cancelled, delivered, failed, loadDelivery, normalizedPaymentStatus, pollUntilDelivered]);

  async function copyContent(content: string | null) {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success("交付内容已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <section data-testid="card-secret-panel" className={cn("rounded-xl border border-orange-100 bg-white p-4 text-sm", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold text-slate-950">卡密信息</div>
        {normalizedPaymentStatus === "paid" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void loadDelivery()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {error ? "重新加载交付信息" : "刷新交付信息"}
          </Button>
        ) : null}
      </div>

      {cancelled ? (
        <div className="rounded-lg bg-slate-50 p-3 text-muted-foreground">订单已取消，不显示交付内容。</div>
      ) : failed ? (
        <div className="rounded-lg bg-amber-50 p-3 text-amber-700">交付失败，请联系客服处理。</div>
      ) : normalizedPaymentStatus !== "paid" ? (
        <div className="rounded-lg bg-slate-50 p-3 text-muted-foreground">订单支付完成后可查看交付内容。</div>
      ) : error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">
          交付信息加载失败，请刷新后重试
        </div>
      ) : loading && !requested ? (
        <div className="rounded-lg bg-slate-50 p-3 text-muted-foreground">正在读取交付信息...</div>
      ) : delivered ? (
        <div data-testid="card-secret-content" className="divide-y divide-slate-200/70 overflow-hidden rounded-lg bg-slate-50 px-3">
          {deliveredRows.map((delivery) => {
            const visible = Boolean(visibleIds[delivery.id]);
            return (
              <div key={delivery.id} data-testid="card-secret-row" className="min-w-0 py-3">
                {delivery.product_name ? <div className="mb-2 font-medium text-slate-900">{delivery.product_name}</div> : null}
                <div data-testid="card-secret-value" className="whitespace-pre-wrap break-words font-mono text-slate-900">
                  {visible ? delivery.content || delivery.masked_content || "—" : delivery.masked_content || "••••••••"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">交付时间：{formatDate(delivery.delivered_at)}</div>
                {delivery.delivery_note ? <div className="mt-2 text-xs text-muted-foreground">{delivery.delivery_note}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setVisibleIds((current) => ({ ...current, [delivery.id]: !visible }))}
                  >
                    {visible ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {visible ? "隐藏完整内容" : "显示完整内容"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyContent(delivery.content)} disabled={!delivery.content}>
                    <Clipboard className="mr-2 h-4 w-4" />
                    复制
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-muted-foreground">
          <div>
            {pollOutcome === "timeout"
              ? "支付成功，交付内容仍在准备中。"
              : deliveredHint
                ? "正在同步交付内容……"
                : ["manual", "manual_delivery"].includes(String(deliveryType ?? ""))
                  ? "支付已完成，等待人工交付。"
                  : "支付成功，正在准备交付内容……"}
          </div>
          {pollOutcome === "timeout" ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/account/orders">查看我的订单</Link>
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
