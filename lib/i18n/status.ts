export const COMMON_STATUS_LABELS: Record<string, string> = {
  active: "已启用",
  inactive: "已停用",
  draft: "草稿",
  sold_out: "售罄",
  pending: "待处理",
  processing: "处理中",
  paid: "已支付",
  succeeded: "已成功",
  success: "已成功",
  completed: "已完成",
  failed: "失败",
  expired: "已过期",
  closed: "已关闭",
  cancelled: "已取消",
  refunded: "已退款",
  partially_refunded: "部分退款",
  requested: "待审核",
  reviewing: "审核中",
  approved: "已批准",
  rejected: "已拒绝",
  delivered: "已交付",
  partially_delivered: "部分交付",
  delivery_failed: "交付失败",
  not_required: "无需交付",
  manual_delivery: "人工交付",
  auto_delivery: "自动发货",
  service: "服务商品",
  physical: "实体商品",
  available: "可用",
  reserved: "已预留",
  disabled: "已禁用",
  invalid: "无效",
};

export function getStatusLabel(status: unknown, fallback = "未知状态") {
  const key = String(status ?? "").trim();
  if (!key) return fallback;
  return COMMON_STATUS_LABELS[key] ?? fallback;
}

