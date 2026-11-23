export type TicketType = "order" | "recharge" | "account" | "api" | "other";
export type TicketPriority = "normal" | "urgent" | "emergency";
export type TicketStatus = "processing" | "completed";

export const TICKET_TYPES: { value: TicketType; label: string; desc: string }[] = [
  { value: "order", label: "订单售后", desc: "未发货、卡密异常、充值未到账等" },
  { value: "recharge", label: "充值问题", desc: "余额充值、汇率计算、USDT转账未入账等" },
  { value: "account", label: "账号异常", desc: "账号密码错误、2FA失效、区域限制等" },
  { value: "api", label: "接口对接", desc: "API申请、商户密钥、加白与接口调用" },
  { value: "other", label: "其他问题", desc: "商务合作、功能建议与体验反馈" },
];

export const TICKET_PRIORITIES: { value: TicketPriority; label: string; color: string }[] = [
  { value: "normal", label: "普通", color: "text-slate-600 bg-slate-100/90 border-slate-200" },
  { value: "urgent", label: "加急", color: "text-amber-700 bg-amber-50 border-amber-200/80" },
  { value: "emergency", label: "紧急", color: "text-rose-700 bg-rose-50 border-rose-200/80" },
];

export const TICKET_STATUSES: { value: TicketStatus; label: string; badgeClass: string }[] = [
  { value: "processing", label: "处理中", badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80" },
  { value: "completed", label: "已完成", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
];

export interface TicketMessage {
  id: string;
  sender: "user" | "support";
  senderName: string;
  content: string;
  images?: string[];
  createdAt: string;
}

export interface TicketItem {
  id: string;
  title: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  orderNo?: string;
  email: string;
  description: string;
  images?: string[];
  createdAt: string;
  updatedAt: string;
  hasUnreadReply?: boolean;
  isFlagged?: boolean;
  messages: TicketMessage[];
}

export const STORAGE_KEY = "jianlian_shop_tickets_v1";
