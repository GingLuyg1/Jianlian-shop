"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Clipboard, Eye, EyeOff, Headphones, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { pollForPaymentDelivery } from "@/lib/orders/delivery-polling.mjs";
import { normalizeOrderStatus, normalizePaymentStatus } from "@/lib/orders/order-status";
import { openPublicSupport } from "@/lib/support/open-public-support";
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
  needs_support?: boolean;
  message?: string;
  deliveries?: SecureDelivery[];
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getMatchedTutorialForProduct(productName?: string | null): { href: string; label: string } {
  const normalized = String(productName ?? "").toLowerCase();
  if (/gemini|google\s*ai|学生认证|sheerid/.test(normalized)) {
    return /学生|sheerid|认证/.test(normalized)
      ? { href: "/tutorials?topic=google-region&guide=student-discount", label: "查看学生认证教程" }
      : { href: "/tutorials?topic=gemini", label: "查看 Gemini 使用教程" };
  }
  if (/apple\s*id|苹果\s*id|美区\s*id|日区\s*id/.test(normalized)) {
    return { href: "/tutorials?topic=apple-id", label: "查看 Apple ID 教程" };
  }
  if (/chatgpt|openai|codex|\bplus\b|\bpro\b/.test(normalized) && !/grok|gemini|claude/.test(normalized)) {
    return { href: "/tutorials?topic=chatgpt-guide", label: "查看 ChatGPT 保号教程" };
  }
  if (/giffgaff/.test(normalized)) {
    return { href: "/tutorials?topic=giffgaff", label: "查看 Giffgaff 激活教程" };
  }
  if (/haha\s*sim|haha\s*travel/.test(normalized)) {
    return { href: "/tutorials?topic=haha-sim", label: "查看 Haha SIM 教程" };
  }
  if (/one\s*nz|onenz|新西兰/.test(normalized)) {
    return { href: "/tutorials?topic=one-nz", label: "查看 One NZ 教程" };
  }
  if (/rakuten|乐天/.test(normalized)) {
    return { href: "/tutorials?topic=rakuten-mobile", label: "查看日本乐天 SIM 教程" };
  }
  if (/gmail|google|谷歌/.test(normalized)) {
    return { href: "/tutorials?topic=google-region", label: "查看 Google 改区教程" };
  }
  if (/facebook|\bfb\b|脸书/.test(normalized)) {
    return { href: "/tutorials?topic=facebook", label: "查看 Facebook 登录教程" };
  }
  if (/twitter|推特|supergrok|\bgrok\b|\bx\s*账号|\bx账号/.test(normalized)) {
    return { href: "/tutorials?topic=twitter", label: "查看 X (Twitter) 教程" };
  }
  return { href: "/tutorials?topic=required", label: "查看使用与核验指南" };
}

export function SecureOrderDelivery({
  orderNo,
  paymentStatus,
  orderStatus,
  fulfillmentStatus,
  deliveryStatus,
  deliveryType,
  fallbackProductName,
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
  fallbackProductName?: string | null;
  pollUntilDelivered?: boolean;
  onDelivered?: () => void | Promise<void>;
  className?: string;
}) {
  const [deliveryResult, setDeliveryResult] = useState<{ orderNo: string; rows: SecureDelivery[] }>({ orderNo, rows: [] });
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);
  const [manualSupportMessage, setManualSupportMessage] = useState("");
  const [pollOutcome, setPollOutcome] = useState<"idle" | "polling" | "timeout" | "error" | "delivered" | "manual_review">("idle");
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
      const hasDelivered = (result?.deliveries ?? []).some((delivery) => delivery.delivery_status === "delivered");
      if (hasDelivered) {
        setManualSupportMessage("");
        return "delivered" as const;
      }
      if (result?.status === "manual_review" || result?.needs_support) {
        setManualSupportMessage(
          result.message || "订单已付款，交付需要人工核对。请携带订单号联系在线客服或提交工单。"
        );
        return "manual_review" as const;
      }
      setManualSupportMessage("");
      return "pending" as const;
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
    setManualSupportMessage("");
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
      if (result.kind === "delivered" || result.kind === "timeout" || result.kind === "error" || result.kind === "manual_review") {
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
            const tutorialAction = getMatchedTutorialForProduct(delivery.product_name ?? fallbackProductName);
            return (
              <div key={delivery.id} data-testid="card-secret-row" className="min-w-0 py-3">
                {delivery.product_name ? <div className="mb-2 font-medium text-slate-900">{delivery.product_name}</div> : null}
                <div data-testid="card-secret-value" className="whitespace-pre-wrap break-words font-mono text-slate-900">
                  {visible ? delivery.content || delivery.masked_content || "—" : delivery.masked_content || "••••••••"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">交付时间：{formatDate(delivery.delivered_at)}</div>
                {delivery.delivery_note ? <div className="mt-2 text-xs text-muted-foreground">{delivery.delivery_note}</div> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
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
                  <Button type="button" size="sm" variant="ghost" className="text-primary hover:bg-orange-50 hover:text-primary" asChild>
                    <Link href={tutorialAction.href}>
                      <BookOpen className="mr-1.5 h-4 w-4" />
                      {tutorialAction.label} →
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : manualSupportMessage ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-amber-900" role="status">
          <div className="font-semibold">已付款 · 需要人工核对</div>
          <p className="text-xs leading-5 text-amber-800 sm:text-sm">{manualSupportMessage}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={openPublicSupport} className="rounded-xl text-xs">
              <Headphones className="mr-1.5 h-3.5 w-3.5" />
              联系在线客服
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-xl border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-50" asChild>
              <Link href="/faq">提交工单</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-muted-foreground">
          <div role="status">
            {pollOutcome === "timeout"
              ? "已付款，交付仍在处理中。请携带订单号联系在线客服，或稍后刷新查看。"
              : deliveredHint
                ? "正在同步交付内容……"
                : ["manual", "manual_delivery"].includes(String(deliveryType ?? ""))
                  ? "支付已完成，等待人工交付。"
                  : "支付成功，正在准备交付内容……"}
          </div>
          {pollOutcome === "timeout" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href="/account/orders">查看我的订单</Link>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={openPublicSupport}>
                <Headphones className="mr-1.5 h-3.5 w-3.5" />
                联系在线客服
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
