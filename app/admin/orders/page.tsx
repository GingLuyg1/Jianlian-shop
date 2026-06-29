"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Clipboard,
  Eye,
  EyeOff,
  RefreshCcw,
  Search,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import OrderFulfillmentPanel from "@/components/admin/orders/OrderFulfillmentPanel";
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
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  type OrderStatus,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DELIVERY_FILTERS = [
  { value: "all", label: "全部交付方式" },
  { value: "automatic", label: "自动发货" },
  { value: "shipping", label: "物流发货" },
  { value: "card", label: "卡密交付" },
  { value: "account", label: "账号交付" },
  { value: "manual", label: "人工处理" },
];

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

function getActionLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    pending_payment: "恢复待支付",
    paid: "确认订单",
    processing: "开始处理",
    delivered: "标记已发货",
    completed: "标记已完成",
    cancelled: "取消订单",
    refunded: "标记退款",
    failed: "标记失败",
  };
  return labels[status];
}

function isDangerStatus(status: OrderStatus) {
  return status === "cancelled" || status === "refunded" || status === "failed";
}

function maskSecret(value: string) {
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [deliveryType, setDeliveryType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDirection, setSortDirection] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status,
        paymentStatus,
        deliveryType,
        search,
        sortBy,
        sortDirection,
      });
      if (startDate) params.set("startDate", new Date(`${startDate}T00:00:00`).toISOString());
      if (endDate) params.set("endDate", new Date(`${endDate}T23:59:59`).toISOString());

      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { orders?: OrderRecord[]; count?: number; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      const nextOrders = result?.orders ?? [];
      setOrders(nextOrders);
      setCount(Number(result?.count ?? 0));
      setSelectedOrder((current) =>
        current ? nextOrders.find((order) => order.id === current.id) ?? current : null
      );
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [
    deliveryType,
    endDate,
    page,
    pageSize,
    paymentStatus,
    search,
    sortBy,
    sortDirection,
    startDate,
    status,
  ]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const rows = useMemo(() => orders, [orders]);

  async function copyOrderNo(orderNo: string) {
    await navigator.clipboard.writeText(orderNo);
    toast.success("订单编号已复制");
  }

  async function updateOrderStatus(order: OrderRecord, nextStatus: OrderStatus) {
    if (isDangerStatus(nextStatus)) {
      const confirmed = window.confirm(`确认要执行“${getActionLabel(nextStatus)}”吗？`);
      if (!confirmed) return;
    }

    const adminNote = window.prompt("管理员备注（可留空）", getActionLabel(nextStatus)) ?? "";
    setUpdatingId(order.id);
    setError("");

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          payment_status: getNextPaymentStatus(nextStatus),
          admin_note: adminNote,
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "订单状态更新失败");
      }

      toast.success("订单状态已更新");
      await loadOrders();
    } catch (updateError) {
      toast.error(getOrderErrorMessage(updateError, "订单状态更新失败"));
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">订单管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            管理真实订单、状态流转、交付信息和订单日志。
          </p>
        </div>
        <Button variant="outline" onClick={loadOrders}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 space-y-3 pb-3">
          <CardTitle className="text-base">订单列表</CardTitle>
          <div className="grid gap-3 2xl:grid-cols-[minmax(260px,1fr)_150px_150px_150px_140px_140px_140px_120px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
            <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }}>
              <option value="all">全部订单状态</option>
              {ORDER_STATUS_VALUES.map((item) => (
                <option key={item} value={item}>{getOrderStatusLabel(item)}</option>
              ))}
            </NativeSelect>
            <NativeSelect value={paymentStatus} onChange={(value) => { setPaymentStatus(value); setPage(1); }}>
              <option value="all">全部支付状态</option>
              {PAYMENT_STATUS_VALUES.map((item) => (
                <option key={item} value={item}>{getPaymentStatusLabel(item)}</option>
              ))}
            </NativeSelect>
            <NativeSelect value={deliveryType} onChange={(value) => { setDeliveryType(value); setPage(1); }}>
              {DELIVERY_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </NativeSelect>
            <Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} />
            <Input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} />
            <NativeSelect value={sortBy} onChange={setSortBy}>
              <option value="created_at">按下单时间</option>
              <option value="updated_at">按更新时间</option>
              <option value="total_amount">按金额</option>
            </NativeSelect>
            <NativeSelect value={sortDirection} onChange={setSortDirection}>
              <option value="desc">倒序</option>
              <option value="asc">正序</option>
            </NativeSelect>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed p-12 text-center text-sm text-slate-500">
              <div>
                <div className="text-base font-semibold text-slate-900">暂无订单数据</div>
                <p className="mt-2">当前筛选条件下没有订单。</p>
                <Button variant="outline" size="sm" className="mt-5" onClick={loadOrders}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  刷新
                </Button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1480px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
                  <tr className="border-b">
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">订单编号</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">用户邮箱</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">商品摘要</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">订单金额</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">订单状态</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">支付状态</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">交付方式</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">下单时间</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">更新时间</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => {
                    const orderStatus = normalizeOrderStatus(order.status);
                    const payment = normalizePaymentStatus(order.payment_status);
                    const item = order.order_items?.[0];
                    const transitions = ORDER_STATUS_TRANSITIONS[orderStatus];

                    return (
                      <tr key={order.id} className="border-b hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => copyOrderNo(order.order_no)}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                          >
                            {order.order_no}
                            <Clipboard className="h-3 w-3" />
                          </button>
                        </td>
                        <td className="max-w-[230px] truncate px-3 py-2.5">
                          {order.customer_email || "未填写"}
                        </td>
                        <td className="max-w-[300px] truncate px-3 py-2.5 font-medium">
                          {item?.product_name ?? "订单商品"}
                          {(order.order_items?.length ?? 0) > 1 ? ` 等 ${order.order_items?.length} 件` : ""}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-primary">
                          {formatMoney(order.total_amount)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={cn("whitespace-nowrap text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                            {getOrderStatusLabel(order.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={cn("whitespace-nowrap text-xs", PAYMENT_STATUS_STYLES[payment])}>
                            {getPaymentStatusLabel(order.payment_status)}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {getDeliveryLabel(order.delivery_type || item?.delivery_type)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                          {formatDate(order.updated_at)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                              查看
                            </Button>
                            {transitions.slice(0, 2).map((nextStatus) => (
                              <Button
                                key={nextStatus}
                                variant="outline"
                                size="sm"
                                disabled={updatingId === order.id}
                                onClick={() => updateOrderStatus(order, nextStatus)}
                              >
                                {getActionLabel(nextStatus)}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex shrink-0 items-center justify-between border-t pt-3 text-sm text-slate-500">
            <div className="flex items-center gap-3">
              <span>共 {count} 条订单</span>
              <NativeSelect value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
                {PAGE_SIZE_OPTIONS.map((item) => (
                  <option key={item} value={item}>每页 {item} 条</option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                上一页
              </Button>
              <span>第 {page} / {totalPages} 页</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AdminOrderDrawer
        order={selectedOrder}
        updating={updatingId === selectedOrder?.id}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={updateOrderStatus}
        onCopyOrderNo={copyOrderNo}
        onReload={loadOrders}
      />
    </div>
  );
}

function getNextPaymentStatus(nextStatus: OrderStatus) {
  if (nextStatus === "paid") return "paid";
  if (nextStatus === "refunded") return "refunded";
  if (nextStatus === "failed") return "failed";
  return undefined;
}

function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

function AdminOrderDrawer({
  order,
  updating,
  onClose,
  onUpdateStatus,
  onCopyOrderNo,
  onReload,
}: {
  order: OrderRecord | null;
  updating: boolean;
  onClose: () => void;
  onUpdateStatus: (order: OrderRecord, nextStatus: OrderStatus) => void;
  onCopyOrderNo: (orderNo: string) => void;
  onReload: () => Promise<void>;
}) {
  const [deliveryContent, setDeliveryContent] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [availableInventory, setAvailableInventory] = useState<Array<{ id: string; masked_content: string }>>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState("");

  useEffect(() => {
    if (!order) return;
    setDeliveryContent(order.order_deliveries?.[0]?.delivery_content ?? "");
    setShowDelivery(false);
    setAvailableInventory([]);
    setSelectedInventoryId("");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, order]);

  if (!order) return null;

  const orderStatus = normalizeOrderStatus(order.status);
  const payment = normalizePaymentStatus(order.payment_status);
  const transitions = ORDER_STATUS_TRANSITIONS[orderStatus];
  const item = order.order_items?.[0];
  const delivery = order.order_deliveries?.[0];
  const deliveryType = order.delivery_type || item?.delivery_type || "manual";
  const cancelled = orderStatus === "cancelled";

  async function saveDelivery() {
    if (!order || deliverySaving) return;
    if (!deliveryContent.trim()) {
      toast.error("请填写交付信息");
      return;
    }
    setDeliverySaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_type: deliveryType,
          order_item_id: item?.id ?? null,
          delivery_status: "delivered",
          delivery_content: deliveryContent,
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "交付信息保存失败");
      }
      toast.success("交付信息已保存");
      await onReload();
    } catch (saveError) {
      toast.error(getOrderErrorMessage(saveError, "交付信息保存失败"));
    } finally {
      setDeliverySaving(false);
    }
  }

  async function loadAvailableInventory() {
    if (!item?.product_id) {
      toast.error("当前订单商品缺少商品 ID");
      return;
    }
    setDeliverySaving(true);
    try {
      const params = new URLSearchParams({
        mode: "items",
        productId: item.product_id,
        status: "available",
        page: "1",
        pageSize: "100",
      });
      const response = await fetch(`/api/admin/inventory?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { items?: Array<{ id: string; masked_content: string }>; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "可用库存读取失败");
      setAvailableInventory(result?.items ?? []);
      toast.success("可用库存已加载");
    } catch (loadError) {
      toast.error(getOrderErrorMessage(loadError, "可用库存读取失败"));
    } finally {
      setDeliverySaving(false);
    }
  }

  async function deliverSelectedInventory() {
    if (!order || !item?.id || !selectedInventoryId) {
      toast.error("请选择可用库存");
      return;
    }
    if (!window.confirm("确认使用选中的库存发货？该库存会立即标记为已交付。")) return;
    setDeliverySaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_inventory",
          order_item_id: item.id,
          inventory_id: selectedInventoryId,
          note: "管理员手动选择库存发货",
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "手动选择库存发货失败");
      toast.success("库存已交付");
      await onReload();
    } catch (deliverError) {
      toast.error(getOrderErrorMessage(deliverError, "手动选择库存发货失败"));
    } finally {
      setDeliverySaving(false);
    }
  }

  async function retryAutoDelivery() {
    if (!order) return;
    if (!window.confirm("确认重新尝试自动发货？系统只会处理尚未交付的预留库存。")) return;
    setDeliverySaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_auto_delivery" }),
      });
      const result = (await response.json().catch(() => null)) as
        | { deliveredCount?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "自动发货重试失败");
      toast.success(`自动发货完成：${result?.deliveredCount ?? 0} 条`);
      await onReload();
    } catch (retryError) {
      toast.error(getOrderErrorMessage(retryError, "自动发货重试失败"));
    } finally {
      setDeliverySaving(false);
    }
  }

  async function markDeliveryFailed() {
    if (!order) return;
    if (!window.confirm("确认标记交付失败？该操作会写入订单状态日志。")) return;
    setDeliverySaving(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_failed", note: "管理员标记交付失败" }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "交付失败标记失败");
      toast.success("已标记交付失败");
      await onReload();
    } catch (markError) {
      toast.error(getOrderErrorMessage(markError, "交付失败标记失败"));
    } finally {
      setDeliverySaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-[860px] flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <div className="text-lg font-bold text-slate-950">订单详情</div>
            <button
              type="button"
              onClick={() => onCopyOrderNo(order.order_no)}
              className="mt-1 inline-flex items-center gap-2 rounded px-1 py-0.5 font-mono text-xs text-slate-500 hover:bg-muted"
            >
              {order.order_no}
              <Clipboard className="h-3 w-3" />
            </button>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 md:grid-cols-3">
            <InfoBlock label="订单总额" value={formatMoney(order.total_amount)} primary />
            <StatusBlock label="订单状态" value={getOrderStatusLabel(order.status)} className={ORDER_STATUS_STYLES[orderStatus]} />
            <StatusBlock label="支付状态" value={getPaymentStatusLabel(order.payment_status)} className={PAYMENT_STATUS_STYLES[payment]} />
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">用户信息</div>
            <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
              <InfoLine label="用户邮箱" value={order.customer_email || "未填写"} />
              <InfoLine label="用户姓名" value={order.customer_name || "未填写"} />
              <InfoLine label="联系电话" value={order.customer_phone || "未填写"} />
              <InfoLine label="交付方式" value={getDeliveryLabel(deliveryType)} />
              <InfoLine label="收货信息" value={formatShippingAddress(order.shipping_address)} wide />
              <InfoLine label="用户备注" value={order.customer_note || "无"} wide />
              <InfoLine label="管理员备注" value={order.admin_note || "无"} wide />
            </div>
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">订单商品</div>
            <div className="divide-y">
              {(order.order_items ?? []).map((orderItem) => (
                <div key={orderItem.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1fr_110px_80px_120px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">{orderItem.product_name}</div>
                    {orderItem.sku_title ? (
                      <div className="mt-1 truncate text-xs text-slate-500">SKU: {orderItem.sku_title}</div>
                    ) : null}
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {orderItem.category_name || "未记录分类"} · {orderItem.product_slug || "未记录 slug"}
                    </div>
                  </div>
                  <div className="whitespace-nowrap">{formatMoney(orderItem.unit_price)}</div>
                  <div className="whitespace-nowrap">x {orderItem.quantity}</div>
                  <div className="whitespace-nowrap font-semibold text-primary">{formatMoney(orderItem.line_total)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border">
            <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
              <Truck className="h-4 w-4" />
              交付信息
            </div>
            <div className="space-y-4 p-4">
              {delivery?.delivery_content ? (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-medium">当前交付内容</span>
                    <Button variant="outline" size="sm" onClick={() => setShowDelivery((value) => !value)}>
                      {showDelivery ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                      {showDelivery ? "隐藏" : "显示完整"}
                    </Button>
                  </div>
                  <div className="whitespace-pre-wrap break-words leading-6">
                    {showDelivery ? delivery.delivery_content : maskSecret(delivery.delivery_content)}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    交付时间：{formatDate(delivery.delivered_at)} · 更新时间：{formatDate(delivery.updated_at)}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium">{getDeliveryEditorLabel(deliveryType)}</label>
                <textarea
                  value={deliveryContent}
                  onChange={(event) => setDeliveryContent(event.target.value)}
                  disabled={cancelled}
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder={getDeliveryPlaceholder(deliveryType)}
                />
                <div className="flex justify-end">
                  <Button onClick={saveDelivery} disabled={deliverySaving || cancelled}>
                    {cancelled ? "已取消订单不可交付" : deliverySaving ? "处理中..." : "手动填写/补发"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">自动发货与库存交付</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={retryAutoDelivery} disabled={deliverySaving || cancelled}>
                      重新尝试自动发货
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadAvailableInventory} disabled={deliverySaving || cancelled}>
                      加载可用库存
                    </Button>
                    <Button variant="destructive" size="sm" onClick={markDeliveryFailed} disabled={deliverySaving || cancelled}>
                      标记交付失败
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    value={selectedInventoryId}
                    onChange={(event) => setSelectedInventoryId(event.target.value)}
                    disabled={deliverySaving || cancelled}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">选择 available 库存</option>
                    {availableInventory.map((inventory) => (
                      <option key={inventory.id} value={inventory.id}>
                        {inventory.masked_content}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deliverSelectedInventory}
                    disabled={deliverySaving || cancelled || !selectedInventoryId}
                  >
                    选择库存发货
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">状态变更记录</div>
            <div className="space-y-2 p-4">
              {(order.order_status_logs ?? []).length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">暂无状态日志</div>
              ) : (
                (order.order_status_logs ?? []).map((log) => (
                  <div key={log.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span>
                        {log.from_status ? `${getOrderStatusLabel(log.from_status)} → ` : ""}
                        {getOrderStatusLabel(log.to_status)}
                      </span>
                      <span className="shrink-0 text-slate-500">{formatDate(log.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      操作人类型：{log.operator_type || "未知"}{log.note ? ` · ${log.note}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="grid gap-3 text-sm md:grid-cols-2">
            <InfoBlock label="创建时间" value={formatDate(order.created_at)} />
            <InfoBlock label="更新时间" value={formatDate(order.updated_at)} />
          </section>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-slate-50 px-6 py-4">
          {transitions.length === 0 ? (
            <span className="text-sm text-slate-400">当前状态无可用操作</span>
          ) : (
            transitions.map((nextStatus) => (
              <Button
                key={nextStatus}
                variant={isDangerStatus(nextStatus) ? "destructive" : "outline"}
                disabled={updating}
                onClick={() => onUpdateStatus(order, nextStatus)}
              >
                {getActionLabel(nextStatus)}
              </Button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function getDeliveryEditorLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "shipping") return "物流公司、物流单号、发货时间";
  if (deliveryType === "automatic" || deliveryType === "card" || deliveryType === "account") {
    return "交付内容、卡密或账号信息、交付备注";
  }
  return "处理说明、交付结果、完成时间";
}

function getDeliveryPlaceholder(deliveryType: string | null | undefined) {
  if (deliveryType === "shipping") {
    return "例：物流公司：DHL\n物流单号：123456789\n发货时间：2026-06-20 15:30";
  }
  if (deliveryType === "automatic" || deliveryType === "card" || deliveryType === "account") {
    return "例：账号/卡密/兑换码：...\n交付备注：请收到后第一时间检查";
  }
  return "例：处理说明：...\n交付结果：...\n完成时间：...";
}

function InfoBlock({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-2 break-words font-semibold", primary && "text-primary")}>{value}</div>
    </div>
  );
}

function StatusBlock({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
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
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

function formatShippingAddress(value: Record<string, unknown> | null) {
  if (!value) return "未填写";
  const recipient = typeof value.recipient === "string" ? value.recipient : "";
  const phone = typeof value.phone === "string" ? value.phone : "";
  const country = typeof value.country === "string" ? value.country : "";
  const region = typeof value.region === "string" ? value.region : "";
  const address = typeof value.address === "string" ? value.address : "";
  return [recipient, phone, country, region, address].filter(Boolean).join(" ") || "未填写";
}
