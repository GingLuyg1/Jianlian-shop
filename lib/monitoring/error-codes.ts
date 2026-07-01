export type ErrorDomain =
  | "AUTH"
  | "PERMISSION"
  | "VALIDATION"
  | "PRODUCT"
  | "CATEGORY"
  | "SKU"
  | "ORDER"
  | "PAYMENT"
  | "RECHARGE"
  | "REFUND"
  | "BALANCE"
  | "INVENTORY"
  | "DELIVERY"
  | "DATABASE"
  | "PROVIDER"
  | "SYSTEM";

export const ERROR_CODES = {
  AUTH_REQUIRED: { domain: "AUTH", message: "请先登录。" },
  PERMISSION_DENIED: { domain: "PERMISSION", message: "无权限执行此操作。" },
  VALIDATION_FAILED: { domain: "VALIDATION", message: "提交内容不完整或格式不正确。" },
  PRODUCT_NOT_FOUND: { domain: "PRODUCT", message: "商品不存在或已下架。" },
  PRODUCT_UPDATE_FAILED: { domain: "PRODUCT", message: "商品保存失败，请稍后重试。" },
  PRODUCT_UPDATE_NO_ROWS: { domain: "PRODUCT", message: "未找到需要更新的商品。" },
  SKU_SAVE_FAILED: { domain: "SKU", message: "SKU 保存失败，请检查规格信息。" },
  ORDER_CREATE_FAILED: { domain: "ORDER", message: "订单创建失败，请稍后重试。" },
  PAYMENT_PROVIDER_NOT_CONFIGURED: { domain: "PAYMENT", message: "支付方式尚未配置。" },
  PAYMENT_SIGNATURE_INVALID: { domain: "PAYMENT", message: "支付回调校验失败。" },
  BALANCE_UPDATE_FAILED: { domain: "BALANCE", message: "余额更新失败，请联系管理员。" },
  INVENTORY_RESERVATION_FAILED: { domain: "INVENTORY", message: "库存预留失败，请稍后重试。" },
  DELIVERY_FAILED: { domain: "DELIVERY", message: "交付处理失败，请联系客服。" },
  DATABASE_UNAVAILABLE: { domain: "DATABASE", message: "数据库暂时不可用，请稍后重试。" },
  INTERNAL_ERROR: { domain: "SYSTEM", message: "系统繁忙，请稍后重试。" },
} as const satisfies Record<string, { domain: ErrorDomain; message: string }>;

export type AppErrorCode = keyof typeof ERROR_CODES;

export function getSafeErrorResponse(code: AppErrorCode, requestId: string, overrideMessage?: string) {
  const item = ERROR_CODES[code] ?? ERROR_CODES.INTERNAL_ERROR;
  return {
    success: false,
    error: {
      code,
      message: overrideMessage ?? item.message,
      request_id: requestId,
    },
  };
}
