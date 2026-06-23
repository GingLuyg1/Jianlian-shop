import type { OrderDeliveryRecord, OrderItemRecord } from "./order-types";

export const ORDER_ITEM_DELIVERY_TYPES = [
  "auto_delivery",
  "manual_delivery",
  "service",
  "physical",
] as const;

export const ORDER_ITEM_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "delivered",
  "failed",
  "not_required",
  "cancelled",
] as const;

export const ORDER_FULFILLMENT_STATUSES = [
  "pending",
  "partially_delivered",
  "processing",
  "delivered",
  "delivery_failed",
] as const;

export type OrderItemDeliveryType = (typeof ORDER_ITEM_DELIVERY_TYPES)[number];
export type OrderItemDeliveryStatus = (typeof ORDER_ITEM_DELIVERY_STATUSES)[number];
export type OrderFulfillmentStatus = (typeof ORDER_FULFILLMENT_STATUSES)[number];

export type FulfillmentItemSummary = {
  itemId: string;
  productName: string;
  quantity: number;
  deliveryType: OrderItemDeliveryType;
  deliveryStatus: OrderItemDeliveryStatus;
  deliveredQuantity: number;
  pendingQuantity: number;
  deliveredAt: string | null;
  failureReason: string | null;
};

const legacyAutoTypes = new Set(["automatic", "auto", "card", "account", "digital", "auto_delivery"]);
const legacyManualTypes = new Set(["manual", "manual_delivery"]);
const legacyPhysicalTypes = new Set(["shipping", "physical"]);
const legacyServiceTypes = new Set(["service", "none", "not_required"]);

export function normalizeOrderItemDeliveryType(value: unknown): OrderItemDeliveryType {
  const text = typeof value === "string" ? value : "";
  if (legacyAutoTypes.has(text)) return "auto_delivery";
  if (legacyPhysicalTypes.has(text)) return "physical";
  if (legacyServiceTypes.has(text)) return "service";
  if (legacyManualTypes.has(text)) return "manual_delivery";
  return "manual_delivery";
}

export function normalizeOrderItemDeliveryStatus(value: unknown, deliveryType?: unknown): OrderItemDeliveryStatus {
  const text = typeof value === "string" ? value : "";
  if (ORDER_ITEM_DELIVERY_STATUSES.includes(text as OrderItemDeliveryStatus)) {
    return text as OrderItemDeliveryStatus;
  }
  const type = normalizeOrderItemDeliveryType(deliveryType);
  if (type === "service") return "not_required";
  if (type === "physical") return "processing";
  return "pending";
}

export function getOrderItemDeliveryTypeLabel(value: unknown) {
  const labels: Record<OrderItemDeliveryType, string> = {
    auto_delivery: "自动发货",
    manual_delivery: "人工交付",
    service: "无需交付",
    physical: "物流处理",
  };
  return labels[normalizeOrderItemDeliveryType(value)];
}

export function getOrderItemDeliveryStatusLabel(value: unknown, deliveryType?: unknown) {
  const labels: Record<OrderItemDeliveryStatus, string> = {
    pending: "待交付",
    processing: "处理中",
    delivered: "已交付",
    failed: "交付失败",
    not_required: "无需交付",
    cancelled: "已取消",
  };
  return labels[normalizeOrderItemDeliveryStatus(value, deliveryType)];
}

export function getOrderFulfillmentStatusLabel(value: unknown) {
  const labels: Record<OrderFulfillmentStatus, string> = {
    pending: "待交付",
    partially_delivered: "部分商品已交付",
    processing: "交付处理中",
    delivered: "全部已交付",
    delivery_failed: "交付异常",
  };
  return labels[ORDER_FULFILLMENT_STATUSES.includes(value as OrderFulfillmentStatus) ? value as OrderFulfillmentStatus : "pending"];
}

export function summarizeFulfillmentItems(
  items: OrderItemRecord[] = [],
  deliveries: OrderDeliveryRecord[] = []
): FulfillmentItemSummary[] {
  return items.map((item) => {
    const deliveryType = normalizeOrderItemDeliveryType(item.delivery_type);
    const itemDeliveries = deliveries.filter((delivery) => delivery.order_item_id === item.id);
    const deliveredRows = itemDeliveries.filter((delivery) => delivery.delivery_status === "delivered");
    const failedRow = itemDeliveries.find((delivery) => delivery.delivery_status === "failed");
    const deliveredQuantity = deliveryType === "service"
      ? Number(item.quantity || 1)
      : Math.min(Number(item.quantity || 1), deliveredRows.length || Number(item.delivered_quantity ?? 0));
    const fallbackStatus = normalizeOrderItemDeliveryStatus(item.delivery_status, deliveryType);
    const deliveryStatus = failedRow
      ? "failed"
      : deliveryType === "service"
        ? "not_required"
        : deliveredQuantity >= Number(item.quantity || 1)
          ? "delivered"
          : fallbackStatus;
    const lastDelivery = deliveredRows[0] ?? itemDeliveries[0];

    return {
      itemId: item.id,
      productName: item.product_name,
      quantity: Number(item.quantity || 1),
      deliveryType,
      deliveryStatus,
      deliveredQuantity,
      pendingQuantity: Math.max(Number(item.quantity || 1) - deliveredQuantity, 0),
      deliveredAt: item.delivery_completed_at ?? lastDelivery?.delivered_at ?? null,
      failureReason: item.delivery_failure_reason ?? failedRow?.failure_reason ?? null,
    };
  });
}

export function computeOrderFulfillmentStatus(summaries: FulfillmentItemSummary[]): OrderFulfillmentStatus {
  if (summaries.length === 0) return "pending";
  const complete = summaries.filter((item) => item.deliveryStatus === "delivered" || item.deliveryStatus === "not_required").length;
  const failed = summaries.some((item) => item.deliveryStatus === "failed");
  const processing = summaries.some((item) => item.deliveryStatus === "processing");
  const pending = summaries.some((item) => item.deliveryStatus === "pending");

  if (complete === summaries.length) return "delivered";
  if (failed && complete === 0 && !pending && !processing) return "delivery_failed";
  if (failed && complete > 0) return "partially_delivered";
  if (complete > 0) return "partially_delivered";
  if (processing || failed) return "processing";
  return "pending";
}
