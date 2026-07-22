"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clipboard, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  const [deliveries, setDeliveries] = useState<SecureDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);
  const [visibleIds, setVisibleIds] = useState<Record<string, boolean>>({});
  const loadingRef = useRef(false);
  const deliveredNotifiedRef = useRef(false);
  const pollStartedAtRef = useRef(0);

  const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);
  const normalizedOrderStatus = normalizeOrderStatus(orderStatus);
  const cancelled = normalizedOrderStatus === "cancelled";
  const failed = normalizedOrderStatus === "failed" || deliveryStatus === "failed";
  const deliveredHint = fulfillmentStatus === "delivered"
    || normalizedOrderStatus === "delivered"
    || deliveryStatus === "delivered";
  const deliveredRows = deliveries.filter((delivery) => delivery.delivery_status === "delivered");
  const delivered = deliveredRows.length > 0;

  const loadDelivery = useCallback(async () => {
    if (!orderNo || normalizedPaymentStatus !== "paid" || loadingRef.current) return false;
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/delivery`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as DeliveryResponse | null;
      if (!response.ok) throw new Error("DELIVERY_LOAD_FAILED");
      setDeliveries(result?.deliveries ?? []);
      setError(false);
      return (result?.deliveries ?? []).some((delivery) => delivery.delivery_status === "delivered");
    } catch {
      setError(true);
      return false;
    } finally {
      setRequested(true);
      loadingRef.current = false;
      setLoading(false);
    }
  }, [normalizedPaymentStatus, orderNo]);

  useEffect(() => {
    setDeliveries([]);
    setError(false);
    setRequested(false);
    setVisibleIds({});
    deliveredNotifiedRef.current = false;
    pollStartedAtRef.current = Date.now();
    if (normalizedPaymentStatus === "paid") void loadDelivery();
  }, [loadDelivery, normalizedPaymentStatus, orderNo]);

  useEffect(() => {
    if (!delivered || deliveredNotifiedRef.current) return;
    deliveredNotifiedRef.current = true;
    void onDelivered?.();
  }, [delivered, onDelivered]);

  useEffect(() => {
    if (!pollUntilDelivered || normalizedPaymentStatus !== "paid" || delivered || cancelled || failed) return;
    let stopped = false;
    let timer: number | null = null;

    const schedule = () => {
      if (stopped) return;
      if (timer !== null) window.clearTimeout(timer);
      const elapsed = Date.now() - pollStartedAtRef.current;
      const delay = document.hidden ? 15000 : elapsed < 120000 ? 4000 : 10000;
      timer = window.setTimeout(tick, delay);
    };
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) {
        const found = await loadDelivery();
        if (found) return;
      }
      schedule();
    };

    const handleVisibilityChange = () => {
      if (stopped || document.hidden) return;
      if (timer !== null) window.clearTimeout(timer);
      void tick();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
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
    <section className={cn("rounded-xl border border-orange-100 bg-white p-4 text-sm", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold text-slate-950">数字交付</div>
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
        <div className="space-y-3">
          {deliveredRows.map((delivery) => {
            const visible = Boolean(visibleIds[delivery.id]);
            return (
              <div key={delivery.id} className="rounded-lg bg-slate-50 p-3">
                {delivery.product_name ? <div className="mb-2 font-medium text-slate-900">{delivery.product_name}</div> : null}
                <div className="whitespace-pre-wrap break-words font-mono text-slate-900">
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
        <div className="rounded-lg bg-slate-50 p-3 text-muted-foreground">
          {deliveredHint
            ? "正在同步交付内容……"
            : ["manual", "manual_delivery"].includes(String(deliveryType ?? ""))
              ? "支付已完成，等待人工交付。"
              : "支付已完成，正在准备交付内容……"}
        </div>
      )}
    </section>
  );
}
