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
  userId?: string;
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

export interface TicketCounts {
  processing: number;
  completed: number;
  flagged: number;
  unread: number;
  total: number;
}

export const STORAGE_KEY = "jianlian_shop_tickets_v1";
export const TICKET_RETENTION_DAYS = 7;
export const TICKET_RETENTION_MS = TICKET_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const FAKE_DEMO_TICKET_IDS = new Set([
  "GD-20261106-103033-3A25",
  "GD-20261122-140215-9F1C",
]);

export const FAKE_DEMO_EMAILS = new Set([
  "merchant@example.com",
  "vip_buyer@outlook.com",
]);

export function isFakeDemoTicket(ticket: Partial<TicketItem> | null | undefined): boolean {
  if (!ticket) return true;
  if (ticket.id && FAKE_DEMO_TICKET_IDS.has(String(ticket.id).trim())) return true;
  if (ticket.email && FAKE_DEMO_EMAILS.has(String(ticket.email).trim().toLowerCase())) return true;
  return false;
}

export function normalizeTicketStatus(raw: unknown): TicketStatus {
  return raw === "completed" || raw === "replied" ? "completed" : "processing";
}

export function formatTicketTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
}

export function generateTicketId(date = new Date()): string {
  const ts = formatTicketTimestamp(date);
  const dateStr = ts.slice(0, 10).replace(/-/g, "");
  const timeStr = ts.slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, "X");
  return `GD-${dateStr}-${timeStr}-${rand}`;
}

export function isTicketWithinRetention(ticket: Partial<TicketItem> | null | undefined, nowMs = Date.now()): boolean {
  if (!ticket || isFakeDemoTicket(ticket)) return false;
  const rawTime = ticket.updatedAt || ticket.createdAt;
  if (!rawTime) return true;
  const normalized = String(rawTime).trim().replace(" ", "T");
  const withTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}+08:00`;
  const parsedMs = new Date(withTz).getTime();
  if (!Number.isFinite(parsedMs)) return true;
  return nowMs - parsedMs <= TICKET_RETENTION_MS;
}

export function filterRetainedTickets<T extends Partial<TicketItem>>(tickets: T[], nowMs = Date.now()): T[] {
  return tickets.filter((ticket) => isTicketWithinRetention(ticket, nowMs));
}

export function computeTicketCounts(tickets: TicketItem[]): TicketCounts {
  let processing = 0;
  let completed = 0;
  let flagged = 0;
  let unread = 0;
  for (const t of tickets) {
    if (!t) continue;
    if (t.status === "completed") completed += 1;
    else processing += 1;
    if (t.isFlagged) flagged += 1;
    if (t.hasUnreadReply) unread += 1;
  }
  return {
    processing,
    completed,
    flagged,
    unread,
    total: tickets.length,
  };
}

// 禁止在生产或任意设备注入任何写死的演示/测试假工单
export const INITIAL_ADMIN_DEMO_TICKETS: TicketItem[] = [];

export function clearLegacyLocalTickets(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function getAdminTicketsFromStorage(): TicketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const retained = filterRetainedTickets(parsed).filter((t) => !isFakeDemoTicket(t));
        if (retained.length !== parsed.length) {
          if (retained.length === 0) window.localStorage.removeItem(STORAGE_KEY);
          else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
        }
        return retained.map((t: any) => ({
          ...t,
          status: normalizeTicketStatus(t.status),
        }));
      }
    }
  } catch {}
  return [];
}

export function getAdminTicketCounts(): { processing: number; completed: number; total: number } {
  const counts = computeTicketCounts(getAdminTicketsFromStorage());
  return {
    processing: counts.processing,
    completed: counts.completed,
    total: counts.total,
  };
}
