"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Search, X } from "lucide-react";

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

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
        search,
      });
      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { orders?: OrderRecord[]; count?: number; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrders(result?.orders ?? []);
      setCount(Number(result?.count ?? 0));
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, paymentStatus, search, status]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function updateOrderStatus(order: OrderRecord, nextStatus: OrderStatus) {
    setUpdatingId(order.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
          payment_status: getNextPaymentStatus(nextStatus),
          admin_note: `管理员更新状态为：${getOrderStatusLabel(nextStatus)}`,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "订单状态更新失败");
      }

      setMessage("订单状态已更新");
      await loadOrders();
      setSelectedOrder((current) =>
        current?.id === order.id ? { ...current, status: nextStatus } : current
      );
    } catch (updateError) {
      setError(getOrderErrorMessage(updateError, "订单状态更新失败"));
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="w-full max-w-none space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">订单管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            真实订单列表、状态处理和订单日志入口。
          </p>
        </div>
        <Button variant="outline" onClick={loadOrders}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="w-full max-w-none">
        <CardHeader className="space-y-4 pb-4">
          <CardTitle className="text-base">订单列表</CardTitle>
          <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_170px_170px_130px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索订单号或用户邮箱"
                className="pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">全部订单状态</option>
              {ORDER_STATUS_VALUES.map((item) => (
                <option key={item} value={item}>
                  {getOrderStatusLabel(item)}
                </option>
              ))}
            </select>
            <select
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">全部支付状态</option>
              {PAYMENT_STATUS_VALUES.map((item) => (
                <option key={item} value={item}>
                  {getPaymentStatusLabel(item)}
                </option>
              ))}
            </select>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  每页 {item} 条
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center text-sm text-slate-500">
              <div className="text-base font-semibold text-slate-900">暂无订单数据</div>
              <p className="mt-2">当前数据库中还没有订单。</p>
              <Button variant="outline" size="sm" className="mt-5" onClick={loadOrders}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                刷新
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1300px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr className="border-b">
                    <th className="whitespace-nowrap px-3 py-3 text-left">订单编号</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">用户邮箱</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">商品摘要</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">金额</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">订单状态</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">支付状态</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">交付方式</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left">创建时间</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const orderStatus = normalizeOrderStatus(order.status);
                    const payment = normalizePaymentStatus(order.payment_status);
                    const item = order.order_items?.[0];
                    const transitions = ORDER_STATUS_TRANSITIONS[orderStatus];

                    return (
                      <tr key={order.id} className="border-b hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                          {order.order_no}
                        </td>
                        <td className="max-w-[210px] truncate px-3 py-4">
                          {order.customer_email || "未填写"}
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-4 font-medium">
                          {item?.product_name ?? "订单商品"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-primary">
                          ¥{Number(order.total_amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-4">
                          <Badge
                            variant="outline"
                            className={cn("whitespace-nowrap text-xs", ORDER_STATUS_STYLES[orderStatus])}
                          >
                            {getOrderStatusLabel(order.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-4">
                          <Badge
                            variant="outline"
                            className={cn("whitespace-nowrap text-xs", PAYMENT_STATUS_STYLES[payment])}
                          >
                            {getPaymentStatusLabel(order.payment_status)}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          {order.delivery_type || item?.delivery_type || "未记录"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-slate-500">
                          {new Date(order.created_at).toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                        </td>
                        <td className="px-3 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {transitions.length === 0 ? (
                              <span className="text-xs text-slate-400">无可用操作</span>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedOrder(order)}
                                >
                                  查看
                                </Button>
                                {transitions.map((nextStatus) => (
                                <Button
                                  key={nextStatus}
                                  variant="outline"
                                  size="sm"
                                  disabled={updatingId === order.id}
                                  onClick={() => updateOrderStatus(order, nextStatus)}
                                >
                                  {getOrderStatusLabel(nextStatus)}
                                </Button>
                                ))}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>共 {count} 条订单</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
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
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
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

function AdminOrderDrawer({
  order,
  updating,
  onClose,
  onUpdateStatus,
}: {
  order: OrderRecord | null;
  updating: boolean;
  onClose: () => void;
  onUpdateStatus: (order: OrderRecord, nextStatus: OrderStatus) => void;
}) {
  if (!order) return null;

  const orderStatus = normalizeOrderStatus(order.status);
  const payment = normalizePaymentStatus(order.payment_status);
  const transitions = ORDER_STATUS_TRANSITIONS[orderStatus];
  const item = order.order_items?.[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-[860px] flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <div className="text-lg font-bold text-slate-950">订单详情</div>
            <div className="mt-1 font-mono text-xs text-slate-500">
              {order.order_no}
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 md:grid-cols-3">
            <InfoBlock label="订单金额" value={`¥${Number(order.total_amount).toFixed(2)}`} primary />
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-500">订单状态</div>
              <Badge
                variant="outline"
                className={cn("mt-2 whitespace-nowrap text-xs", ORDER_STATUS_STYLES[orderStatus])}
              >
                {getOrderStatusLabel(order.status)}
              </Badge>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-500">支付状态</div>
              <Badge
                variant="outline"
                className={cn("mt-2 whitespace-nowrap text-xs", PAYMENT_STATUS_STYLES[payment])}
              >
                {getPaymentStatusLabel(order.payment_status)}
              </Badge>
            </div>
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">用户与交付信息</div>
            <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
              <InfoLine label="用户邮箱" value={order.customer_email || "未填写"} />
              <InfoLine label="用户姓名" value={order.customer_name || "未填写"} />
              <InfoLine label="联系电话" value={order.customer_phone || "未填写"} />
              <InfoLine label="交付方式" value={order.delivery_type || item?.delivery_type || "未记录"} />
              <InfoLine
                label="收货地址"
                value={formatShippingAddress(order.shipping_address)}
                wide
              />
              <InfoLine label="用户备注" value={order.customer_note || "无"} wide />
              <InfoLine label="管理员备注" value={order.admin_note || "无"} wide />
            </div>
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">商品明细</div>
            <div className="divide-y">
              {(order.order_items ?? []).map((orderItem) => (
                <div key={orderItem.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1fr_110px_80px_120px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">
                      {orderItem.product_name}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {orderItem.category_name || "未记录分类"} · {orderItem.product_slug || "未记录 slug"}
                    </div>
                  </div>
                  <div className="whitespace-nowrap">¥{Number(orderItem.unit_price).toFixed(2)}</div>
                  <div className="whitespace-nowrap">x {orderItem.quantity}</div>
                  <div className="whitespace-nowrap font-semibold text-primary">
                    ¥{Number(orderItem.line_total).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border">
            <div className="border-b px-4 py-3 font-semibold">状态时间线</div>
            <div className="space-y-2 p-4">
              {(order.order_status_logs ?? []).length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  暂无状态日志
                </div>
              ) : (
                (order.order_status_logs ?? []).map((log) => (
                  <div key={log.id} className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>
                      {getOrderStatusLabel(log.to_status)}
                      {log.note ? ` · ${log.note}` : ""}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {new Date(log.created_at).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-slate-50 px-6 py-4">
          {transitions.length === 0 ? (
            <span className="text-sm text-slate-400">当前状态无可用操作</span>
          ) : (
            transitions.map((nextStatus) => (
              <Button
                key={nextStatus}
                variant="outline"
                disabled={updating}
                onClick={() => onUpdateStatus(order, nextStatus)}
              >
                {getOrderStatusLabel(nextStatus)}
              </Button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-2 font-semibold", primary && "text-primary")}>
        {value}
      </div>
    </div>
  );
}

function InfoLine({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn(wide && "md:col-span-2")}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

function formatShippingAddress(value: Record<string, unknown> | null) {
  if (!value) return "未填写";
  const region = typeof value.region === "string" ? value.region : "";
  const address = typeof value.address === "string" ? value.address : "";
  return [region, address].filter(Boolean).join(" ") || "未填写";
}
