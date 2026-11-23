import type { TicketItem, TicketStatus } from "@/lib/tickets/types";

/**
 * 工单扩展字段：后台「标记」状态。
 * 存储结构保持与 lib/tickets/types 兼容（status 仍为 processing / completed），
 * 额外的 flagged 字段为可选，旧数据缺省即视为未标记。
 */
export type StoredTicket = TicketItem & { flagged?: boolean };

/** 后台视角的三态：待处理 / 已处理 / 已标记 */
export type AdminTicketState = "pending" | "processed" | "flagged";

export function normalizeStoredStatus(raw: unknown): TicketStatus {
  return raw === "completed" || raw === "replied" ? "completed" : "processing";
}

export function normalizeStoredTicket(raw: any): StoredTicket {
  return {
    ...raw,
    status: normalizeStoredStatus(raw?.status),
    flagged: Boolean(raw?.flagged),
  };
}

export function getAdminTicketState(ticket: StoredTicket): AdminTicketState {
  if (ticket.flagged) return "flagged";
  return ticket.status === "completed" ? "processed" : "pending";
}

export const ADMIN_TICKET_STATE_META: Record<
  AdminTicketState,
  { label: string; badgeClass: string; countClass: string; dotClass: string }
> = {
  pending: {
    label: "待处理",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
    countClass: "bg-red-500 text-white",
    dotClass: "bg-red-500",
  },
  processed: {
    label: "已处理",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    countClass: "bg-emerald-500 text-white",
    dotClass: "bg-emerald-500",
  },
  flagged: {
    label: "已标记",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-300",
    countClass: "bg-amber-400 text-white",
    dotClass: "bg-amber-400",
  },
};

/** 前台用户视角：已标记的工单一律显示为「处理中」 */
export function getCustomerTicketStatus(ticket: StoredTicket): TicketStatus {
  if (ticket.flagged) return "processing";
  return ticket.status === "completed" ? "completed" : "processing";
}
