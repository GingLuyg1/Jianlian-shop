import type { OrderRecord } from "./order-types";

export const COMMON_LOGISTICS_CARRIERS = [
  "顺丰速运",
  "京东物流",
  "中通快递",
  "圆通速递",
  "韵达快递",
  "申通快递",
  "极兔速递",
  "EMS 邮政",
  "其他快递",
] as const;

export type ParsedShippingInfo = {
  recipient: string;
  phone: string;
  address: string;
  carrier: string;
  trackingNo: string;
  shippingNote: string;
  shippedAt: string | null;
  copyText: string;
};

export function isShippingOrderRecord(order: OrderRecord | null | undefined): boolean {
  if (!order) return false;
  if (String(order.delivery_type ?? "").toLowerCase() === "shipping") return true;
  if (
    Array.isArray(order.order_items) &&
    order.order_items.some((item) => String(item.delivery_type ?? "").toLowerCase() === "shipping")
  ) {
    return true;
  }
  const addr = order.shipping_address;
  if (addr && typeof addr === "object") {
    if (typeof addr.address === "string" && addr.address.trim()) return true;
    if (typeof addr.tracking_no === "string" && addr.tracking_no.trim()) return true;
  }
  return false;
}

export function parseOrderShippingInfo(order: OrderRecord | null | undefined): ParsedShippingInfo {
  const raw =
    order?.shipping_address && typeof order.shipping_address === "object"
      ? order.shipping_address
      : null;

  const recipient = String(
    (raw && typeof raw.recipient === "string" && raw.recipient.trim()) ||
      order?.customer_name ||
      ""
  ).trim();

  const phone = String(
    (raw && typeof raw.phone === "string" && raw.phone.trim()) ||
      order?.customer_phone ||
      ""
  ).trim();

  const region = raw && typeof raw.region === "string" ? raw.region.trim() : "";
  const detail = raw && typeof raw.address === "string" ? raw.address.trim() : "";
  const address =
    region && detail
      ? region === detail || detail.startsWith(region)
        ? detail
        : `${region} ${detail}`
      : detail || region;

  const carrier = raw && typeof raw.carrier === "string" ? raw.carrier.trim() : "";
  const trackingNo = raw && typeof raw.tracking_no === "string" ? raw.tracking_no.trim() : "";
  const shippingNote = raw && typeof raw.shipping_note === "string" ? raw.shipping_note.trim() : "";
  const shippedAt = raw && typeof raw.shipped_at === "string" && raw.shipped_at.trim() ? raw.shipped_at.trim() : null;

  const copyParts = [
    recipient ? `收件人：${recipient}` : "",
    phone ? `联系电话：${phone}` : "",
    address ? `收货地址：${address}` : "",
  ].filter(Boolean);

  return {
    recipient,
    phone,
    address,
    carrier,
    trackingNo,
    shippingNote,
    shippedAt,
    copyText: copyParts.join("\n"),
  };
}
