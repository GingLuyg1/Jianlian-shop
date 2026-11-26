"use client";
import { statusLabel } from '@/lib/admin/display-labels';


import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Copy, Eye, Loader2, MapPin, Phone, RefreshCcw, Search, Send, Truck, User } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import OrderFulfillmentPanel from "@/components/admin/orders/OrderFulfillmentPanel";
import { AdminConfirmDialog } from "@/components/admin/v2/AdminConfirmDialog";
import { AdminDetailDrawer } from "@/components/admin/v2/AdminDetail";
import {
  AdminFilterBar,
  AdminListPagination,
  AdminListSurface,
  AdminTableViewport,
  adminListControlClass,
  adminListRowClass,
  adminListTableHeadClass,
} from "@/components/admin/v2/AdminList";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
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
import {
  COMMON_LOGISTICS_CARRIERS,
  isShippingOrderRecord,
  parseOrderShippingInfo,
} from "@/lib/orders/shipping-info";
import { getPaymentMethodLabel } from "@/lib/payments/payment-methods";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const ALL_VALUE = "all";
const ORDER_ATTENTION_VALUES = ["pending_orders", "manual_delivery", "auto_delivery_failed", "inventory_shortage"] as const;

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
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

function orderStatusTone(value: string): AdminStatusTone {
  if (["delivered", "completed"].includes(value)) return "success";
  if (["failed", "cancelled", "refunded"].includes(value)) return "danger";
  if (["paid", "processing"].includes(value)) return "info";
  return "warning";
}

function paymentStatusTone(value: string): AdminStatusTone {
  if (value === "paid") return "success";
  if (["failed", "refunded"].includes(value)) return "danger";
  if (value === "pending") return "info";
  return "warning";
}

