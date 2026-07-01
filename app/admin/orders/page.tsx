"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Eye, Loader2, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
  type OrderStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const ALL_VALUE = "all";

type RelationGroup = {
  key: string;
  label: string;
  error?: string;
  items: Array<{
    id: string;
    label: string;
    businessNo: string | null;
    summary: string;
    status: string | null;
    amount: string | null;
    createdAt: string | null;
    href: string | null;
  }>;
};

type TimelineEvent = {
  id: string;
  source: string;
  title: string;
  summary: string;
  status: string | null;
  occurredAt: string;
  href: string | null;
};

type RelationsPayload = {
  orderId: string;
  orderNo: string;
  groups: RelationGroup[];
  timeline: TimelineEvent[];
};

function formatMoney(value: number | string | null | undefined, currency = "CNY") {
  const n = Number(value ?? 0);
  const symbol = currency === "CNY" ? "¥" : currency ? `${currency} ` : "";
  return `${symbol}${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
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

function getOrderNo(order: OrderRecord | null | undefined) {
  return order?.order_no || order?.id || "—";
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL_VALUE);
  const [paymentStatus, setPaymentStatus] = useState(ALL_VALUE);
  const [deliveryType, setDeliveryType] = useState(ALL_VALUE);
  const [sort, setSort] = useState("created_at_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
      });
      if (search.trim()) params.set("search", search.trim());
      if (status !== ALL_VALUE) params.set("status", status);
      if (paymentStatus !== ALL_VALUE) params.set("paymentStatus", paymentStatus);
      if (deliveryType !== ALL_VALUE) params.set("deliveryType", deliveryType);

      const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "订单列表读取失败");
      setOrders(payload.orders ?? []);
      setCount(Number(payload.count ?? 0));
    } catch (err) {
      setError(getOrderErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [deliveryType, page, pageSize, paymentStatus, search, sort, status]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  function updateOrderInList(order: OrderRecord) {
    setOrders((current) => current.map((item) => (item.id === order.id ? order : item)));
    setSelectedOrder((current) => (current?.id === order.id ? order : current));
  }

  function resetFilters() {
    setSearch("");
    setStatus(ALL_VALUE);
    setPaymentStatus(ALL_VALUE);
    setDeliveryType(ALL_VALUE);
    setSort("created_at_desc");
    setPage(1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">订单管理</h1>
          <p className="mt-1 text-sm text-slate-500">查看真实订单、关联业务和处理时间线。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadOrders()} disabled={loading}>
          <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          重新加载
        </Button>
      </div>

      <Card className="shrink-0">
        <CardContent className="p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_180px_180px_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索订单编号或用户邮箱"
                className="pl-9"
              />
            </div>
            <NativeSelect value={status} onChange={setStatus} label="订单状态">
              <option value={ALL_VALUE}>全部订单状态</option>
              <option value="pending_payment">待支付</option>
              <option value="paid">已支付</option>
              <option value="processing">处理中</option>
              <option value="delivered">已交付</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
              <option value="refunded">已退款</option>
              <option value="failed">失败</option>
            </NativeSelect>
            <NativeSelect value={paymentStatus} onChange={setPaymentStatus} label="支付状态">
              <option value={ALL_VALUE}>全部支付状态</option>
              <option value="unpaid">未支付</option>
              <option value="paid">已支付</option>
              <option value="pending">处理中</option>
              <option value="refunded">已退款</option>
              <option value="failed">失败</option>
            </NativeSelect>
            <NativeSelect value={deliveryType} onChange={setDeliveryType} label="交付方式">
              <option value={ALL_VALUE}>全部交付方式</option>
              <option value="automatic">自动发货</option>
              <option value="card">卡密交付</option>
              <option value="account">账号交付</option>
              <option value="shipping">物流发货</option>
              <option value="manual">人工处理</option>
            </NativeSelect>
            <NativeSelect value={sort} onChange={setSort} label="排序">
              <option value="created_at_desc">下单时间倒序</option>
              <option value="created_at_asc">下单时间正序</option>
              <option value="updated_at_desc">更新时间倒序</option>
              <option value="amount_desc">金额从高到低</option>
              <option value="amount_asc">金额从低到高</option>
            </NativeSelect>
            <Button variant="ghost" onClick={resetFilters}>重置</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 border-b px-4 py-3">
          <CardTitle className="text-base">订单列表</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {error ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">订单编号</th>
                  <th className="px-4 py-3">用户邮箱</th>
                  <th className="px-4 py-3">商品摘要</th>
                  <th className="px-4 py-3">金额</th>
                  <th className="px-4 py-3">订单状态</th>
                  <th className="px-4 py-3">支付状态</th>
                  <th className="px-4 py-3">交付方式</th>
                  <th className="px-4 py-3">下单时间</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="sticky right-0 bg-slate-50 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                      正在读取订单...
                    </td>
                  </tr>
                ) : orders.length ? (
                  orders.map((order) => {
                    const orderStatus = normalizeOrderStatus(order.status);
                    const payStatus = normalizePaymentStatus(order.payment_status);
                    const itemSummary = order.order_items?.map((item) => `${item.product_name} x ${item.quantity}`).join("、") || "—";
                    return (
                      <tr key={order.id} className="bg-white hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{getOrderNo(order)}</td>
                        <td className="px-4 py-3 text-slate-600">{order.customer_email || "—"}</td>
                        <td className="max-w-[320px] truncate px-4 py-3 text-slate-700" title={itemSummary}>{itemSummary}</td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(order.total_amount, order.currency)}</td>
                        <td className="px-4 py-3"><Badge className={ORDER_STATUS_STYLES[orderStatus]}>{getOrderStatusLabel(orderStatus)}</Badge></td>
                        <td className="px-4 py-3"><Badge className={PAYMENT_STATUS_STYLES[payStatus]}>{getPaymentStatusLabel(payStatus)}</Badge></td>
                        <td className="px-4 py-3 text-slate-600">{getDeliveryLabel(order.delivery_type)}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(order.created_at)}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(order.updated_at)}</td>
                        <td className="sticky right-0 bg-white px-4 py-3 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)]">
                          <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>
                            <Eye className="mr-2 h-4 w-4" />查看
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-slate-500">
                      <div className="font-semibold text-slate-900">暂无订单</div>
                      <div className="mt-1">调整筛选条件后再试。</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-500">
            <div>共 {count} 条记录，第 {page} / {totalPages} 页</div>
            <div className="flex items-center gap-2">
              <NativeSelect value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} label="每页数量" compact>
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} 条/页</option>)}
              </NativeSelect>
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedOrder ? (
        <AdminOrderDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={updateOrderInList}
          onRefresh={() => void loadOrders()}
        />
      ) : null}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  label,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <label className={cn("block", compact ? "w-[132px]" : "w-full")}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20",
          compact && "h-9"
        )}
      >
        {children}
      </select>
    </label>
  );
}

function AdminOrderDrawer({
  order,
  onClose,
  onUpdated,
  onRefresh,
}: {
  order: OrderRecord;
  onClose: () => void;
  onUpdated: (order: OrderRecord) => void;
  onRefresh: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [relations, setRelations] = useState<RelationsPayload | null>(null);
  const [relationsLoading, setRelationsLoading] = useState(true);
  const [relationsError, setRelationsError] = useState("");
  const orderStatus = normalizeOrderStatus(order.status);
  const paymentStatus = normalizePaymentStatus(order.payment_status);

  const loadRelations = useCallback(async () => {
    setRelationsLoading(true);
    setRelationsError("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/relations`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "关联业务读取失败");
      setRelations(payload);
    } catch (err) {
      setRelationsError(getOrderErrorMessage(err));
    } finally {
      setRelationsLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    void loadRelations();
  }, [loadRelations]);

  async function updateStatus(nextStatus: OrderStatus) {
    const note = window.prompt(`确认将订单 ${getOrderNo(order)} 更新为「${getOrderStatusLabel(nextStatus)}」？请输入管理员备注：`);
    if (note === null) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", status: nextStatus, adminNote: note.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "订单状态更新失败");
      onUpdated(payload.order);
      toast.success("订单状态已更新");
      void loadRelations();
    } catch (err) {
      toast.error(getOrderErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function expireUnpaidOrderManually() {
    if (orderStatus !== "pending_payment" || paymentStatus !== "unpaid") {
      toast.error("只有未支付的待支付订单可以关闭");
      return;
    }
    const reason = window.prompt(`确认关闭未支付订单 ${getOrderNo(order)} 并释放库存预留？请输入操作原因：`);
    if (reason === null) return;
    const note = reason.trim();
    if (!note) {
      toast.error("请填写关闭原因");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expire_unpaid_order", note }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.result?.ok === false) {
        throw new Error(payload?.error || payload?.result?.message || "关闭未支付订单失败");
      }
      const nextOrder = {
        ...order,
        status: payload?.result?.code === "already_closed" ? order.status : "cancelled",
        payment_status: order.payment_status === "paid" ? order.payment_status : "failed",
        cancelled_at: order.cancelled_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as OrderRecord;
      onUpdated(nextOrder);
      onRefresh();
      toast.success("未支付订单已关闭，预留库存已按服务端结果释放");
      void loadRelations();
    } catch (err) {
      toast.error(getOrderErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }
  const availableActions = useMemo(() => {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      pending_payment: ["paid", "cancelled", "failed"],
      paid: ["processing", "cancelled"],
      processing: ["delivered", "completed", "cancelled", "failed"],
      delivered: ["completed"],
      completed: [],
      cancelled: ["processing"],
      refunded: [],
      failed: ["processing"],
    };
    return transitions[orderStatus] ?? [];
  }, [orderStatus]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-[860px] flex-col bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
          <div>
            <div className="text-xs text-slate-500">订单编号</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-950">{getOrderNo(order)}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className={ORDER_STATUS_STYLES[orderStatus]}>{getOrderStatusLabel(orderStatus)}</Badge>
              <Badge className={PAYMENT_STATUS_STYLES[paymentStatus]}>{getPaymentStatusLabel(paymentStatus)}</Badge>
              <Badge variant="outline">{getDeliveryLabel(order.delivery_type)}</Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭订单详情">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <InfoCard title="用户信息">
              <InfoRow label="用户邮箱" value={order.customer_email || "—"} />
              <InfoRow label="用户 ID" value={order.user_id || "—"} mono />
              <InfoRow label="收货信息" value={order.customer_email || "—"} />
              <InfoRow label="用户备注" value={order.customer_note || "—"} />
              <InfoRow label="管理员备注" value={order.admin_note || "—"} />
            </InfoCard>
            <InfoCard title="订单金额">
              <InfoRow label="订单总额" value={formatMoney(order.total_amount, order.currency)} strong />
              <InfoRow label="实付金额" value={formatMoney(order.paid_at ? order.total_amount : 0, order.currency)} />
              <InfoRow label="退款金额" value={formatMoney(0, order.currency)} />
              <InfoRow label="创建时间" value={formatDate(order.created_at)} />
              <InfoRow label="更新时间" value={formatDate(order.updated_at)} />
            </InfoCard>
          </div>

          <Card className="mt-4">
            <CardHeader className="px-4 py-3"><CardTitle className="text-base">订单商品</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-3">
                {(order.order_items ?? []).map((item) => (
                  <div key={item.id} className="rounded-lg border bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-950">{item.product_name}</div>
                        <div className="mt-1 text-sm text-slate-500">{item.sku_title || item.sku_code || "单规格商品"}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        <div>{formatMoney(item.unit_price, order.currency)} x {item.quantity}</div>
                        <div className="font-semibold text-slate-950">{formatMoney(item.line_total, order.currency)}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {!order.order_items?.length ? <div className="text-sm text-slate-500">暂无订单商品记录。</div> : null}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="px-4 py-3"><CardTitle className="text-base">状态操作</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {availableActions.map((nextStatus) => (
                  <Button key={nextStatus} size="sm" variant={nextStatus === "cancelled" || nextStatus === "failed" ? "destructive" : "outline"} disabled={working} onClick={() => void updateStatus(nextStatus)}>
                    {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {getOrderStatusLabel(nextStatus)}
                  </Button>
                ))}
                {orderStatus === "pending_payment" && paymentStatus === "unpaid" ? (
                  <Button size="sm" variant="destructive" disabled={working} onClick={() => void expireUnpaidOrderManually()}>
                    {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    关闭未支付订单并释放预留
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={working || relationsLoading} onClick={() => void loadRelations()}>
                  重新读取处理记录
                </Button>
                {!availableActions.length && !(orderStatus === "pending_payment" && paymentStatus === "unpaid") ? (
                  <div className="text-sm text-slate-500">当前状态没有可执行的流转操作。</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <RelationSection
            loading={relationsLoading}
            error={relationsError}
            relations={relations}
            onRetry={() => void loadRelations()}
          />
        </div>
      </aside>
    </div>
  );
}

function RelationSection({
  loading,
  error,
  relations,
  onRetry,
}: {
  loading: boolean;
  error: string;
  relations: RelationsPayload | null;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-base">关联业务</CardTitle>
          <Button variant="ghost" size="sm" onClick={onRetry} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            重试
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">正在读取关联业务...</div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : relations ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {relations.groups.map((group) => (
                <div key={group.key} className="rounded-lg border bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-semibold text-slate-950">{group.label}</div>
                    {group.error ? <Badge variant="destructive">{group.error}</Badge> : <Badge variant="secondary">{group.items.length}</Badge>}
                  </div>
                  {group.items.length ? (
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div key={item.id} className="rounded-md bg-slate-50 p-2 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">{item.summary}</div>
                              <div className="mt-1 truncate font-mono text-xs text-slate-500">{item.businessNo || item.label}</div>
                            </div>
                            <div className="shrink-0 text-right text-xs text-slate-500">
                              {item.amount ? <div className="font-semibold text-primary">{item.amount}</div> : null}
                              {item.status ? <div>{item.status}</div> : null}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span>{formatDate(item.createdAt)}</span>
                            {item.href ? (
                              <Link className="text-primary hover:underline" href={item.href.trim()}>
                                打开
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">暂无关联记录</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500">暂无关联业务数据</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-3"><CardTitle className="text-base">业务时间线</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          {relations?.timeline?.length ? (
            <div className="space-y-3">
              {relations.timeline.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1 rounded-lg border bg-slate-50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{event.title}</div>
                        <div className="mt-1 text-slate-600">{event.summary || "系统记录"}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-slate-500">
                        <div>{event.source || "系统记录"}</div>
                        <div>{formatDate(event.occurredAt)}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{event.status || "—"}</span>
                      {event.href ? <Link href={event.href.trim()} className="text-primary hover:underline">查看来源</Link> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">暂无业务时间线记录</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="px-4 py-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 text-sm">{children}</CardContent>
    </Card>
  );
}

function InfoRow({ label, value, mono = false, strong = false }: { label: string; value: ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
      <div className="text-slate-500">{label}</div>
      <div className={cn("min-w-0 break-words text-slate-800", mono && "font-mono text-xs", strong && "font-semibold text-slate-950")}>{value}</div>
    </div>
  );
}

