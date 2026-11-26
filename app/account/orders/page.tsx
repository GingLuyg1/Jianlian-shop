"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Clipboard, ClipboardList, Copy, Headphones, LogIn, Mail, PackageCheck, Search, ShieldCheck, Truck, X } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Bep20OrderPaymentSummary } from "@/components/account/orders/Bep20OrderPaymentSummary";
import { SecureOrderDelivery } from "@/components/account/orders/SecureOrderDelivery";
import { usePublicAuthProfile } from "@/components/auth/AuthProfileProvider";
import TurnstileWidget from "@/components/security/TurnstileWidget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isGuestAuthUser } from "@/lib/auth/guest-user";
import { fetchWithTimeout } from "@/lib/network/fetch-with-timeout";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { normalizeOrderItemDeliveryType } from "@/lib/orders/order-fulfillment-status";
import {
  getBep20PaymentAction,
  getBep20PaymentNotice,
  getUserOrderDisplayStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { isShippingOrderRecord, parseOrderShippingInfo } from "@/lib/orders/shipping-info";
import { openPublicSupport } from "@/lib/support/open-public-support";
import { cn } from "@/lib/utils";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/orders/OrdersGlass.module.css";
import { accountRecordPreload } from "@/lib/account/record-preload";
import { useAccountRecordIdentity } from "@/hooks/use-account-record-identity";

const PAGE_SIZE = 10;

type GuestLookupOrder = {
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    productName: string;
    skuTitle: string | null;
    skuCode: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

function formatMoney(value: number | string | null | undefined, currency = "CNY") {
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "未记录";
  return dt.toLocaleString("zh-CN", { hour12: false });
}

function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

function guestStatusLabel(value: string) {
  const map: Record<string, string> = {
    pending_payment: "待支付",
    paid: "已支付",
    processing: "处理中",
    delivered: "已发货",
    completed: "已完成",
    cancelled: "已取消",
    expired: "已过期",
    refunded: "已退款",
    failed: "处理失败",
    unpaid: "未支付",
    pending: "待处理",
  };
  return map[value] ?? (value || "—");
}

function guestStatusBadgeClass(status: string) {
  if (status === "delivered" || status === "completed" || status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "pending_payment" || status === "processing") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "cancelled" || status === "expired" || status === "failed") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }
  return "border-orange-200 bg-orange-50 text-orange-700";
}