function getOrderNo(order: OrderRecord | null | undefined) {
  return order?.order_no || order?.id || "—";
}

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const initialAttention = ORDER_ATTENTION_VALUES.includes(searchParams.get("attention") as (typeof ORDER_ATTENTION_VALUES)[number])
    ? searchParams.get("attention") as (typeof ORDER_ATTENTION_VALUES)[number]
    : ALL_VALUE;
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") ?? searchParams.get("orderId") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? ALL_VALUE);
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get("paymentStatus") ?? ALL_VALUE);
  const [deliveryType, setDeliveryType] = useState(searchParams.get("deliveryType") ?? ALL_VALUE);
  const [attention, setAttention] = useState(initialAttention);
  const [sort, setSort] = useState(searchParams.get("sort") ?? "created_at_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const ordersAbortRef = useRef<AbortController | null>(null);
  const ordersReqSeqRef = useRef(0);
  const lastSearchParamsRef = useRef(searchParams.toString());

  useEffect(() => {
    const currentParams = searchParams.toString();
    if (currentParams === lastSearchParamsRef.current) return;
    lastSearchParamsRef.current = currentParams;
    const nextSearch = searchParams.get("search") ?? searchParams.get("orderId") ?? "";
    const nextStatus = searchParams.get("status") ?? ALL_VALUE;
    const nextPay = searchParams.get("paymentStatus") ?? ALL_VALUE;
    const nextDelivery = searchParams.get("deliveryType") ?? ALL_VALUE;
    const nextAtt = ORDER_ATTENTION_VALUES.includes(searchParams.get("attention") as (typeof ORDER_ATTENTION_VALUES)[number])
      ? (searchParams.get("attention") as (typeof ORDER_ATTENTION_VALUES)[number])
      : ALL_VALUE;
    setSearch(nextSearch);
    setDebouncedSearch(nextSearch);
    setStatus(nextStatus);
    setPaymentStatus(nextPay);
    setDeliveryType(nextDelivery);
    setAttention(nextAtt);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const hasFilters = Boolean(
    search.trim() ||
    status !== ALL_VALUE ||
    paymentStatus !== ALL_VALUE ||
    deliveryType !== ALL_VALUE ||
    attention !== ALL_VALUE
  );

  const loadOrders = useCallback(async () => {
    ordersAbortRef.current?.abort();
    const controller = new AbortController();
    ordersAbortRef.current = controller;
    const seq = ++ordersReqSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
      });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (status !== ALL_VALUE) params.set("status", status);
      if (paymentStatus !== ALL_VALUE) params.set("paymentStatus", paymentStatus);
      if (deliveryType !== ALL_VALUE) params.set("deliveryType", deliveryType);
      if (attention !== ALL_VALUE) params.set("attention", attention);

      const [sortField, sortDirection] = sort === "amount_desc"
        ? ["total_amount", "desc"]
        : sort === "amount_asc"
          ? ["total_amount", "asc"]
          : sort.split("_").slice(-1)[0] === "asc"
            ? [sort.replace(/_asc$/, ""), "asc"]
            : [sort.replace(/_desc$/, ""), "desc"];
      params.set("sortBy", sortField);
      params.set("sortDirection", sortDirection);

      const response = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (seq !== ordersReqSeqRef.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload?.error || "订单列表读取失败");
      setOrders(payload.orders ?? []);
      setCount(Number(payload.count ?? 0));
    } catch (err) {
      if (controller.signal.aborted || seq !== ordersReqSeqRef.current) return;
      setError(getOrderErrorMessage(err));
    } finally {
      if (seq === ordersReqSeqRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [attention, debouncedSearch, deliveryType, page, pageSize, paymentStatus, sort, status]);

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
    setAttention(ALL_VALUE);
    setSort("created_at_desc");
    setPage(1);
  }

  return (
    <AdminPageShell
      variant="v2"
      title="订单管理"
      description="查看真实订单、关联业务和处理时间线。"
      actions={(
        <Button className="h-11 sm:h-9" variant="outline" size="sm" onClick={() => void loadOrders()} disabled={loading}>
          <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          重新加载
        </Button>
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AdminListSurface>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--admin-v2-border)] px-4 py-2">
          {[
            { value: ALL_VALUE, label: "全部订单" },
            { value: "pending_orders", label: "待处理订单" },
            { value: "manual_delivery", label: "待人工交付" },
            { value: "auto_delivery_failed", label: "自动发货失败" },
            { value: "inventory_shortage", label: "库存不足订单" },
          ].map((tab) => (
            <Button
              key={tab.value}
              size="sm"
              variant={attention === tab.value ? "default" : "ghost"}
              onClick={() => {
                setAttention(tab.value as typeof initialAttention);
                setPage(1);
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <AdminFilterBar
          className="sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(240px,1fr)_170px_170px_170px_180px_180px_auto]"
          primary={<>
            <label className="relative sm:col-span-2 lg:col-span-2 2xl:col-span-1">
              <span className="sr-only">搜索订单</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索订单编号或用户邮箱"
                className={cn(adminListControlClass, "pl-9")}
              />
            </label>
            <NativeSelect value={attention} onChange={(value) => { setAttention(value as typeof initialAttention); setPage(1); }} label="运营待办">
              <option value={ALL_VALUE}>全部运营待办</option>
              <option value="pending_orders">待处理订单</option>
              <option value="manual_delivery">待人工交付</option>
              <option value="auto_delivery_failed">自动发货失败</option>
              <option value="inventory_shortage">库存不足订单</option>
            </NativeSelect>
            <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} label="订单状态">
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
          </>}
          advanced={<>
            <NativeSelect value={paymentStatus} onChange={(value) => { setPaymentStatus(value); setPage(1); }} label="支付状态">
              <option value={ALL_VALUE}>全部支付状态</option>
              <option value="unpaid">未支付</option>
              <option value="paid">已支付</option>
              <option value="pending">处理中</option>
              <option value="refunded">已退款</option>
              <option value="failed">失败</option>
            </NativeSelect>
            <NativeSelect value={deliveryType} onChange={(value) => { setDeliveryType(value); setPage(1); }} label="交付方式">
              <option value={ALL_VALUE}>全部交付方式</option>
              <option value="automatic">自动发货</option>
              <option value="card">卡密交付</option>
              <option value="account">账号交付</option>
              <option value="shipping">物流发货</option>
              <option value="manual">人工处理</option>
            </NativeSelect>
            <NativeSelect value={sort} onChange={(value) => { setSort(value); setPage(1); }} label="排序">
              <option value="created_at_desc">下单时间倒序</option>
              <option value="created_at_asc">下单时间正序</option>
              <option value="updated_at_desc">更新时间倒序</option>
              <option value="amount_desc">金额从高到低</option>
              <option value="amount_asc">金额从低到高</option>
            </NativeSelect>
            <Button variant="ghost" size="sm" onClick={resetFilters}>重置</Button>
          </>}
        />
          {error ? (
            <div className="flex min-h-0 flex-1 p-4">
              <AdminErrorState title="订单列表加载失败" description={error} onRetry={() => void loadOrders()} />
            </div>
          ) : loading ? (
            <AdminTableSkeleton rows={8} />
          ) : (
            <>
              <AdminTableViewport>
            <table className="min-w-[960px] w-full text-sm">
              <thead className={adminListTableHeadClass}>
                <tr>
                  {["订单编号", "用户邮箱", "商品摘要"].map((heading) => <th scope="col" key={heading} className="whitespace-nowrap px-3 py-3 text-left">{heading}</th>)}
                  {["金额", "订单状态", "支付状态", "交付方式", "下单时间"].map((heading) => <th scope="col" key={heading} className="whitespace-nowrap px-3 py-3 text-center">{heading}</th>)}
                  <th scope="col" className="sticky right-0 whitespace-nowrap bg-[var(--admin-v2-surface-muted)] px-3 py-3 text-center shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.08)]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length ? (
                  orders.map((order) => {
                    const orderStatus = normalizeOrderStatus(order.status);
                    const payStatus = normalizePaymentStatus(order.payment_status);
                    const itemSummary = order.order_items?.map((item) => `${item.product_name} x ${item.quantity}`).join("、") || "—";
                    const orderNoText = getOrderNo(order);
                    return (
                      <tr key={order.id} className={adminListRowClass}>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold text-slate-900">
                          <div className="inline-flex items-center gap-1">
                            <span>{orderNoText}</span>
                            <button
                              type="button"
                              title="复制订单号"
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              onClick={() => {
                                void navigator.clipboard.writeText(orderNoText).then(
                                  () => toast.success("已复制订单号"),
                                  () => toast.error("复制失败")
                                );
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-3 text-slate-600" title={order.customer_email || ""}>{order.customer_email || "—"}</td>
                        <td className="max-w-[210px] truncate px-3 py-3 text-slate-700" title={itemSummary}>{itemSummary}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center font-semibold tabular-nums text-slate-950">{formatMoney(order.total_amount, order.currency)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center"><AdminStatusBadge tone={orderStatusTone(orderStatus)}>{getOrderStatusLabel(orderStatus)}</AdminStatusBadge></td>
                        <td className="whitespace-nowrap px-3 py-3 text-center"><AdminStatusBadge tone={paymentStatusTone(payStatus)}>{getPaymentStatusLabel(payStatus)}</AdminStatusBadge></td>
                        <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">{getDeliveryLabel(order.delivery_type)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-slate-500">{formatDate(order.created_at)}</td>
                        <td className="sticky right-0 border-l border-[var(--admin-v2-border)] bg-white px-3 py-3 text-center whitespace-nowrap">
                          <Button
                            className={cn(
                              "min-h-11 sm:min-h-9",
                              ["paid", "processing"].includes(orderStatus) && "border-orange-200 bg-orange-50/70 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
                            )}
                            size="sm"
                            variant={["paid", "processing"].includes(orderStatus) ? "outline" : "ghost"}
                            onClick={() => setSelectedOrder(order)}
                          >
                            <Eye className="mr-1.5 h-4 w-4" />
                            {attention === "manual_delivery" ? "处理交付" : ["paid", "processing"].includes(orderStatus) ? "去处理" : "查看"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="h-72">
                      <AdminEmptyState
                        title={hasFilters ? "没有符合条件的订单" : "暂无订单"}
                        description={hasFilters ? "请调整筛选条件后再试。" : "新订单创建后会显示在这里。"}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminTableViewport>
          <AdminListPagination
            summary={`共 ${count} 条记录`}
            page={page}
            totalPages={totalPages}
            leading={(
              <NativeSelect value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} label="每页数量" compact>
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} 条/页</option>)}
              </NativeSelect>
            )}
            onPrevious={() => setPage((value) => Math.max(1, value - 1))}
            onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
          />
            </>
          )}
      </AdminListSurface>

      {selectedOrder ? (
        <AdminOrderDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={updateOrderInList}
          onRefresh={loadOrders}
        />
      ) : null}
      </div>
    </AdminPageShell>
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
          adminListControlClass,
          "w-full px-3 outline-none transition-colors"
        )}
      >
        {children}
      </select>
    </label>
  );
}

type AdminOrderDrawerProps = {
  order: OrderRecord;
  onClose: () => void;
  onUpdated: (order: OrderRecord) => void;
  onRefresh: () => Promise<void>;
};

function AdminOrderDrawer(props: AdminOrderDrawerProps) {
  const { order, onClose, onUpdated, onRefresh } = props;
  const [working, setWorking] = useState(false);
  const [relations, setRelations] = useState<RelationsPayload | null>(null);
  const [relationsLoading, setRelationsLoading] = useState(true);
  const [relationsError, setRelationsError] = useState("");
  const orderStatus = normalizeOrderStatus(order.status);
  const paymentStatus = normalizePaymentStatus(order.payment_status);
  const isShippingOrder = useMemo(() => isShippingOrderRecord(order), [order]);
  const shipping = useMemo(() => parseOrderShippingInfo(order), [order]);
  const presetCarriers = useMemo(() => COMMON_LOGISTICS_CARRIERS.filter((item) => item !== "其他快递") as string[], []);

  const [carrierSelect, setCarrierSelect] = useState<string>("顺丰速运");
  const [customCarrier, setCustomCarrier] = useState<string>("");
  const [trackingNo, setTrackingNo] = useState<string>("");
  const [shippingNote, setShippingNote] = useState<string>("");
  const [sendShipEmail, setSendShipEmail] = useState<boolean>(true);
  const [shippingSubmitting, setShippingSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const existingCarrier = shipping.carrier;
    if (!existingCarrier) {
      setCarrierSelect("顺丰速运");
      setCustomCarrier("");
    } else if (presetCarriers.includes(existingCarrier)) {
      setCarrierSelect(existingCarrier);
      setCustomCarrier("");
    } else {
      setCarrierSelect("其他快递");
      setCustomCarrier(existingCarrier);
    }
    setTrackingNo(shipping.trackingNo);
    setShippingNote(shipping.shippingNote);
    setSendShipEmail(!shipping.trackingNo);
  }, [order.id, order.updated_at, presetCarriers, shipping.carrier, shipping.shippingNote, shipping.trackingNo]);

  async function copyToClipboard(text: string, label: string) {
    if (!text.trim()) {
      toast.error(`暂无可复制的${label}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制${label}`);
    } catch {
      toast.error(`复制${label}失败，请手动选中复制`);
    }
  }

  async function submitLogisticsShipment() {
    const effectiveCarrier = carrierSelect === "其他快递" ? customCarrier.trim() : carrierSelect.trim();
    const cleanTrackingNo = trackingNo.trim();
    if (!effectiveCarrier) {
      toast.error("请选择或填写快递公司");
      return;
    }
    if (!cleanTrackingNo) {
      toast.error("请填写快递单号");
      return;
    }
    setShippingSubmitting(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ship_logistics",
          carrier: effectiveCarrier,
          tracking_no: cleanTrackingNo,
          shipping_note: shippingNote.trim() || null,
          send_email: sendShipEmail,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "物流发货提交失败");
      }
      const mergedOrder = payload?.order
        ? {
            ...order,
            ...payload.order,
            order_items: payload.order.order_items ?? order.order_items,
            items: payload.order.items ?? (order as unknown as { items?: unknown }).items,
          }
        : order;
      onUpdated(mergedOrder);
      onRefresh();
      void loadRelations();
      if (sendShipEmail && payload?.emailSent) {
        toast.success(shipping.trackingNo ? "物流单号已更新并邮件通知买家" : "物流已确认发货并邮件通知买家");
      } else {
        toast.success(shipping.trackingNo ? "物流单号已更新" : "物流已确认发货");
      }
    } catch (err) {
      toast.error(getOrderErrorMessage(err));
    } finally {
      setShippingSubmitting(false);
    }
  }

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

  const [confirmAction, setConfirmAction] = useState<
    | { kind: "status"; nextStatus: OrderStatus }
    | { kind: "expire_unpaid" }
    | null
  >(null);

  async function executeStatusUpdate(nextStatus: OrderStatus, note: string) {
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", status: nextStatus, admin_note: note.trim(), adminNote: note.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "订单状态更新失败");
      const mergedOrder = payload?.order
        ? {
            ...order,
            ...payload.order,
            order_items: payload.order.order_items ?? order.order_items,
            items: payload.order.items ?? (order as unknown as { items?: unknown }).items,
          }
        : order;
      onUpdated(mergedOrder);
      setConfirmAction(null);
      toast.success("订单状态已更新");
      void loadRelations();
    } catch (err) {
      toast.error(getOrderErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function executeExpireUnpaidOrder(note: string) {
    if (orderStatus !== "pending_payment" || paymentStatus !== "unpaid") {
      toast.error("只有未支付的待支付订单可以关闭");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expire_unpaid_order", note: note.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.result?.ok === false) {
        throw new Error(payload?.error || payload?.result?.message || "关闭未支付订单失败");
      }
      const nextOrder = {
        ...order,
        status: payload?.result?.code === "ALREADY_CANCELLED"
          ? order.status
          : payload?.result?.code === "ALREADY_EXPIRED"
            ? "expired"
            : "expired",
        payment_status: order.payment_status === "paid" ? order.payment_status : "failed",
        updated_at: new Date().toISOString(),
      } as OrderRecord;
      onUpdated(nextOrder);
      onRefresh();
      setConfirmAction(null);
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
      pending_payment: ["cancelled", "failed"],
      paid: ["processing", "cancelled"],
      processing: ["delivered", "completed", "cancelled", "failed"],
      delivered: ["completed"],
      completed: [],
      cancelled: [],
      expired: [],
      refunded: [],
      failed: ["processing"],
    };
    return transitions[orderStatus] ?? [];
  }, [orderStatus]);

  const refundedAmount = useMemo(() => {
    const refundItems = relations?.groups?.find((g) => g.key === "refunds")?.items ?? [];
    const succeededSum = refundItems
      .filter((item) => item.status === "succeeded")
      .reduce((sum, item) => {
        const parsed = Number(String(item.amount ?? "").replace(/[^0-9.-]/g, ""));
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0);
    if (succeededSum > 0) return succeededSum;
    if (orderStatus === "refunded" || paymentStatus === "refunded") return Number(order.total_amount ?? 0);
    return 0;
  }, [order.total_amount, orderStatus, paymentStatus, relations]);

  const canShipLogistics =
    isShippingOrder &&
    paymentStatus === "paid" &&
    !["cancelled", "expired", "refunded"].includes(orderStatus);

  return (
    <AdminDetailDrawer
      title={getOrderNo(order)}
      eyebrow="订单编号"
      status={<><Badge className={ORDER_STATUS_STYLES[orderStatus]}>{getOrderStatusLabel(orderStatus)}</Badge><Badge className={PAYMENT_STATUS_STYLES[paymentStatus]}>{getPaymentStatusLabel(paymentStatus)}</Badge><Badge variant="outline">{getDeliveryLabel(order.delivery_type)}</Badge></>}
      onClose={onClose}
      className="max-w-[860px]"
    >
          {isShippingOrder ? (
            <Card className="mb-4 border-orange-200/80 bg-gradient-to-br from-orange-50/50 via-white to-amber-50/30 shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-orange-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                    <Truck className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base text-slate-950">物流收货与发货中心</CardTitle>
                    <p className="text-xs text-slate-500">核对收件人信息、一键复制打单、录入快递单号并邮件通知买家</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
                  onClick={() => void copyToClipboard(shipping.copyText, "快递打单信息")}
                  disabled={!shipping.copyText}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  一键复制打单信息
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4">
                <div className="grid gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 sm:grid-cols-2">
                  <div className="flex items-start gap-2.5">
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-500">收件人姓名</div>
                      <div className="mt-0.5 font-semibold text-slate-950">
                        {shipping.recipient || <span className="font-normal text-amber-600">未填写收件人</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">联系电话</div>
                        <div className="mt-0.5 font-mono font-semibold text-slate-950">
                          {shipping.phone || <span className="font-sans font-normal text-amber-600">未填写联系电话</span>}
                        </div>
                      </div>
                    </div>
                    {shipping.phone ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
                        onClick={() => void copyToClipboard(shipping.phone, "联系电话")}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        复制
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex items-start justify-between gap-2 border-t border-slate-100 pt-3 sm:col-span-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">详细收货地址</div>
                        <div className="mt-0.5 break-words font-medium text-slate-900">
                          {shipping.address || <span className="font-normal text-amber-600">未填写收货地址</span>}
                        </div>
                      </div>
                    </div>
                    {shipping.address ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-xs text-slate-500 hover:text-slate-900"
                        onClick={() => void copyToClipboard(shipping.address, "收货地址")}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        复制
                      </Button>
                    ) : null}
                  </div>
                </div>

                {shipping.trackingNo ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/75 p-3.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>已录入物流单号</span>
                        <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">
                          {shipping.carrier || "快递"}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 border-emerald-200 bg-white px-2.5 text-xs text-emerald-800 hover:bg-emerald-50"
                        onClick={() => void copyToClipboard(shipping.trackingNo, "快递单号")}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        复制单号
                      </Button>
                    </div>
                    <div className="mt-2 font-mono text-base font-bold tracking-wide text-slate-950">
                      {shipping.trackingNo}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-800/90">
                      {shipping.shippedAt ? <span>发货时间：{formatDate(shipping.shippedAt)}</span> : null}
                      {shipping.shippingNote ? <span>物流备注：{shipping.shippingNote}</span> : null}
                    </div>
                  </div>
                ) : null}

                {canShipLogistics ? (
                  <div className="rounded-xl border border-slate-200/90 bg-white p-3.5">
                    <div className="mb-3 text-xs font-semibold text-slate-700">
                      {shipping.trackingNo ? "修改或补充物流单号" : "录入快递单号并确认发货"}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600">快递公司</label>
                        <select
                          value={carrierSelect}
                          onChange={(e) => setCarrierSelect(e.target.value)}
                          disabled={shippingSubmitting}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-primary focus:outline-none"
                        >
                          {COMMON_LOGISTICS_CARRIERS.map((carrier) => (
                            <option key={carrier} value={carrier}>
                              {carrier}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600">快递单号 *</label>
                        <Input
                          value={trackingNo}
                          onChange={(e) => setTrackingNo(e.target.value)}
                          placeholder="例如：SF1234567890123"
                          disabled={shippingSubmitting}
                          className="h-9 font-mono text-sm"
                        />
                      </div>
                      {carrierSelect === "其他快递" ? (
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-600">自定义快递公司名称 *</label>
                          <Input
                            value={customCarrier}
                            onChange={(e) => setCustomCarrier(e.target.value)}
                            placeholder="例如：德邦快递 / DHL / 邮政小包"
                            disabled={shippingSubmitting}
                            className="h-9 text-sm"
                          />
                        </div>
                      ) : null}
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600">物流 / 打包备注（选填，将同步展示给买家）</label>
                        <Input
                          value={shippingNote}
                          onChange={(e) => setShippingNote(e.target.value)}
                          placeholder="例如：顺丰空运发出，内附取卡针与激活指南"
                          disabled={shippingSubmitting}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={sendShipEmail}
                          onChange={(e) => setSendShipEmail(e.target.checked)}
                          disabled={shippingSubmitting || !order.customer_email}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span>
                          发货后自动发邮件通知买家单号
                          {order.customer_email ? `（${order.customer_email}）` : "（无买家邮箱）"}
                        </span>
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        disabled={shippingSubmitting || !trackingNo.trim()}
                        onClick={() => void submitLogisticsShipment()}
                      >
                        {shippingSubmitting ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {shipping.trackingNo ? "保存并更新物流单号" : "确认发货并通知买家"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    当前订单支付状态为「{getPaymentStatusLabel(paymentStatus)}」、订单状态为「{getOrderStatusLabel(orderStatus)}」，需已支付且未取消/关闭后才可录入快递单号发货。
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <InfoCard title="用户信息">
              <InfoRow label="用户邮箱" value={order.customer_email || "—"} />
              <InfoRow label="用户 ID" value={order.user_id || "—"} mono />
              {!isShippingOrder ? (
                <InfoRow label="接收邮箱" value={order.customer_email || "—"} />
              ) : null}
              <InfoRow label="用户备注" value={order.customer_note || "—"} />
              <InfoRow label="管理员备注" value={order.admin_note || "—"} />
            </InfoCard>
            <InfoCard title="订单金额">
              <InfoRow label="订单总额" value={formatMoney(order.total_amount, order.currency)} strong />
              <InfoRow label="支付方式" value={order.payment_method ? getPaymentMethodLabel(order.payment_method) : "—"} />
              <InfoRow label="实付金额" value={formatMoney(order.paid_at ? order.total_amount : 0, order.currency)} />
              <InfoRow label="退款金额" value={formatMoney(refundedAmount, order.currency)} />
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

          <div className="mt-4">
            <OrderFulfillmentPanel
              order={order}
              onReload={async () => {
                onClose();
                await onRefresh();
              }}
            />
          </div>

          <Card className="mt-4">
            <CardHeader className="px-4 py-3"><CardTitle className="text-base">状态操作</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              {isShippingOrder ? (
                <p className="mb-3 text-xs text-slate-500">
                  物流订单建议优先在上方「物流收货与发货中心」填写快递公司与单号并一键发货；以下按钮仅用于异常状态调整或手工完结。
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {availableActions.map((nextStatus) => (
                  <Button key={nextStatus} size="sm" variant={nextStatus === "cancelled" || nextStatus === "failed" ? "destructive" : "outline"} disabled={working} onClick={() => setConfirmAction({ kind: "status", nextStatus })}>
                    {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {getOrderStatusLabel(nextStatus)}
                  </Button>
                ))}
                {orderStatus === "pending_payment" && paymentStatus === "unpaid" ? (
                  <Button size="sm" variant="destructive" disabled={working} onClick={() => setConfirmAction({ kind: "expire_unpaid" })}>
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

          <AdminConfirmDialog
            open={Boolean(confirmAction)}
            onOpenChange={(next) => { if (!next) setConfirmAction(null); }}
            title={
              confirmAction?.kind === "expire_unpaid"
                ? "关闭未支付订单并释放库存预留"
                : confirmAction?.kind === "status"
                  ? `更新订单状态为「${getOrderStatusLabel(confirmAction.nextStatus)}」`
                  : "确认操作"
            }
            description={
              confirmAction?.kind === "expire_unpaid"
                ? "关闭后该订单将标记为已过期，并按服务端规则释放已预留的数字库存。"
                : "请核对目标状态并填写管理员备注，所有变更均会写入后台审计日志。"
            }
            summaryLines={[
              { label: "订单编号", value: getOrderNo(order) },
              { label: "当前状态", value: `${getOrderStatusLabel(orderStatus)} / ${getPaymentStatusLabel(paymentStatus)}` },
              { label: "订单金额", value: formatMoney(order.total_amount, order.currency) },
            ]}
            destructive={
              confirmAction?.kind === "expire_unpaid" ||
              (confirmAction?.kind === "status" && ["cancelled", "failed"].includes(confirmAction.nextStatus))
            }
            confirmLabel={confirmAction?.kind === "expire_unpaid" ? "确认关闭并释放预留" : "确认更新状态"}
            reasonLabel={confirmAction?.kind === "expire_unpaid" ? "关闭原因" : "管理员备注"}
            reasonRequired={confirmAction?.kind === "expire_unpaid"}
            reasonPlaceholder={confirmAction?.kind === "expire_unpaid" ? "例如：买家取消下单或超时未支付" : "选填：记录本次状态变更说明"}
            loading={working}
            onConfirm={async (reason) => {
              if (confirmAction?.kind === "expire_unpaid") {
                await executeExpireUnpaidOrder(reason);
              } else if (confirmAction?.kind === "status") {
                await executeStatusUpdate(confirmAction.nextStatus, reason);
              }
            }}
          />
    </AdminDetailDrawer>
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
                              {item.status ? <div>{statusLabel(item.status)}</div> : null}
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
                      <span>{statusLabel(event.status)}</span>
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


