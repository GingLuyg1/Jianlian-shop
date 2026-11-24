export type BaseDeliveryType = "manual" | "automatic" | "shipping";

export type ExtendedDeliveryMode =
  | "manual"
  | "automatic"
  | "automatic_digital_inventory"
  | "shipping"
  | "preorder_address"
  | "preorder_email";

export const EXTENDED_DELIVERY_OPTIONS: ReadonlyArray<{
  value: ExtendedDeliveryMode;
  label: string;
  baseDeliveryType: BaseDeliveryType;
}> = [
  { value: "manual", label: "人工发货", baseDeliveryType: "manual" },
  { value: "automatic", label: "自动发货", baseDeliveryType: "automatic" },
  { value: "automatic_digital_inventory", label: "自动发货-数字库存", baseDeliveryType: "automatic" },
  { value: "shipping", label: "物流发货", baseDeliveryType: "shipping" },
  { value: "preorder_address", label: "预约发货-地址表单", baseDeliveryType: "shipping" },
  { value: "preorder_email", label: "预约发货-邮箱表单", baseDeliveryType: "manual" },
];

export const EXTENDED_DELIVERY_LABELS: Record<ExtendedDeliveryMode, string> = {
  manual: "人工发货",
  automatic: "自动发货",
  automatic_digital_inventory: "自动发货-数字库存",
  shipping: "物流发货",
  preorder_address: "预约发货-地址表单",
  preorder_email: "预约发货-邮箱表单",
};

export function extractDeliveryModeFromMetadata(metadata: unknown): ExtendedDeliveryMode | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).delivery_mode;
  if (
    raw === "manual" ||
    raw === "automatic" ||
    raw === "automatic_digital_inventory" ||
    raw === "shipping" ||
    raw === "preorder_address" ||
    raw === "preorder_email"
  ) {
    return raw;
  }
  return null;
}

export function resolveExtendedDeliveryMode(
  deliveryType?: string | null,
  metadata?: unknown
): ExtendedDeliveryMode {
  const fromMeta = extractDeliveryModeFromMetadata(metadata);
  if (fromMeta) return fromMeta;
  if (deliveryType === "automatic") return "automatic";
  if (deliveryType === "shipping") return "shipping";
  if (deliveryType === "automatic_digital_inventory") return "automatic_digital_inventory";
  if (deliveryType === "preorder_address") return "preorder_address";
  if (deliveryType === "preorder_email") return "preorder_email";
  return "manual";
}

export function toBaseDeliveryType(mode: ExtendedDeliveryMode | string | null | undefined): BaseDeliveryType {
  if (mode === "automatic" || mode === "automatic_digital_inventory") return "automatic";
  if (mode === "shipping" || mode === "preorder_address") return "shipping";
  return "manual";
}

export function withDeliveryModeMetadata(
  metadata: Record<string, unknown> | null | undefined,
  mode: ExtendedDeliveryMode | ""
): Record<string, unknown> {
  const next: Record<string, unknown> =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  if (
    mode === "automatic_digital_inventory" ||
    mode === "preorder_address" ||
    mode === "preorder_email"
  ) {
    next.delivery_mode = mode;
  } else {
    delete next.delivery_mode;
  }
  return next;
}

export function isPreorderDeliveryMode(mode?: string | null, metadata?: unknown): boolean {
  const resolved = mode ? resolveExtendedDeliveryMode(mode, metadata) : extractDeliveryModeFromMetadata(metadata);
  return resolved === "preorder_address" || resolved === "preorder_email";
}

export function getExtendedDeliveryLabel(deliveryType?: string | null, metadata?: unknown): string {
  const mode = resolveExtendedDeliveryMode(deliveryType, metadata);
  return EXTENDED_DELIVERY_LABELS[mode] ?? "人工发货";
}

export type PublicStockStatusCode = "preorder" | "abundant" | "tight" | "out";

export interface PublicStockDisplay {
  code: PublicStockStatusCode;
  label: "预约发货" | "库存充裕" | "库存紧张" | "暂无库存";
  available: boolean;
  textClassName: string;
  badgeClassName: string;
}

export function getPublicStockDisplay(
  stock: number | null | undefined,
  options?: { deliveryType?: string | null; deliveryMode?: string | null; metadata?: unknown }
): PublicStockDisplay {
  const mode = options?.deliveryMode || extractDeliveryModeFromMetadata(options?.metadata);
  if (isPreorderDeliveryMode(mode ?? options?.deliveryType, options?.metadata)) {
    return {
      code: "preorder",
      label: "预约发货",
      available: true,
      textClassName: "text-blue-600",
      badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  const numericStock = Math.max(0, Math.floor(Number(stock ?? 0)));
  if (numericStock >= 10) {
    return {
      code: "abundant",
      label: "库存充裕",
      available: true,
      textClassName: "text-emerald-600",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (numericStock > 0) {
    return {
      code: "tight",
      label: "库存紧张",
      available: true,
      textClassName: "text-amber-600",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    code: "out",
    label: "暂无库存",
    available: false,
    textClassName: "text-slate-400",
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-500",
  };
}

export function isItemOutOfStockForSort(item: {
  stock?: number | null;
  deliveryType?: string | null;
  deliveryMode?: string | null;
  metadata?: unknown;
}): boolean {
  const display = getPublicStockDisplay(item.stock, {
    deliveryType: item.deliveryType,
    deliveryMode: item.deliveryMode,
    metadata: item.metadata,
  });
  return !display.available;
}

export function sortProductsWithOutOfStockLast<
  T extends {
    stock?: number | null;
    deliveryType?: string | null;
    deliveryMode?: string | null;
    metadata?: unknown;
  },
>(items: readonly T[]): T[] {
  const inStock: T[] = [];
  const outOfStock: T[] = [];
  for (const item of items) {
    if (isItemOutOfStockForSort(item)) {
      outOfStock.push(item);
    } else {
      inStock.push(item);
    }
  }
  return [...inStock, ...outOfStock];
}
