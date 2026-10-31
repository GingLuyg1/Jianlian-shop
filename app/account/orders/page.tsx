"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clipboard, ClipboardList, Search, X } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Bep20OrderPaymentSummary } from "@/components/account/orders/Bep20OrderPaymentSummary";
import { SecureOrderDelivery } from "@/components/account/orders/SecureOrderDelivery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { normalizeOrderItemDeliveryType } from "@/lib/orders/order-fulfillment-status";
import {
  getBep20PaymentAction,
  getBep20PaymentNotice,
  getUserOrderDisplayStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/orders/OrdersGlass.module.css";
import { accountRecordPreload } from "@/lib/account/record-preload";
import { useAccountRecordIdentity } from "@/hooks/use-account-record-identity";

const PAGE_SIZE = 10;

function formatMoney(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

export default function MyOrdersPage() {
  const router = useRouter();
  const identity = useAccountRecordIdentity();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [storedCount, setCount] = useState(0);
  const [loadedEpoch, setLoadedEpoch] = useState(identity.epoch);
  const [page, setPage] = useState(1);
  const [queryOpen, setQueryOpen] = useState(false);
  const [requestLoading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const listRequest = useRef<{ page: number; epoch: number; controller: AbortController; promise?: Promise<void> } | null>(null);
  const ownerMatches = loadedEpoch === identity.epoch;
  const count = ownerMatches ? storedCount : 0;
  const loading = requestLoading || !ownerMatches;
  useEffect(() => { setSelectedOrder(null); setQueryOpen(false); setPage(1); }, [identity.epoch]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const loadOrders = useCallback((force = false) => {
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
        toast.error("登录状态已失效，请重新登录。");
        router.push("/login?redirect=/account/orders");
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
  }, [page, router, identity.epoch]);

  useEffect(() => {
    void loadOrders();
    return () => { listRequest.current?.controller.abort(); listRequest.current = null; };
  }, [loadOrders]);

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

  return (
    <div data-testid="orders-glass-page" data-account-orders-ready={!loading} className={cn(styles.page, "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}>
      <Card className={cn(glass.surface, "flex min-h-[480px] min-w-0 flex-1 flex-col overflow-hidden md:min-h-0")}>
          <CardHeader className={cn(glass.hero, "shrink-0 px-5 py-5 md:px-6 md:py-6")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className={cn(glass.icon, "h-12 w-12")}><ClipboardList className="h-6 w-6" strokeWidth={1.6} /></span>
                <div className="min-w-0">
                <CardTitle className="text-xl">我的订单</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  查询当前账号的订单记录、支付状态和交付信息。
                </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className={cn(glass.button, "rounded-xl")} onClick={() => setQueryOpen(true)}>
                <Search className="mr-2 h-4 w-4" />
                订单查询
              </Button>
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
                <div className={cn(glass.empty, "w-full max-w-[340px] rounded-2xl border px-7 py-8 text-center")}>
                  <div className={cn(glass.icon, "mx-auto h-14 w-14")}>
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">暂无订单</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    当前筛选条件下没有订单记录。
                  </p>
                  <Button asChild className="mt-4 rounded-xl">
                    <Link href="/">返回商城</Link>
                  </Button>
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
      </Card>

      <OrderEmailQueryDialog
        key={`query-${identity.epoch}`}
        open={queryOpen}
        onClose={() => setQueryOpen(false)}
        onCopyOrderNo={copyOrderNo}
        onViewOrder={setSelectedOrder}
      />

      <UserOrderDrawer
        key={`detail-${identity.epoch}`}
        order={ownerMatches ? selectedOrder : null}
        onClose={() => setSelectedOrder(null)}
        onCopyOrderNo={copyOrderNo}
        onOrderUpdated={refreshSelectedOrder}
      />
    </div>
  );
}

function OrderEmailQueryDialog({
  open,
  onClose,
  onCopyOrderNo,
  onViewOrder,
}: {
  open: boolean;
  onClose: () => void;
  onCopyOrderNo: (orderNo: string) => void | Promise<void>;
  onViewOrder: (order: OrderRecord) => void;
}) {
  const [email, setEmail] = useState("");
  const [queryEmail, setQueryEmail] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const queryRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { queryRequest.current?.abort(); queryRequest.current = null; }, []);

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
        setOrders([]);
        setCount(0);
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

        setOrders(result?.orders ?? []);
        setCount(Number(result?.count ?? 0));
      } catch (queryError) {
        if (!isCurrent()) return;
        setError(getOrderErrorMessage(queryError, "订单查询失败，请稍后重试"));
        setOrders([]);
        setCount(0);
      } finally {
        if (isCurrent()) { setLoading(false); queryRequest.current = null; }
      }
    },
    [page, queryEmail]
  );

  useEffect(() => {
    if (!open || !queryEmail) return;
    queryOrders(page);
  }, [open, page, queryEmail, queryOrders]);

  useEffect(() => {
    if (open) return;
    queryRequest.current?.abort(); queryRequest.current = null;
    setLoading(false);
    setEmail("");
    setOrders([]);
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
      setOrders([]);
      setCount(0);
      setQueryEmail("");
      return;
    }
    const shouldQueryNow = queryEmail === normalizedEmail && page === 1;
    setQueryEmail(normalizedEmail);
    setPage(1);
    if (shouldQueryNow) {
      queryOrders(1, normalizedEmail);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content
        className={cn(styles.queryDialog, "flex min-w-0 flex-col overflow-hidden")}
      >
        <div className={cn(styles.dialogHeader, "flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4")}>
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold text-slate-950">订单查询</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">输入下单邮箱，查询当前账号下匹配的订单。</DialogPrimitive.Description>
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

        <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-3 border-b px-5 py-4 md:flex-row">
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
        </form>

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
                <Button variant="outline" size="sm" className="mt-4" onClick={() => queryOrders(page)}>
                  重试
                </Button>
              </div>
            </div>
          ) : !submitted ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-slate-50 text-sm text-muted-foreground">
              请输入邮箱后查询订单。
            </div>
          ) : orders.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50/50 text-sm text-muted-foreground">
              当前邮箱下没有可显示的订单。
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
                  {orders.map((order) => {
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
                            onClick={() => {
                              onClose();
                              onViewOrder(order);
                            }}
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

function UserOrderDrawer({
  order: requestedOrder,
  onClose,
  onCopyOrderNo,
  onOrderUpdated,
}: {
  order: OrderRecord | null;
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
  const isShippingOrder = normalizeOrderItemDeliveryType(order.delivery_type ?? firstItem?.delivery_type) === "physical";
  const delivery = order.order_deliveries?.find((item) => item.delivery_status === "delivered") ?? order.order_deliveries?.[0];

  return (
    <DialogPrimitive.Root open={Boolean(requestedOrder)} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={styles.overlay} />
      <DialogPrimitive.Content asChild onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.currentTarget.dataset.state === "closed") setClosingOrder(null);
      }}>
      <aside
        data-testid="order-detail-drawer"
        className={cn(styles.detailDialog, "flex min-w-0 flex-col overflow-hidden")}
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
                <InfoLine label="收货信息" value={formatShippingAddress(order)} />
              ) : null}
              <InfoLine label="订单备注" value={order.customer_note || "无"} wide />
            </div>
          </section>

          <Bep20OrderPaymentSummary
            order={order}
            compact
            onUpdated={async () => {
              await onOrderUpdated(order.order_no);
            }}
          />

          <SecureOrderDelivery
            className="flex flex-1 flex-col [&>[data-testid=card-secret-content]]:flex-1"
            orderNo={order.order_no}
            paymentStatus={order.payment_status}
            orderStatus={order.status}
            fulfillmentStatus={order.fulfillment_status}
            deliveryStatus={delivery?.delivery_status}
            deliveryType={order.delivery_type ?? firstItem?.delivery_type}
          />
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
  const value = order.shipping_address;
  const region = value && typeof value.region === "string" ? value.region : "";
  const address = value && typeof value.address === "string" ? value.address : "";
  const recipient = value && typeof value.recipient === "string" ? value.recipient : order.customer_name ?? "";
  const phone = value && typeof value.phone === "string" ? value.phone : order.customer_phone ?? "";
  return [recipient, phone, region, address].filter(Boolean).join(" ") || "未填写";
}
