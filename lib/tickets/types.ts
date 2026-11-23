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

export interface TicketAttachment {
  name: string;
  url: string;
  mimeType: string;
  size?: number;
}

export interface TicketMessage {
  id: string;
  sender: "user" | "support";
  senderName: string;
  content: string;
  images?: string[];
  attachments?: TicketAttachment[];
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
  attachments?: TicketAttachment[];
  createdAt: string;
  updatedAt: string;
  hasUnreadReply?: boolean;
  isFlagged?: boolean;
  messages: TicketMessage[];
}

export const STORAGE_KEY = "jianlian_shop_tickets_v1";
export const TICKET_RETENTION_DAYS = 7;
export const TICKET_RETENTION_MS = TICKET_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function isTicketWithinRetention(ticket: Partial<TicketItem> | null | undefined, nowMs = Date.now()): boolean {
  if (!ticket) return false;
  const rawTime = ticket.updatedAt || ticket.createdAt;
  if (!rawTime) return true;
  const normalized = String(rawTime).trim().replace(" ", "T");
  const parsedMs = new Date(normalized).getTime();
  if (!Number.isFinite(parsedMs)) return true;
  return nowMs - parsedMs <= TICKET_RETENTION_MS;
}

export function filterRetainedTickets<T extends Partial<TicketItem>>(tickets: T[], nowMs = Date.now()): T[] {
  return tickets.filter((ticket) => isTicketWithinRetention(ticket, nowMs));
}

export const INITIAL_ADMIN_DEMO_TICKETS: TicketItem[] = [
  {
    id: "GD-20261106-103033-3A25",
    title: "Jianlian Shop 普通 API 接入咨询：目录、扣款、幂等与交付",
    type: "api",
    priority: "normal",
    status: "completed",
    orderNo: "",
    email: "merchant@example.com",
    description:
      "您好，我们正在接入跨境资源网普通 API (Jianlian Shop)，请协助确认以下四项技术合同：\n1. 目录读取：GET /api/open/v1/catalog/mall?search=礼品卡 会在高峰期超时，服务端最大缓存限制多大？\n2. 扣款保护：POST /api/open/v1/orders/mall 屡次扣款的 expectedAmount 是否校验折扣、会入、服务费扣除后的最终 CNY 钱包总扣款？\n3. 幂等性保障：Idempotency-Key 的保质时长及过期后行为是什么？若超时或 500，未拿到订单 ID 时，能否直接复用同一 key 重试？\n4. 订单状态追踪：请提供 GET /api/open/v1/orders/[id] 的完整响应样例，包括 deliveryFormat 字段定义。感谢协助！",
    createdAt: "2026-11-06 10:30:33",
    updatedAt: "2026-11-06 17:24:20",
    hasUnreadReply: false,
    messages: [
      {
        id: "m-1",
        sender: "user",
        senderName: "merchant@example.com",
        content:
          "您好，我们正在接入跨境资源网普通 API (Jianlian Shop)，请协助确认以下四项技术合同：\n1. 目录读取：GET /api/open/v1/catalog/mall?search=礼品卡 会在 2026-11-05 23:27:43 至 23:27:56 (北京时间) 于客户端 12 秒超时边界未收到响应头。官方推荐如何小范围读取？\n2. 金额保护：POST /api/open/v1/orders/mall 校验规则与扣款上限。\n3. 幂等与重试规范：Idempotency-Key 有效期。\n4. 订单交付格式样例与多卡卡密格式。",
        createdAt: "2026-11-06 10:30:33",
      },
      {
        id: "m-2",
        sender: "support",
        senderName: "官方客服",
        content: "好的，已收到您的 API 对接咨询，技术团队正在逐项核验文档与参数规范，稍后给您详细回复。",
        createdAt: "2026-11-06 13:23:27",
      },
      {
        id: "m-3",
        sender: "support",
        senderName: "官方客服",
        content:
          "您好，技术团队已完成排查与技术方案确认：\n1. 目录读取：推荐使用 category 与 keyword 结合小分页查询，单次推荐 limit=20；\n2. 扣款安全：expectedAmount 属于严格强校验，服务端对比当前最新价格与优惠折扣后计算，若有价格变动会自动 fail-closed 并返回 PRICE_MISMATCH，绝对不会多扣余额；\n3. 幂等性：Idempotency-Key 有效期为 24 小时，网络超时请务必携带相同 key 重试；\n4. 交付结构：订单成功后 delivery 包含 items[]，每项含 cardCode 与 cardPin。已为您开启 API 沙箱调试权限，祝对接顺利！",
        createdAt: "2026-11-06 17:24:20",
      },
    ],
  },
  {
    id: "GD-20261122-140215-9F1C",
    title: "USDT 充值到账延迟咨询（交易哈希已确认）",
    type: "recharge",
    priority: "urgent",
    status: "processing",
    orderNo: "RCG-20261122-88129",
    email: "vip_buyer@outlook.com",
    description: "您好，我于下午通过 BEP20 转账 50 USDT，区块链浏览器显示已达 25 个确认数，但控制台余额尚未刷新，麻烦客服专员协助核查链上流水并入账，谢谢！",
    createdAt: "2026-11-22 14:02:15",
    updatedAt: "2026-11-22 14:02:15",
    hasUnreadReply: true,
    messages: [
      {
        id: "m-rcg-1",
        sender: "user",
        senderName: "vip_buyer@outlook.com",
        content: "您好，我于下午通过 BEP20 转账 50 USDT，区块链浏览器显示已达 25 个确认数，但控制台余额尚未刷新，麻烦客服专员协助核查链上流水并入账，谢谢！",
        createdAt: "2026-11-22 14:02:15",
      },
    ],
  },
];

export function getAdminTicketsFromStorage(): TicketItem[] {
  if (typeof window === "undefined") return INITIAL_ADMIN_DEMO_TICKETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const retained = filterRetainedTickets(parsed);
        if (retained.length !== parsed.length) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
        }
        return retained.map((t: any) => ({
          ...t,
          status: t.status === "completed" || t.status === "replied" ? "completed" : "processing",
        }));
      }
    }
  } catch {}
  return INITIAL_ADMIN_DEMO_TICKETS;
}

export function getAdminTicketCounts(): { processing: number; completed: number; total: number } {
  const tickets = getAdminTicketsFromStorage();
  const processing = tickets.filter((t) => t && t.status === "processing").length;
  const completed = tickets.filter((t) => t && t.status === "completed").length;
  return { processing, completed, total: tickets.length };
}
