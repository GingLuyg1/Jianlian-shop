"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderRecord } from "@/lib/orders/order-types";
import {
  computeOrderFulfillmentStatus,
  getOrderFulfillmentStatusLabel,
  getOrderItemDeliveryStatusLabel,
  getOrderItemDeliveryTypeLabel,
  normalizeOrderItemDeliveryType,
  summarizeFulfillmentItems,
} from "@/lib/orders/order-fulfillment-status";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function statusClass(status: string) {
  if (status === "delivered" || status === "not_required") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "processing") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function OrderFulfillmentPanel({
  order,
  onReload,
}: {
  order: OrderRecord;
  onReload: () => Promise<void>;
}) {
  const [activeItemId, setActiveItemId] = useState("");
  const [contentByItem, setContentByItem] = useState<Record<string, string>>({});
  const [noteByItem, setNoteByItem] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [retryingAuto, setRetryingAuto] = useState(false);
  const submitLockRef = useRef(false);
  const retryLockRef = useRef(false);

  const summaries = useMemo(
    () => summarizeFulfillmentItems(order.order_items ?? [], order.order_deliveries ?? []),
    [order.order_deliveries, order.order_items]
  );
  const aggregateStatus = computeOrderFulfillmentStatus(summaries);
  const hasPendingAutoDelivery = useMemo(
    () =>
      order.payment_status === "paid" &&
      !["cancelled", "expired", "refunded", "failed"].includes(order.status) &&
      summaries.some(
        (item) =>
          item.deliveryType === "auto_delivery" &&
          item.deliveryStatus !== "delivered" &&
          item.deliveryStatus !== "not_required"
      ),
    [order.payment_status, order.status, summaries]
  );

  async function retryAutoDelivery() {
    if (retryingAuto || retryLockRef.current) return;
    if (!window.confirm("确认重新触发该订单的自动发货流程（将先检查本地卡密库存，再按商品绑定走供应商自动采购）？")) return;

    retryLockRef.current = true;
    setRetryingAuto(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_auto_delivery" }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; deliveredCount?: number } | null;
      if (!response.ok) throw new Error(result?.error ?? "重试自动发货失败");
      toast.success(
        result?.deliveredCount && result.deliveredCount > 0
          ? `自动发货已完成（共交付 ${result.deliveredCount} 项）`
          : "已触发自动发货检查"
      );
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重试自动发货失败");
    } finally {
      retryLockRef.current = false;
      setRetryingAuto(false);
    }
  }

  async function submitManualDelivery(itemId: string) {
    if (saving || submitLockRef.current) return;
    const content = (contentByItem[itemId] ?? "").trim();
    const note = (noteByItem[itemId] ?? "").trim();
    if (!content) {
      toast.error("请填写交付内容");
      return;
    }
    if (!window.confirm("确认提交该订单项的人工交付内容？提交后当前版本不支持重复提交。")) return;

    submitLockRef.current = true;
    setSaving(true);
    setActiveItemId(itemId);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_content: content, delivery_note: note || null }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "人工交付失败");
      toast.success("订单项已交付");
      setContentByItem((value) => ({ ...value, [itemId]: "" }));
      setNoteByItem((value) => ({ ...value, [itemId]: "" }));
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "人工交付失败");
    } finally {
      submitLockRef.current = false;
      setSaving(false);
      setActiveItemId("");
    }
  }

  return (
    <section className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="font-semibold">订单项交付状态</div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPendingAutoDelivery ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retryingAuto || saving}
              onClick={() => void retryAutoDelivery()}
            >
              {retryingAuto ? "自动发货重试中..." : "重试自动发货"}
            </Button>
          ) : null}
          <Badge variant="outline" className={statusClass(aggregateStatus)}>
            {getOrderFulfillmentStatusLabel(aggregateStatus)}
          </Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">商品名称</th>
              <th className="px-3 py-2 text-left">数量</th>
              <th className="px-3 py-2 text-left">交付类型</th>
              <th className="px-3 py-2 text-left">交付状态</th>
              <th className="px-3 py-2 text-left">已交付</th>
              <th className="px-3 py-2 text-left">待交付</th>
              <th className="px-3 py-2 text-left">交付时间</th>
              <th className="px-3 py-2 text-left">失败原因</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((item) => (
              <tr key={item.itemId} className="border-t align-top">
                <td className="px-4 py-3 font-medium text-slate-900">{item.productName}</td>
                <td className="px-3 py-3">{item.quantity}</td>
                <td className="px-3 py-3">{getOrderItemDeliveryTypeLabel(item.deliveryType)}</td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className={statusClass(item.deliveryStatus)}>
                    {getOrderItemDeliveryStatusLabel(item.deliveryStatus, item.deliveryType)}
                  </Badge>
                </td>
                <td className="px-3 py-3">{item.deliveredQuantity}</td>
                <td className="px-3 py-3">{item.pendingQuantity}</td>
                <td className="px-3 py-3">{formatDate(item.deliveredAt)}</td>
                <td className="px-3 py-3 text-slate-500">{item.failureReason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 border-t p-4">
        {(order.order_items ?? [])
          .filter((item) => normalizeOrderItemDeliveryType(item.delivery_type) === "manual_delivery")
          .map((item) => {
            const summary = summaries.find((entry) => entry.itemId === item.id);
            const completed = summary?.deliveryStatus === "delivered" || summary?.deliveryStatus === "not_required";
            return (
              <div key={item.id} className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{item.product_name}</div>
                    {item.sku_title ? (
                      <div className="mt-0.5 text-xs text-slate-500">商品规格: {item.sku_title}</div>
                    ) : null}
                  </div>
                  <Badge variant="outline" className={statusClass(summary?.deliveryStatus ?? "pending")}>{getOrderItemDeliveryStatusLabel(summary?.deliveryStatus, item.delivery_type)}</Badge>
                </div>
                <textarea
                  value={contentByItem[item.id] ?? ""}
                  onChange={(event) => setContentByItem((value) => ({ ...value, [item.id]: event.target.value }))}
                  disabled={completed || saving}
                  rows={4}
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100"
                  placeholder="填写交付内容，不要在备注或审计日志中粘贴完整卡密"
                />
                <input
                  value={noteByItem[item.id] ?? ""}
                  onChange={(event) => setNoteByItem((value) => ({ ...value, [item.id]: event.target.value }))}
                  disabled={completed || saving}
                  className="mt-2 h-9 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100"
                  placeholder="使用说明，可选"
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" disabled={completed || saving} onClick={() => submitManualDelivery(item.id)}>
                    {completed ? "已交付" : saving && activeItemId === item.id ? "提交中..." : "提交交付"}
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