export default function MyOrdersPage() {
  const router = useRouter();
  const identity = useAccountRecordIdentity();
  const { user: authUser, authReady } = usePublicAuthProfile();
  const isSignedInMember = authReady && Boolean(authUser) && !isGuestAuthUser(authUser);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [storedCount, setCount] = useState(0);
  const [loadedEpoch, setLoadedEpoch] = useState(identity.epoch);
  const [page, setPage] = useState(1);
  const [queryOpen, setQueryOpen] = useState(false);
  const [guestInitialEmail, setGuestInitialEmail] = useState("");
  const [guestInitialOrders, setGuestInitialOrders] = useState<GuestLookupOrder[] | null>(null);
  const [requestLoading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [selectedGuestOrder, setSelectedGuestOrder] = useState<GuestLookupOrder | null>(null);

  // Inline guest email form state (when unauthenticated) — keeps CF Turnstile here only (not inside popup)
  const [guestEmailInput, setGuestEmailInput] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [guestSearching, setGuestSearching] = useState(false);
  const [guestError, setGuestError] = useState("");

  const listRequest = useRef<{ page: number; epoch: number; controller: AbortController; promise?: Promise<void> } | null>(null);
  const ownerMatches = loadedEpoch === identity.epoch;
  const count = ownerMatches ? storedCount : 0;
  const loading = isSignedInMember ? (requestLoading || !ownerMatches) : !authReady;

  useEffect(() => {
    setSelectedOrder(null);
    setSelectedGuestOrder(null);
    setQueryOpen(false);
    setPage(1);
  }, [identity.epoch]);

  useEffect(() => {
    if (isSignedInMember) return;
    let active = true;
    void fetch("/api/order-query", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((payload: { turnstileEnabled?: boolean; turnstileSiteKey?: string } | null) => {
        if (!active || !payload) return;
        setTurnstileEnabled(Boolean(payload.turnstileEnabled));
        setTurnstileSiteKey(String(payload.turnstileSiteKey || ""));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSignedInMember]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const loadOrders = useCallback((force = false) => {
    if (!isSignedInMember) {
      setLoading(false);
      setOrders([]);
      setCount(0);
      setLoadedEpoch(identity.epoch);
      return Promise.resolve();
    }
    const prior = listRequest.current;
    if (!force && prior?.page === page && prior.epoch === identity.epoch && !prior.controller.signal.aborted) return prior.promise;
    prior?.controller.abort();
    const request = { page, epoch: identity.epoch, controller: new AbortController(), promise: undefined as Promise<void> | undefined };
    const epoch = request.epoch;
    listRequest.current = request;
    const isCurrent = () => listRequest.current === request && !request.controller.signal.aborted && accountRecordPreload.getSnapshot().epoch === epoch;
    setLoading(true);
    setError("");

    request.promise = (async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store", signal: request.controller.signal });
      const result = (await response.json().catch(() => null)) as {
        orders?: OrderRecord[];
        count?: number;
        error?: string;
      } | null;
      if (!isCurrent()) return;

      if (response.status === 401) {
        setOrders([]);
        setCount(0);
        setLoadedEpoch(epoch);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrders(result?.orders ?? []);
      setCount(Number(result?.count ?? 0));
      setLoadedEpoch(epoch);
      accountRecordPreload.rememberOrderProductNames(result?.orders ?? []);
    } catch (loadError) {
      if (isCurrent()) { setOrders([]); setCount(0); setLoadedEpoch(epoch); setError(getOrderErrorMessage(loadError, "订单读取失败")); }
    } finally {
      if (isCurrent()) { setLoading(false); listRequest.current = null; }
    }
    })();
    return request.promise;
  }, [page, isSignedInMember, identity.epoch]);

  useEffect(() => {
    if (!authReady) return;
    void loadOrders();
    return () => { listRequest.current?.controller.abort(); listRequest.current = null; };
  }, [authReady, loadOrders]);

  const refreshSelectedOrder = useCallback(async (orderNo: string) => {
    const epoch = identity.epoch;
    const refreshDetail = async () => {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { order?: OrderRecord; error?: string } | null;
      if (!response.ok || !result?.order) {
        throw new Error(result?.error ?? "订单状态刷新失败");
      }
      if (accountRecordPreload.getSnapshot().epoch === epoch) setSelectedOrder((current) => current?.order_no === orderNo ? result.order! : current);
    };
    await Promise.all([refreshDetail(), loadOrders(true)]);
  }, [loadOrders, identity.epoch]);

  const rows = useMemo(() => ownerMatches ? orders : [], [orders, ownerMatches]);

  async function copyOrderNo(orderNo: string) {
    try { await navigator.clipboard.writeText(orderNo); toast.success("订单编号已复制"); }
    catch { toast.error("复制失败，请手动复制"); }
  }

  async function handleGuestInlineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guestSearching) return;
    setGuestError("");
    const normalized = guestEmailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setGuestError("请输入下单时填写的有效邮箱地址。");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setGuestError("请先完成下方 Cloudflare 人机验证后再查询。");
      return;
    }
    setGuestSearching(true);
    try {
      const response = await fetchWithTimeout("/api/order-query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "email",
          email: normalized,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { orders?: GuestLookupOrder[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "订单查询失败，请稍后重试");
      }
      setGuestInitialEmail(normalized);
      setGuestInitialOrders(Array.isArray(payload?.orders) ? payload!.orders : []);
      setQueryOpen(true);
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : "订单查询失败，请稍后重试");
    } finally {
      if (turnstileEnabled) {
        setTurnstileToken("");
        setTurnstileResetSignal((v) => v + 1);
      }
      setGuestSearching(false);
    }
  }

  return (
    <div data-testid="orders-glass-page" data-account-orders-ready={!loading} className={cn(styles.page, "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}>
      <Card className={cn(glass.surface, "flex min-h-[340px] min-w-0 flex-1 flex-col overflow-hidden sm:min-h-[480px] md:min-h-0")}>
          <CardHeader className={cn(glass.hero, "shrink-0 px-5 py-5 md:px-6 md:py-6")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className={cn(glass.icon, "h-12 w-12")}><ClipboardList className="h-6 w-6" strokeWidth={1.6} /></span>
                <div className="min-w-0">
                <CardTitle className="text-xl">订单查询</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSignedInMember
                    ? "查看当前账号的订单记录，也可按任意下单邮箱快捷查单。"
                    : "无需登录，输入下单时填写的邮箱即可查询订单状态与发货进度。"}
                </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isSignedInMember ? (
                  <Button variant="outline" size="sm" className={cn(glass.button, "rounded-xl")} onClick={() => setQueryOpen(true)}>
                    <Search className="mr-2 h-4 w-4" />
                    邮箱订单查询
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className={cn(glass.button, "rounded-xl")} asChild>
                      <Link href="/login?redirect=/account/orders">
                        <LogIn className="mr-1.5 h-4 w-4" />
                        登录查看账号订单
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 min-w-0 flex-1 overflow-hidden px-4 pb-0 md:px-6">
            {loading ? (
              <div className="relative w-full space-y-2.5">
                {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                  <div key={index} className={cn(glass.inset, "h-12 animate-pulse rounded-xl motion-reduce:animate-none")} />
                ))}
                <div role="status" className="absolute inset-0 flex items-center justify-center bg-white/45 backdrop-blur-[2px]"><div className={cn(glass.inset, "flex items-center gap-3 rounded-full px-5 py-3 text-sm text-primary shadow-sm")}><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary motion-reduce:animate-none" />正在加载订单</div></div>
              </div>
            ) : !isSignedInMember ? (
              <div className="flex min-h-0 flex-1 items-center justify-center py-6">
                <div
                  data-testid="guest-orders-query-card"
                  className={cn(glass.inset, "w-full max-w-lg rounded-2xl border border-orange-100/90 bg-white/85 p-6 shadow-sm sm:p-7")}
                >
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">游客免登录邮箱查单</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        输入下单时绑定的收货/接收邮箱，查询匹配订单列表与实时进度。
                      </p>
                    </div>
                  </div>
                  <form onSubmit={handleGuestInlineSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="orders-guest-email" className="mb-1.5 block text-xs font-semibold text-slate-700">
                        下单邮箱
                      </label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="orders-guest-email"
                          type="email"
                          value={guestEmailInput}
                          onChange={(e) => {
                            setGuestEmailInput(e.target.value);
                            if (guestError) setGuestError("");
                          }}
                          placeholder="请输入下单时填写的邮箱地址"
                          className="h-11 bg-white pl-9"
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    {turnstileSiteKey ? (
                      <div className="rounded-xl border border-orange-100 bg-orange-50/35 p-3">
                        <div className="mb-1.5 text-xs font-medium text-slate-600">Cloudflare 人机验证</div>
                        <TurnstileWidget
                          siteKey={turnstileSiteKey}
                          onVerify={(token) => {
                            setTurnstileToken(token);
                            setGuestError("");
                          }}
                          onExpire={() => setTurnstileToken("")}
                          resetSignal={turnstileResetSignal}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>已启用安全频控保护，查询结果弹窗支持一键查看订单详情</span>
                      </div>
                    )}

                    {guestError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {guestError}
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <Button type="submit" className="h-11 flex-1 rounded-xl font-semibold" disabled={guestSearching}>
                        <Search className="mr-2 h-4 w-4" />
                        {guestSearching ? "查询中..." : "查询订单"}
                      </Button>
                      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={openPublicSupport}>
                        <Headphones className="mr-1.5 h-4 w-4" />
                        联系客服
                      </Button>
                    </div>
                  </form>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-orange-100/80 pt-3 text-xs text-slate-500">
                    <span>已有账号？登录后可查看历史全部订单与站内卡密</span>
                    <Link href="/login?redirect=/account/orders" className="font-semibold text-primary hover:underline">
                      立即登录 →
                    </Link>
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                <div className="text-center">
                  <div>{error}</div>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => void loadOrders(true)}>
                    重试
                  </Button>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <div className={cn(glass.empty, "w-full max-w-[360px] rounded-2xl border px-7 py-8 text-center")}>
                  <div className={cn(glass.icon, "mx-auto h-14 w-14")}>
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">暂无订单</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    当前账号暂无订单记录，也可以点击「按邮箱查单」查询游客下单记录。
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={() => setQueryOpen(true)}>
                      按邮箱查单
                    </Button>
                    <Button asChild className="rounded-xl">
                      <Link href="/">返回商城</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div data-testid="orders-glass-table" className={cn(glass.table, styles.list, "h-full w-full overflow-auto rounded-2xl")}>
                <table className="w-full min-w-[940px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[27%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[15%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">订单编号</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">商品名称</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">数量</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">金额</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">状态</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">下单时间</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center align-middle">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order) => {
                      const displayStatus = getUserOrderDisplayStatus(order);
                      const paymentAction = getBep20PaymentAction(order);
                      const firstItem = order.order_items?.[0];
                      const productName = firstItem?.product_name ?? "订单商品";
                      const quantity = (order.order_items ?? []).reduce(
                        (sum, item) => sum + Number(item.quantity ?? 0),
                        0
                      );

                      return (
                        <tr key={order.id} className="border-b hover:bg-slate-50">
                          <td data-label="订单编号" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => copyOrderNo(order.order_no)}
                              title={order.order_no}
                              className="inline-flex max-w-full items-center justify-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                            >
                              <span className="min-w-0 truncate">{order.order_no}</span>
                              <Clipboard className="h-3 w-3 shrink-0" />
                            </button>
                          </td>
                          <td data-label="商品名称" className="px-3 py-2.5 text-center align-middle font-medium">
                            <div className="mx-auto max-w-[260px] truncate whitespace-nowrap" title={productName}>
                              {productName}
                            </div>
                          </td>
                          <td data-label="数量" className="whitespace-nowrap px-3 py-2.5 text-center align-middle">{quantity || 1}</td>
                          <td data-label="金额" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-semibold text-primary">
                            {formatMoney(order.total_amount)}
                          </td>
                          <td data-label="状态" className="px-3 py-2.5 text-center align-middle">
                            <Badge variant="outline" className={cn("whitespace-nowrap text-xs", displayStatus.className)}>
                              {displayStatus.label}
                            </Badge>
                          </td>
                          <td data-label="下单时间" className="whitespace-nowrap px-3 py-2.5 text-center align-middle text-muted-foreground">
                            {formatDate(order.created_at)}
                          </td>
                          <td data-label="操作" className="px-3 py-2.5 text-center align-middle">
                            <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                              {paymentAction && paymentAction.kind !== "renew" ? (
                                <Button asChild size="sm">
                                  <Link href={`/payment?order=${encodeURIComponent(order.order_no)}`}>{paymentAction.label}</Link>
                                </Button>
                              ) : null}
                              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                                查看详情
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>

          {isSignedInMember ? (
            <div className={cn(glass.footer, "mt-4 flex min-h-[48px] shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground")}>
              <span>共 {count} 条订单</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  上一页
                </Button>
                <span>
                  第 {page} / {totalPages} 页
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
      </Card>

      <OrderEmailQueryDialog
        key={`query-${identity.epoch}-${isSignedInMember ? "member" : "guest"}`}
        open={queryOpen}
        isSignedInMember={isSignedInMember}
        detailModalOpen={Boolean(selectedOrder || selectedGuestOrder)}
        initialEmail={guestInitialEmail}
        initialGuestOrders={guestInitialOrders}
        onClose={() => {
          setQueryOpen(false);
          setSelectedOrder(null);
          setSelectedGuestOrder(null);
        }}
        onCopyOrderNo={copyOrderNo}
        onViewMemberOrder={(order) => setSelectedOrder(order)}
        onViewGuestOrder={(order) => setSelectedGuestOrder(order)}
      />

      <UserOrderDrawer
        key={`detail-${identity.epoch}`}
        order={ownerMatches ? selectedOrder : null}
        stacked={queryOpen}
        onClose={() => setSelectedOrder(null)}
        onCopyOrderNo={copyOrderNo}
        onOrderUpdated={refreshSelectedOrder}
      />

      <GuestOrderDetailModal
        order={selectedGuestOrder}
        onClose={() => setSelectedGuestOrder(null)}
        onCopyOrderNo={copyOrderNo}
      />
    </div>
  );
}

function OrderEmailQueryDialog({
  open,
  isSignedInMember,
  detailModalOpen,
  initialEmail,
  initialGuestOrders,
  onClose,
  onCopyOrderNo,
  onViewMemberOrder,
  onViewGuestOrder,
}: {
  open: boolean;
  isSignedInMember: boolean;
  detailModalOpen: boolean;
  initialEmail: string;
  initialGuestOrders: GuestLookupOrder[] | null;
  onClose: () => void;
  onCopyOrderNo: (orderNo: string) => void | Promise<void>;
  onViewMemberOrder: (order: OrderRecord) => void;
  onViewGuestOrder: (order: GuestLookupOrder) => void;
}) {
  const [email, setEmail] = useState("");
  const [queryEmail, setQueryEmail] = useState("");
  const [memberOrders, setMemberOrders] = useState<OrderRecord[]>([]);
  const [guestOrders, setGuestOrders] = useState<GuestLookupOrder[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const queryRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { queryRequest.current?.abort(); queryRequest.current = null; }, []);

  useEffect(() => {
    if (open && !isSignedInMember && initialEmail && initialGuestOrders !== null) {
      setEmail(initialEmail);
      setQueryEmail(initialEmail);
      setGuestOrders(initialGuestOrders);
      setCount(initialGuestOrders.length);
      setSubmitted(true);
      setError("");
      setLoading(false);
    }
  }, [open, isSignedInMember, initialEmail, initialGuestOrders]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const normalizedEmail = email.trim().toLowerCase();

  const queryOrders = useCallback(
    async (targetPage = page, emailToQuery = queryEmail) => {
      queryRequest.current?.abort();
      const controller = new AbortController();
      queryRequest.current = controller;
      const isCurrent = () => queryRequest.current === controller && !controller.signal.aborted;
      if (!emailToQuery) {
        setError("请输入下单邮箱");
        setMemberOrders([]);
        setGuestOrders([]);
        setCount(0);
        return;
      }

      if (!isSignedInMember) {
        setLoading(true);
        setError("");
        try {
          const response = await fetchWithTimeout("/api/order-query", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "email",
              email: emailToQuery,
            }),
          });
          const result = (await response.json().catch(() => null)) as { orders?: GuestLookupOrder[]; error?: string } | null;
          if (!isCurrent()) return;
          if (!response.ok) throw new Error(result?.error ?? "订单查询失败");
          const list = Array.isArray(result?.orders) ? result!.orders : [];
          setGuestOrders(list);
          setCount(list.length);
        } catch (queryError) {
          if (!isCurrent()) return;
          setError(getOrderErrorMessage(queryError, "订单查询失败，请稍后重试"));
          setGuestOrders([]);
          setCount(0);
        } finally {
          if (isCurrent()) { setLoading(false); queryRequest.current = null; }
        }
        return;
      }

      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
          email: emailToQuery,
        });
        const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const result = (await response.json().catch(() => null)) as {
          orders?: OrderRecord[];
          count?: number;
          error?: string;
        } | null;
        if (!isCurrent()) return;

        if (response.status === 401) {
          throw new Error("登录状态已失效，请重新登录。");
        }

        if (!response.ok) {
          throw new Error(result?.error ?? "订单查询失败");
        }

        setMemberOrders(result?.orders ?? []);
        setCount(Number(result?.count ?? 0));
      } catch (queryError) {
        if (!isCurrent()) return;
        setError(getOrderErrorMessage(queryError, "订单查询失败，请稍后重试"));
        setMemberOrders([]);
        setCount(0);
      } finally {
        if (isCurrent()) { setLoading(false); queryRequest.current = null; }
      }
    },
    [isSignedInMember, page, queryEmail]
  );

  useEffect(() => {
    if (!open || !queryEmail || !isSignedInMember) return;
    void queryOrders(page);
  }, [open, page, queryEmail, isSignedInMember, queryOrders]);

  useEffect(() => {
    if (open) return;
    queryRequest.current?.abort(); queryRequest.current = null;
    setLoading(false);
    setEmail("");
    setMemberOrders([]);
    setGuestOrders([]);
    setCount(0);
    setPage(1);
    setQueryEmail("");
    setError("");
    setSubmitted(false);
  }, [open]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!normalizedEmail) {
      setError("请输入下单邮箱");
      setMemberOrders([]);
      setGuestOrders([]);
      setCount(0);
      setQueryEmail("");
      return;
    }
    if (!isSignedInMember) {
      setQueryEmail(normalizedEmail);
      setPage(1);
      void queryOrders(1, normalizedEmail);
      return;
    }
    const shouldQueryNow = queryEmail === normalizedEmail && page === 1;
    setQueryEmail(normalizedEmail);
    setPage(1);
    if (shouldQueryNow) {
      void queryOrders(1, normalizedEmail);
    }
  }

  const displayedGuestOrders = guestOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = isSignedInMember ? memberOrders.length : displayedGuestOrders.length;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !detailModalOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        data-testid="order-email-query-dialog"
        onInteractOutside={(event) => {
          if (detailModalOpen) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (detailModalOpen) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (detailModalOpen) event.preventDefault();
        }}
        className={cn(styles.queryDialog, "flex min-w-0 flex-col overflow-hidden")}
      >
        <div className={cn(styles.dialogHeader, "flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4")}>
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold text-slate-950">订单查询</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
              {isSignedInMember
                ? "输入下单邮箱，查询匹配的订单记录；点击查看详情可在上层弹窗预览，点空白即可返回本列表。"
                : `邮箱 ${queryEmail || "—"} 下的订单列表；点击查看详情可在上层弹窗查看，点空白处返回本列表。`}
            </DialogPrimitive.Description>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭订单查询"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isSignedInMember ? (
          <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-3 border-b px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="输入下单邮箱"
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "查询中..." : "查询"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-orange-50/35 px-5 py-3 text-xs text-slate-600">
            <div className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">
                当前查询邮箱：<strong className="font-mono text-slate-900">{queryEmail || "—"}</strong>
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg bg-white text-xs" onClick={onClose}>
              更换邮箱重查
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <div className="text-center">
                <div>{error}</div>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => void queryOrders(page, queryEmail)}>
                  重试
                </Button>
              </div>
            </div>
          ) : !submitted ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-muted-foreground">
              请输入邮箱后查询订单。
            </div>
          ) : activeCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-6 text-center text-sm text-muted-foreground">
              <div>当前邮箱下没有可显示的订单。</div>
              <Button type="button" variant="outline" size="sm" onClick={openPublicSupport}>
                <Headphones className="mr-1.5 h-3.5 w-3.5" />
                联系在线客服核查
              </Button>
            </div>
          ) : (
            <div className={cn(glass.table, styles.list, "h-full overflow-auto rounded-2xl border")}>
              <table className="w-full min-w-[940px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[27%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[15%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">订单编号</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">商品名称</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">数量</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">金额</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">状态</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">下单时间</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center align-middle">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isSignedInMember
                    ? memberOrders.map((order) => {
                        const firstItem = order.order_items?.[0];
                        const productName = firstItem?.product_name ?? "订单商品";
                        const quantity = (order.order_items ?? []).reduce(
                          (sum, item) => sum + Number(item.quantity ?? 0),
                          0
                        );
                        const displayStatus = getUserOrderDisplayStatus(order);

                        return (
                          <tr key={order.id} className="border-b hover:bg-slate-50">
                            <td data-label="订单编号" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-mono text-xs">
                              <button
                                type="button"
                                onClick={() => onCopyOrderNo(order.order_no)}
                                title={order.order_no}
                                className="inline-flex max-w-full items-center justify-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                              >
                                <span className="min-w-0 truncate">{order.order_no}</span>
                                <Clipboard className="h-3 w-3 shrink-0" />
                              </button>
                            </td>
                            <td data-label="商品名称" className="px-3 py-2.5 text-center align-middle font-medium">
                              <div className="mx-auto max-w-[260px] truncate whitespace-nowrap" title={productName}>
                                {productName}
                              </div>
                            </td>
                            <td data-label="数量" className="whitespace-nowrap px-3 py-2.5 text-center align-middle">{quantity || 1}</td>
                            <td data-label="金额" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-semibold text-primary">
                              {formatMoney(order.total_amount)}
                            </td>
                            <td data-label="状态" className="px-3 py-2.5 text-center align-middle">
                              <Badge variant="outline" className={cn("whitespace-nowrap text-xs", displayStatus.className)}>
                                {displayStatus.label}
                              </Badge>
                            </td>
                            <td data-label="下单时间" className="whitespace-nowrap px-3 py-2.5 text-center align-middle text-muted-foreground">
                              {formatDate(order.created_at)}
                            </td>
                            <td data-label="操作" className="px-3 py-2.5 text-center align-middle">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onViewMemberOrder(order)}
                              >
                                查看详情
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    : displayedGuestOrders.map((order) => {
                        const firstItem = order.items?.[0];
                        const productName = firstItem?.productName ?? "订单商品";
                        const quantity = (order.items ?? []).reduce(
                          (sum, item) => sum + Number(item.quantity ?? 0),
                          0
                        );
                        return (
                          <tr key={order.orderNo} className="border-b hover:bg-slate-50">
                            <td data-label="订单编号" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-mono text-xs">
                              <button
                                type="button"
                                onClick={() => onCopyOrderNo(order.orderNo)}
                                title={order.orderNo}
                                className="inline-flex max-w-full items-center justify-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                              >
                                <span className="min-w-0 truncate">{order.orderNo}</span>
                                <Clipboard className="h-3 w-3 shrink-0" />
                              </button>
                            </td>
                            <td data-label="商品名称" className="px-3 py-2.5 text-center align-middle font-medium">
                              <div className="mx-auto max-w-[260px] truncate whitespace-nowrap" title={productName}>
                                {productName}
                              </div>
                            </td>
                            <td data-label="数量" className="whitespace-nowrap px-3 py-2.5 text-center align-middle">{quantity || 1}</td>
                            <td data-label="金额" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-semibold text-primary">
                              {formatMoney(order.totalAmount, order.currency)}
                            </td>
                            <td data-label="状态" className="px-3 py-2.5 text-center align-middle">
                              <Badge variant="outline" className={cn("whitespace-nowrap text-xs", guestStatusBadgeClass(order.status))}>
                                {guestStatusLabel(order.status)}
                              </Badge>
                            </td>
                            <td data-label="下单时间" className="whitespace-nowrap px-3 py-2.5 text-center align-middle text-muted-foreground">
                              {formatDate(order.createdAt)}
                            </td>
                            <td data-label="操作" className="px-3 py-2.5 text-center align-middle">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onViewGuestOrder(order)}
                              >
                                查看详情
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground">
          <span>共 {count} 条订单</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading || !queryEmail}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </Button>
            <span>
              第 {page} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading || !queryEmail}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function GuestOrderDetailModal({
  order: requestedOrder,
  onClose,
  onCopyOrderNo,
}: {
  order: GuestLookupOrder | null;
  onClose: () => void;
  onCopyOrderNo: (orderNo: string) => void;
}) {
  const [closingOrder, setClosingOrder] = useState<GuestLookupOrder | null>(null);
  useEffect(() => {
    if (requestedOrder) setClosingOrder(requestedOrder);
    else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setClosingOrder(null);
  }, [requestedOrder]);
  const order = requestedOrder ?? closingOrder;
  if (!order) return null;

  return (
    <DialogPrimitive.Root open={Boolean(requestedOrder)} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn(styles.overlay, styles.detailOverlay)} />
        <DialogPrimitive.Content
          asChild
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && event.currentTarget.dataset.state === "closed") {
              setClosingOrder(null);
            }
          }}
        >
          <aside
            data-testid="guest-order-detail-modal"
            className={cn(styles.detailDialog, styles.detailDialogTop, "flex min-w-0 flex-col overflow-hidden")}
          >
            <div className={cn(styles.dialogHeader, "flex min-w-0 max-w-full shrink-0 items-center justify-between gap-4 overflow-hidden border-b px-5 py-5 md:px-7")}>
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                <span aria-hidden="true" className={cn(glass.icon, "h-11 w-11")}>
                  <ClipboardList className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-lg font-semibold text-slate-950">订单详情</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="sr-only">查看游客订单商品、金额与状态信息。</DialogPrimitive.Description>
                  <button
                    type="button"
                    onClick={() => onCopyOrderNo(order.orderNo)}
                    className="mt-1 inline-flex max-w-full items-center gap-2 overflow-hidden rounded px-1 py-0.5 font-mono text-xs text-slate-500 hover:bg-muted"
                  >
                    <span className="min-w-0 truncate">{order.orderNo}</span>
                    <Clipboard className="h-3 w-3 shrink-0" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="关闭订单详情"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className={cn(styles.detailBody, "flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 md:px-7 md:py-6 [&>*]:min-w-0 [&>*]:max-w-full [&>*]:shrink-0")}>
              {order.status === "pending_payment" && order.paymentStatus !== "paid" ? (
                <Button asChild className="w-full">
                  <Link href={`/payment?order=${encodeURIComponent(order.orderNo)}`}>前往支付</Link>
                </Button>
              ) : null}

              <section className="grid min-w-0 max-w-full grid-cols-3 gap-2 sm:gap-3">
                <InfoBlock label="订单金额" value={formatMoney(order.totalAmount, order.currency)} primary />
                <InfoBlock label="支付状态" value={guestStatusLabel(order.paymentStatus)} />
                <StatusBlock label="状态" value={guestStatusLabel(order.status)} className={guestStatusBadgeClass(order.status)} />
              </section>

              <section className={cn(styles.section, "min-w-0 max-w-full overflow-hidden rounded-2xl border")}>
                <div className="border-b px-4 py-3 font-semibold">订单商品</div>
                <div className="divide-y">
                  {order.items.map((item, idx) => (
                    <div key={`${order.orderNo}-${idx}`} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_100px_56px]">
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <div className="truncate font-semibold" title={item.productName}>{item.productName}</div>
                        {item.skuTitle ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground">规格：{item.skuTitle}</div>
                        ) : null}
                        {item.skuCode ? (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">SKU：{item.skuCode}</div>
                        ) : null}
                      </div>
                      <div className="text-center font-semibold text-primary">{formatMoney(item.lineTotal, order.currency)}</div>
                      <div className="text-center text-muted-foreground">x {item.quantity}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={cn(styles.section, "rounded-2xl border p-4 text-sm")}>
                <div className="mb-3 font-semibold">订单信息</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoLine label="交付状态" value={guestStatusLabel(order.deliveryStatus)} />
                  <InfoLine label="下单时间" value={formatDate(order.createdAt)} />
                  <InfoLine label="最近更新" value={formatDate(order.updatedAt)} />
                </div>
              </section>

              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs leading-5 text-amber-800">
                为保护您的隐私与卡密安全，未登录查单仅展示订单基本信息；支付成功后的数字卡密已自动发往您的下单邮箱。如需协助重发或售后处理，请联系在线客服。
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={openPublicSupport}>
                  <Headphones className="mr-1.5 h-4 w-4" />
                  联系在线客服
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onClose}>
                  返回订单列表
                </Button>
              </div>
            </div>
          </aside>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function UserOrderDrawer({
  order: requestedOrder,
  stacked = false,
  onClose,
  onCopyOrderNo,
  onOrderUpdated,
}: {
  order: OrderRecord | null;
  stacked?: boolean;
  onClose: () => void;
  onCopyOrderNo: (orderNo: string) => void;
  onOrderUpdated: (orderNo: string) => Promise<void>;
}) {
  const [closingOrder, setClosingOrder] = useState<OrderRecord | null>(null);
  useEffect(() => {
    if (requestedOrder) setClosingOrder(requestedOrder);
    else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setClosingOrder(null);
  }, [requestedOrder]);
  const order = requestedOrder ?? closingOrder;
  if (!order) return null;

  const paymentAction = getBep20PaymentAction(order);
  const paymentNotice = getBep20PaymentNotice(order);
  const isBep20Order = String(order.payment_method ?? "").toLowerCase() === "usdt_bep20";
  const displayStatus = getUserOrderDisplayStatus(order);
  const firstItem = order.order_items?.[0];
  const isShippingOrder =
    normalizeOrderItemDeliveryType(order.delivery_type ?? firstItem?.delivery_type) === "physical" ||
    isShippingOrderRecord(order);
  const shipping = parseOrderShippingInfo(order);
  const delivery = order.order_deliveries?.find((item) => item.delivery_status === "delivered") ?? order.order_deliveries?.[0];
  const hasDigitalDeliveryRows = Boolean(order.order_deliveries?.length);

  async function copyTrackingNo(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已复制快递单号");
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  }

  return (
    <DialogPrimitive.Root open={Boolean(requestedOrder)} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn(styles.overlay, stacked && styles.detailOverlay)} />
      <DialogPrimitive.Content asChild onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.currentTarget.dataset.state === "closed") setClosingOrder(null);
      }}>
      <aside
        data-testid="order-detail-drawer"
        className={cn(styles.detailDialog, stacked && styles.detailDialogTop, "flex min-w-0 flex-col overflow-hidden")}
      >
        <div className={cn(styles.dialogHeader, "flex min-w-0 max-w-full shrink-0 items-center justify-between gap-4 overflow-hidden border-b px-5 py-5 md:px-7")}>
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <span aria-hidden="true" className={cn(glass.icon, "h-11 w-11")}><ClipboardList className="h-5 w-5" strokeWidth={1.6} /></span>
            <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold text-slate-950">订单详情</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">查看订单商品、金额、交付与支付信息。</DialogPrimitive.Description>
            <button
              type="button"
              onClick={() => onCopyOrderNo(order.order_no)}
              className="mt-1 inline-flex max-w-full items-center gap-2 overflow-hidden rounded px-1 py-0.5 font-mono text-xs text-slate-500 hover:bg-muted"
            >
              <span className="min-w-0 truncate">{order.order_no}</span>
              <Clipboard className="h-3 w-3 shrink-0" />
            </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭订单详情"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          data-testid="order-detail-drawer-scroll"
          className={cn(styles.detailBody, "flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 md:px-7 md:py-6 [&>*]:min-w-0 [&>*]:max-w-full [&>*]:shrink-0")}
        >
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
          <section className="grid min-w-0 max-w-full grid-cols-3 gap-2 sm:gap-3">
            <InfoBlock label="订单金额" value={formatMoney(order.total_amount)} primary />
            <InfoBlock label="发货方式" value={getDeliveryLabel(order.delivery_type ?? firstItem?.delivery_type)} />
            <StatusBlock label="订单状态" value={displayStatus.label} className={displayStatus.className} />
          </section>

          <section className={cn(styles.section, "min-w-0 max-w-full overflow-hidden rounded-2xl border")}>
            <div className="border-b px-4 py-3 font-semibold">订单商品</div>
            <div className="divide-y">
              {(order.order_items ?? []).map((item) => (
                <div key={item.id} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_100px_56px]">
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="truncate font-semibold" title={item.product_name}>{item.product_name}</div>
                    {item.sku_title ? (
                      <div className="mt-1 truncate text-xs text-muted-foreground">SKU: {item.sku_title}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.category_name || "未记录分类"} · {getDeliveryLabel(item.delivery_type)}
                    </div>
                  </div>
                  <div className="text-center font-semibold text-primary">{formatMoney(item.unit_price)}</div>
                  <div className="text-center text-muted-foreground">x {item.quantity}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={cn(styles.section, "rounded-2xl border p-4 text-sm")}>
            <div className="mb-3 font-semibold">订单信息</div>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoLine label="下单时间" value={formatDate(order.created_at)} />
              <InfoLine label="更新时间" value={formatDate(order.updated_at)} />
              {isShippingOrder ? (
                <InfoLine label="收货信息" value={formatShippingAddress(order)} wide />
              ) : null}
              <InfoLine label="订单备注" value={order.customer_note || "无"} wide />
            </div>
          </section>

          {isShippingOrder ? (
            <section className={cn(styles.section, "rounded-2xl border p-4 text-sm")}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Truck className="h-4 w-4 text-primary" />
                  <span>物流配送与快递单号</span>
                </div>
                {shipping.trackingNo ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    已发货
                  </Badge>
                ) : order.payment_status === "paid" && !["cancelled", "expired", "refunded"].includes(String(order.status ?? "")) ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    待发货
                  </Badge>
                ) : null}
              </div>

              {shipping.trackingNo ? (
                <div className="space-y-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500">快递公司</div>
                      <div className="mt-0.5 font-semibold text-slate-900">{shipping.carrier || "快递配送"}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 border-emerald-200 bg-white text-xs text-emerald-800 hover:bg-emerald-50"
                      onClick={() => void copyTrackingNo(shipping.trackingNo)}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      复制快递单号
                    </Button>
                  </div>
                  <div className="rounded-lg bg-white/90 px-3 py-2 font-mono text-sm font-semibold tracking-wide text-slate-950">
                    {shipping.trackingNo}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {shipping.shippedAt ? <span>发货时间：{formatDate(shipping.shippedAt)}</span> : null}
                    {shipping.shippingNote ? <span>商家备注：{shipping.shippingNote}</span> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5 text-xs text-primary hover:bg-orange-50 hover:text-primary" asChild>
                      <Link href="/tutorials?topic=giffgaff">
                        <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                        查看 SIM 卡使用与激活教程 →
                      </Link>
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={openPublicSupport}>
                      <Headphones className="mr-1.5 h-3.5 w-3.5" />
                      物流咨询客服
                    </Button>
                  </div>
                </div>
              ) : order.payment_status === "paid" && !["cancelled", "expired", "refunded"].includes(String(order.status ?? "")) ? (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-amber-900">
                  <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="space-y-1 text-xs leading-5 sm:text-sm">
                    <div className="font-semibold">订单已支付，仓库正在打包备货中</div>
                    <p className="text-amber-800">快递发出后，单号将实时显示在此页面，并同步发送邮件通知到您的下单邮箱。</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                  完成支付后将按您填写的收货地址安排实物快递寄出，并在此展示快递单号。
                </div>
              )}
            </section>
          ) : null}

          <Bep20OrderPaymentSummary
            order={order}
            compact
            onUpdated={async () => {
              await onOrderUpdated(order.order_no);
            }}
          />

          {!isShippingOrder || hasDigitalDeliveryRows ? (
            <SecureOrderDelivery
              className="flex flex-1 flex-col [&>[data-testid=card-secret-content]]:flex-1"
              orderNo={order.order_no}
              paymentStatus={order.payment_status}
              orderStatus={order.status}
              fulfillmentStatus={order.fulfillment_status}
              deliveryStatus={delivery?.delivery_status}
              deliveryType={order.delivery_type ?? firstItem?.delivery_type}
            />
          ) : null}
        </div>
      </aside>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function InfoBlock({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={cn(glass.inset, "flex min-h-[88px] min-w-0 flex-col items-center justify-center rounded-xl p-3 text-center sm:p-4")}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-2 font-semibold tabular-nums", primary && "text-lg tracking-tight text-primary sm:text-2xl")}>{value}</div>
    </div>
  );
}

function StatusBlock({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={cn(glass.inset, "flex min-h-[88px] flex-col items-center justify-center rounded-xl p-4 text-center")}>
      <div className="text-xs text-slate-500">{label}</div>
      <Badge variant="outline" className={cn("mt-2 whitespace-nowrap text-xs", className)}>
        {value}
      </Badge>
    </div>
  );
}

function InfoLine({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "md:col-span-2")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

function formatShippingAddress(order: OrderRecord) {
  const shipping = parseOrderShippingInfo(order);
  return [shipping.recipient, shipping.phone, shipping.address].filter(Boolean).join(" ") || "未填写";
}
