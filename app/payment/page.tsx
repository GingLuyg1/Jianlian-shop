"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Copy, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type PaymentChannel = {
  code: string;
  channel_code?: string;
  display_name?: string;
  name?: string;
  currency?: string;
  network?: string;
  configured?: boolean;
  enabled?: boolean;
};

type PaymentSession = {
  sessionNo: string;
  status: "pending" | "processing";
  paymentType: "redirect" | "qrcode" | "address";
  paymentUrl?: string;
  qrCodeUrl?: string;
  walletAddress?: string;
  network?: string;
  currency: string;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  expiresAt: string;
};

type PaymentStatus = {
  sessionNo: string;
  status: string;
  paidAt: string | null;
  expiresAt: string | null;
};

function formatMoney(value: number | string | null | undefined, currency = "CNY") {
  const amount = Number(value ?? 0).toFixed(currency === "USDT" ? 6 : 2);
  return currency === "USDT" ? `${amount} USDT` : `¥${amount}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getStatusText(status: string) {
  if (status === "paid") return "支付成功";
  if (status === "processing") return "支付处理中";
  if (status === "failed") return "支付失败";
  if (status === "expired") return "支付超时";
  if (status === "closed") return "订单关闭";
  return "等待支付";
}

function secondsLeft(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("order") || searchParams.get("order_no") || "";
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState("");
  const [nowTick, setNowTick] = useState(0);
  const pollTimer = useRef<number | null>(null);

  const firstItem = order?.order_items?.[0] ?? null;
  const orderStatus = normalizeOrderStatus(order?.status);
  const normalizedPaymentStatus = normalizePaymentStatus(order?.payment_status);
  const canPay =
    Boolean(order) &&
    normalizedPaymentStatus !== "paid" &&
    orderStatus !== "cancelled" &&
    !["closed", "expired", "failed"].includes(String(order?.status ?? ""));
  const currentStatus = paymentStatus?.status ?? order?.payment_status ?? "unpaid";
  const remainingSeconds = secondsLeft(session?.expiresAt) + nowTick * 0;

  const loadOrder = useCallback(async () => {
    if (!orderNo) {
      setError("缺少订单编号");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | { order?: OrderRecord; error?: string }
        | null;

      if (response.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent(`/payment?order=${orderNo}`)}`);
        return;
      }

      if (!response.ok) throw new Error(result?.error ?? "订单读取失败");
      setOrder(result?.order ?? null);
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [orderNo, router]);

  const loadChannels = useCallback(async () => {
    try {
      const response = await fetch("/api/recharges/channels", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | { channels?: PaymentChannel[]; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "支付渠道读取失败");
      const enabled = (result?.channels ?? []).filter((channel) => channel.enabled !== false);
      setChannels(enabled);
      setSelectedChannel((current) => current || enabled[0]?.code || enabled[0]?.channel_code || "");
    } catch (channelError) {
      setError(getOrderErrorMessage(channelError, "支付渠道读取失败"));
    }
  }, []);

  useEffect(() => {
    loadOrder();
    loadChannels();
  }, [loadChannels, loadOrder]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedChannelInfo = useMemo(
    () => channels.find((channel) => (channel.code || channel.channel_code) === selectedChannel) ?? null,
    [channels, selectedChannel]
  );

  async function createSession(channelCode = selectedChannel) {
    if (!order || !channelCode || creatingSession) return;
    setCreatingSession(true);
    setError("");
    setSession(null);
    setPaymentStatus(null);
    try {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: "order",
          businessNo: order.order_no,
          channel: channelCode,
        }),
      });
      const result = (await response.json().catch(() => null)) as (PaymentSession & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? "支付会话创建失败");
      setSession(result);
    } catch (sessionError) {
      setError(getOrderErrorMessage(sessionError, "支付会话创建失败"));
    } finally {
      setCreatingSession(false);
    }
  }

  async function queryStatus(sessionNo: string) {
    const response = await fetch(`/api/payments/status/${encodeURIComponent(sessionNo)}`, { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as (PaymentStatus & { error?: string }) | null;
    if (!response.ok) throw new Error(result?.error ?? "支付状态查询失败");
    setPaymentStatus(result);
    if (result?.status === "paid") {
      await loadOrder();
      router.push(`/order-success?order=${encodeURIComponent(orderNo)}`);
    }
    return result;
  }

  useEffect(() => {
    if (!session?.sessionNo) return;
    if (pollTimer.current) window.clearTimeout(pollTimer.current);

    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden) {
        pollTimer.current = window.setTimeout(tick, 8000);
        return;
      }

      try {
        const status = await queryStatus(session.sessionNo);
        if (["paid", "failed", "expired", "closed"].includes(String(status?.status))) return;
      } catch {
        // 单次状态查询失败不打断收银台，下一轮继续。
      }
      pollTimer.current = window.setTimeout(tick, 5000);
    };

    pollTimer.current = window.setTimeout(tick, 1000);
    return () => {
      stopped = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionNo]);

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">收银台</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              选择已开放的支付方式，创建真实支付会话后完成付款。
            </p>
          </div>
          {order ? (
            <Button variant="outline" asChild>
              <Link href={`/account/orders/${encodeURIComponent(order.order_no)}`}>返回订单</Link>
            </Button>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">正在读取订单...</CardContent>
          </Card>
        ) : !order ? (
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <div className="text-sm text-muted-foreground">订单不存在或无权访问。</div>
              <Button variant="outline" onClick={loadOrder}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  支付方式
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {!canPay ? (
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm text-muted-foreground">
                    当前订单状态不允许继续付款。
                  </div>
                ) : channels.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    暂无已开放的支付方式，请稍后再试或联系在线客服。
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {channels.map((channel) => {
                        const code = channel.code || channel.channel_code || "";
                        const selected = selectedChannel === code;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              setSelectedChannel(code);
                              setSession(null);
                              setPaymentStatus(null);
                            }}
                            className={cn(
                              "rounded-xl border p-3 text-left text-sm transition-colors",
                              selected ? "border-primary bg-orange-50 text-primary" : "border-border bg-white hover:border-primary/50"
                            )}
                          >
                            <div className="font-medium">{channel.display_name || channel.name || code}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {channel.currency || "CNY"}
                              {channel.network ? ` · ${channel.network}` : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      type="button"
                      disabled={!selectedChannel || creatingSession}
                      onClick={() => createSession()}
                    >
                      {creatingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {session ? "重新获取支付信息" : "创建支付会话"}
                    </Button>
                  </>
                )}

                {session ? (
                  <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">支付状态</span>
                      <Badge variant="outline">{getStatusText(currentStatus)}</Badge>
                    </div>
                    <Info label="支付单号" value={session.sessionNo} copyable onCopy={() => copyText(session.sessionNo)} />
                    <Info label="支付金额" value={formatMoney(session.payableAmount, session.currency)} strong />
                    <Info label="支付币种" value={session.currency} />
                    {session.network ? <Info label="网络" value={session.network} /> : null}
                    <Info label="有效时间" value={formatDate(session.expiresAt)} />
                    <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4" />
                      剩余 {Math.floor(remainingSeconds / 60)} 分 {remainingSeconds % 60} 秒
                    </div>

                    {session.qrCodeUrl ? (
                      <div className="rounded-xl bg-white p-4 text-center">
                        <img src={session.qrCodeUrl} alt="支付二维码" className="mx-auto h-48 w-48 rounded-lg object-contain" />
                      </div>
                    ) : null}

                    {session.walletAddress ? (
                      <Info
                        label="收款地址"
                        value={session.walletAddress}
                        copyable
                        onCopy={() => copyText(session.walletAddress!)}
                      />
                    ) : null}

                    {session.paymentUrl ? (
                      <Button asChild>
                        <a href={session.paymentUrl} target="_blank" rel="noreferrer">
                          打开支付页面
                        </a>
                      </Button>
                    ) : null}

                    {!session.qrCodeUrl && !session.walletAddress && !session.paymentUrl ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        该支付方式暂未返回可展示的支付信息，请更换支付方式或稍后重试。
                      </div>
                    ) : null}

                    <Button variant="outline" onClick={() => session.sessionNo && queryStatus(session.sessionNo)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      刷新支付状态
                    </Button>
                  </div>
                ) : selectedChannelInfo?.configured === false ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    该支付方式暂未开放。
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">订单摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="font-medium text-foreground">{firstItem?.product_name ?? "订单商品"}</div>
                {firstItem?.sku_title ? <Info label="规格" value={firstItem.sku_title} /> : null}
                <Info label="订单编号" value={order.order_no} copyable onCopy={() => copyText(order.order_no)} />
                <Info label="数量" value={String(firstItem?.quantity ?? 1)} />
                <Info label="应付金额" value={formatMoney(order.total_amount, order.currency)} strong />
                <Info label="创建时间" value={formatDate(order.created_at)} />
                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-muted-foreground">订单状态</span>
                  <Badge variant="outline" className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                    {getOrderStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">支付状态</span>
                  <Badge variant="outline" className={cn("text-xs", PAYMENT_STATUS_STYLES[normalizedPaymentStatus])}>
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

function Info({
  label,
  value,
  strong,
  copyable,
  onCopy,
}: {
  label: string;
  value: string;
  strong?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {copyable ? (
        <button type="button" onClick={onCopy} className="inline-flex min-w-0 items-center gap-1 truncate font-mono font-medium text-foreground">
          <span className="truncate">{value}</span>
          <Copy className="h-3.5 w-3.5 shrink-0" />
        </button>
      ) : (
        <span className={cn("min-w-0 truncate text-right", strong && "font-semibold text-primary")}>{value}</span>
      )}
    </div>
  );
}
