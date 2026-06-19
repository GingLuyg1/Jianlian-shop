type ProductStateLike = {
  status: string | null;
  stock: number | null;
};

export type ProductStatus = "active" | "inactive" | "sold_out" | "draft";

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  active: "可购买",
  inactive: "已下架",
  sold_out: "已售罄",
  draft: "草稿",
};

export function normalizeProductStatus(status: string | null | undefined): ProductStatus {
  if (status === "active" || status === "inactive" || status === "sold_out" || status === "draft") {
    return status;
  }
  if (status === "published" || status === "enabled" || status === "on_sale") return "active";
  if (status === "disabled" || status === "off_sale") return "inactive";
  return "draft";
}

export function isFrontendVisibleStatus(status: string | null | undefined) {
  const normalized = normalizeProductStatus(status);
  return normalized === "active" || normalized === "sold_out";
}

export function isPurchasableProduct(product: ProductStateLike | null | undefined) {
  if (!product) return false;
  return normalizeProductStatus(product.status) === "active" && Number(product.stock ?? 0) > 0;
}

export function getProductUnavailableReason(product: ProductStateLike | null | undefined) {
  if (!product) return "商品不存在或已被删除";
  const status = normalizeProductStatus(product.status);
  if (status === "sold_out") return "该商品已售罄";
  if (status !== "active") return "该商品目前不可购买";
  if (Number(product.stock ?? 0) <= 0) return "该商品暂时缺货";
  return "";
}

export function getStockLabel(product: ProductStateLike) {
  const status = normalizeProductStatus(product.status);
  if (status === "sold_out") return "已售罄";
  if (Number(product.stock ?? 0) <= 0) return "暂时缺货";
  return `库存 ${Number(product.stock ?? 0)}`;
}

export function getDeliveryLabel(deliveryType: string | null | undefined) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  if (deliveryType === "manual") return "人工处理";
  return deliveryType || "人工处理";
}
