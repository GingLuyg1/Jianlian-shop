import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  TICKET_PRIORITIES,
  TICKET_TYPES,
  computeTicketCounts,
  filterRetainedTickets,
  formatTicketTimestamp,
  generateTicketId,
  isFakeDemoTicket,
  normalizeTicketStatus,
  type TicketAttachment,
  type TicketCounts,
  type TicketItem,
  type TicketMessage,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from "@/lib/tickets/types";

const TICKETS_SETTING_KEY = "support_tickets_store_v1";
const MAX_STORED_TICKETS = 500;
const MAX_IMAGES_PER_ENTRY = 6;
const MAX_ATTACHMENTS_PER_ENTRY = 6;
const MAX_DATA_URL_LENGTH = 7_500_000;

const VALID_TYPES = new Set<TicketType>(TICKET_TYPES.map((t) => t.value));
const VALID_PRIORITIES = new Set<TicketPriority>(TICKET_PRIORITIES.map((p) => p.value));

function parseTicketTimeMs(raw: string | undefined): number {
  if (!raw) return 0;
  const normalized = String(raw).trim().replace(" ", "T");
  const withTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}+08:00`;
  const ms = new Date(withTz).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function sanitizeImages(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= MAX_DATA_URL_LENGTH)
    .slice(0, MAX_IMAGES_PER_ENTRY);
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeAttachments(raw: unknown): TicketAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned: TicketAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 200) : "";
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    const mimeType = typeof rec.mimeType === "string" ? rec.mimeType.trim().slice(0, 120) : "application/octet-stream";
    const size = typeof rec.size === "number" && Number.isFinite(rec.size) ? Math.max(0, Math.floor(rec.size)) : undefined;
    if (!name || !url || url.length > MAX_DATA_URL_LENGTH) continue;
    cleaned.push({ name, url, mimeType, size });
    if (cleaned.length >= MAX_ATTACHMENTS_PER_ENTRY) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeTicketRecord(raw: unknown): TicketItem | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  if (!id) return null;

  const email = typeof rec.email === "string" ? rec.email.trim() : "";
  const title = typeof rec.title === "string" ? rec.title.trim() : "";
  const description = typeof rec.description === "string" ? rec.description : "";
  const type = VALID_TYPES.has(rec.type as TicketType) ? (rec.type as TicketType) : "other";
  const priority = VALID_PRIORITIES.has(rec.priority as TicketPriority) ? (rec.priority as TicketPriority) : "normal";
  const status = normalizeTicketStatus(rec.status);
  const createdAt = typeof rec.createdAt === "string" && rec.createdAt.trim() ? rec.createdAt.trim() : formatTicketTimestamp();
  const updatedAt = typeof rec.updatedAt === "string" && rec.updatedAt.trim() ? rec.updatedAt.trim() : createdAt;

  const messages: TicketMessage[] = Array.isArray(rec.messages)
    ? rec.messages
        .map((m): TicketMessage | null => {
          if (!m || typeof m !== "object") return null;
          const mr = m as Record<string, unknown>;
          const mid = typeof mr.id === "string" && mr.id.trim() ? mr.id.trim() : `msg-${Date.now()}`;
          const sender = mr.sender === "support" ? "support" : "user";
          const senderName = typeof mr.senderName === "string" && mr.senderName.trim()
            ? mr.senderName.trim()
            : sender === "support"
              ? "Jianlian 官方客服"
              : "我";
          const content = typeof mr.content === "string" ? mr.content : "";
          const mCreatedAt = typeof mr.createdAt === "string" && mr.createdAt.trim() ? mr.createdAt.trim() : createdAt;
          return {
            id: mid,
            sender,
            senderName,
            content,
            images: sanitizeImages(mr.images),
            attachments: sanitizeAttachments(mr.attachments),
            createdAt: mCreatedAt,
          };
        })
        .filter((m): m is TicketMessage => Boolean(m))
    : [];

  const normalized: TicketItem = {
    id,
    userId: typeof rec.userId === "string" && rec.userId.trim() ? rec.userId.trim() : undefined,
    title: title || "售后咨询工单",
    type,
    priority,
    status,
    orderNo: typeof rec.orderNo === "string" && rec.orderNo.trim() ? rec.orderNo.trim() : undefined,
    email: email || "未登记邮箱",
    description,
    images: sanitizeImages(rec.images),
    attachments: sanitizeAttachments(rec.attachments),
    createdAt,
    updatedAt,
    hasUnreadReply: Boolean(rec.hasUnreadReply),
    isFlagged: Boolean(rec.isFlagged),
    messages,
  };

  if (isFakeDemoTicket(normalized)) return null;
  return normalized;
}

function sortTicketsNewestFirst(tickets: TicketItem[]): TicketItem[] {
  return [...tickets].sort((a, b) => parseTicketTimeMs(b.updatedAt || b.createdAt) - parseTicketTimeMs(a.updatedAt || a.createdAt));
}

function getServiceClientOrThrow() {
  const client = getSupabaseServiceRoleClient();
  if (!client) {
    throw new Error("TICKET_SERVICE_ROLE_UNAVAILABLE");
  }
  return client;
}

export async function readAllServerTickets(): Promise<TicketItem[]> {
  const service = getServiceClientOrThrow();
  const { data, error } = await service
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", TICKETS_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`READ_TICKETS_FAILED: ${error.message}`);
  }

  const rawValue = data?.setting_value;
  const rawList = Array.isArray(rawValue) ? rawValue : [];
  const normalized = rawList
    .map((item) => normalizeTicketRecord(item))
    .filter((item): item is TicketItem => Boolean(item));

  const retained = filterRetainedTickets(normalized);
  return sortTicketsNewestFirst(retained);
}

async function writeAllServerTickets(tickets: TicketItem[], updatedBy?: string | null): Promise<TicketItem[]> {
  const service = getServiceClientOrThrow();
  const clean = sortTicketsNewestFirst(
    filterRetainedTickets(tickets).filter((t) => !isFakeDemoTicket(t))
  ).slice(0, MAX_STORED_TICKETS);

  const row: Record<string, unknown> = {
    setting_key: TICKETS_SETTING_KEY,
    setting_value: clean,
    setting_type: "json",
    setting_group: "order",
    is_public: false,
    description: "Server-synced support tickets store (7-day retention)",
  };
  if (updatedBy) {
    row.updated_by = updatedBy;
  }

  const { error } = await service
    .from("site_settings")
    .upsert(row, { onConflict: "setting_key" });

  if (error) {
    throw new Error(`WRITE_TICKETS_FAILED: ${error.message}`);
  }

  return clean;
}

function isTicketOwnedByUser(ticket: TicketItem, user: { id: string; email?: string | null }): boolean {
  if (ticket.userId) {
    return ticket.userId === user.id;
  }
  const userEmail = (user.email ?? "").trim().toLowerCase();
  const ticketEmail = (ticket.email ?? "").trim().toLowerCase();
  return Boolean(userEmail && ticketEmail && userEmail === ticketEmail);
}

export async function listUserServerTickets(user: { id: string; email?: string | null }): Promise<{
  tickets: TicketItem[];
  counts: TicketCounts;
}> {
  const all = await readAllServerTickets();
  const owned = all.filter((t) => isTicketOwnedByUser(t, user));
  return {
    tickets: owned,
    counts: computeTicketCounts(owned),
  };
}

export async function listAdminServerTickets(): Promise<{
  tickets: TicketItem[];
  counts: TicketCounts;
}> {
  const all = await readAllServerTickets();
  return {
    tickets: all,
    counts: computeTicketCounts(all),
  };
}

export async function createUserServerTicket(
  user: { id: string; email?: string | null },
  input: {
    type?: unknown;
    priority?: unknown;
    orderNo?: unknown;
    email?: unknown;
    title?: unknown;
    description?: unknown;
    images?: unknown;
  }
): Promise<{ ticket: TicketItem; tickets: TicketItem[]; counts: TicketCounts }> {
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 6) {
    throw new Error("请详细描述遇到的问题（至少6个字）");
  }
  if (description.length > 5000) {
    throw new Error("问题描述不能超过 5000 字");
  }

  const type = VALID_TYPES.has(input.type as TicketType) ? (input.type as TicketType) : "order";
  const priority = VALID_PRIORITIES.has(input.priority as TicketPriority) ? (input.priority as TicketPriority) : "normal";
  const orderNo = typeof input.orderNo === "string" ? input.orderNo.trim().slice(0, 80) : "";
  const rawEmail = typeof input.email === "string" ? input.email.trim().slice(0, 120) : "";
  const email = rawEmail || (user.email ?? "").trim() || "未登记邮箱";

  const firstLine = description.split(/\r?\n/)[0]?.trim() || description;
  const rawTitle = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const title = rawTitle || (firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine);
  const images = sanitizeImages(input.images);

  const now = formatTicketTimestamp();
  const id = generateTicketId();
  const typeLabel = TICKET_TYPES.find((t) => t.value === type)?.label ?? "售后问题";

  const newTicket: TicketItem = {
    id,
    userId: user.id,
    title,
    type,
    priority,
    status: "processing",
    orderNo: orderNo || undefined,
    email,
    description,
    images,
    createdAt: now,
    updatedAt: now,
    hasUnreadReply: false,
    isFlagged: false,
    messages: [
      {
        id: `msg-${Date.now()}`,
        sender: "user",
        senderName: email || "我",
        content: description,
        images,
        createdAt: now,
      },
      {
        id: `msg-ack-${Date.now() + 1}`,
        sender: "support",
        senderName: "Jianlian 官方客服",
        content: `您好！系统已接收到您的工单【${id}】。客服专员已接入排查（类型：${typeLabel}），我们将在 12 小时内通过此工单及邮箱与您同步进展。`,
        createdAt: now,
      },
    ],
  };

  const existing = await readAllServerTickets();
  const savedAll = await writeAllServerTickets([newTicket, ...existing]);
  const owned = savedAll.filter((t) => isTicketOwnedByUser(t, user));
  return {
    ticket: newTicket,
    tickets: owned,
    counts: computeTicketCounts(owned),
  };
}

export async function appendUserServerTicketReply(
  user: { id: string; email?: string | null },
  input: {
    ticketId?: unknown;
    content?: unknown;
    images?: unknown;
  }
): Promise<{ ticket: TicketItem; tickets: TicketItem[]; counts: TicketCounts }> {
  const ticketId = typeof input.ticketId === "string" ? input.ticketId.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim().slice(0, 5000) : "";
  const images = sanitizeImages(input.images);

  if (!ticketId) throw new Error("缺少工单编号");
  if (!content && !images?.length) throw new Error("请输入回复内容或添加截图");

  const existing = await readAllServerTickets();
  const target = existing.find((t) => t.id === ticketId);
  if (!target || !isTicketOwnedByUser(target, user)) {
    throw new Error("未找到对应工单或无权操作");
  }

  const now = formatTicketTimestamp();
  const newMsg: TicketMessage = {
    id: `msg-${Date.now()}`,
    sender: "user",
    senderName: target.email || user.email || "我",
    content: content || "（补充附件截图）",
    images,
    createdAt: now,
  };

  const updatedTicket: TicketItem = {
    ...target,
    userId: target.userId || user.id,
    status: "processing",
    updatedAt: now,
    messages: [...target.messages, newMsg],
  };

  const nextAll = existing.map((t) => (t.id === ticketId ? updatedTicket : t));
  const savedAll = await writeAllServerTickets(nextAll);
  const owned = savedAll.filter((t) => isTicketOwnedByUser(t, user));
  return {
    ticket: updatedTicket,
    tickets: owned,
    counts: computeTicketCounts(owned),
  };
}

export async function markUserServerTicketRead(
  user: { id: string; email?: string | null },
  ticketId: string
): Promise<{ tickets: TicketItem[]; counts: TicketCounts }> {
  const cleanId = ticketId.trim();
  const existing = await readAllServerTickets();
  const target = existing.find((t) => t.id === cleanId);
  if (!target || !isTicketOwnedByUser(target, user) || !target.hasUnreadReply) {
    const owned = existing.filter((t) => isTicketOwnedByUser(t, user));
    return { tickets: owned, counts: computeTicketCounts(owned) };
  }

  const nextAll = existing.map((t) =>
    t.id === cleanId ? { ...t, hasUnreadReply: false } : t
  );
  const savedAll = await writeAllServerTickets(nextAll);
  const owned = savedAll.filter((t) => isTicketOwnedByUser(t, user));
  return { tickets: owned, counts: computeTicketCounts(owned) };
}

export async function adminReplyServerTicket(
  adminUserId: string,
  input: {
    ticketId?: unknown;
    content?: unknown;
    images?: unknown;
    attachments?: unknown;
  }
): Promise<{ ticket: TicketItem; tickets: TicketItem[]; counts: TicketCounts }> {
  const ticketId = typeof input.ticketId === "string" ? input.ticketId.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim().slice(0, 8000) : "";
  const images = sanitizeImages(input.images);
  const attachments = sanitizeAttachments(input.attachments);

  if (!ticketId) throw new Error("缺少工单编号");
  if (!content && !images?.length && !attachments?.length) {
    throw new Error("请输入官方答复内容或添加图片/文件附件");
  }

  const existing = await readAllServerTickets();
  const target = existing.find((t) => t.id === ticketId);
  if (!target) {
    throw new Error("未找到对应工单");
  }

  const now = formatTicketTimestamp();
  const newMsg: TicketMessage = {
    id: `admin-reply-${Date.now()}`,
    sender: "support",
    senderName: "Jianlian 官方客服",
    content: content || (images?.length ? "（已发送图片附件）" : "（已发送文件附件）"),
    images,
    attachments,
    createdAt: now,
  };

  const updatedTicket: TicketItem = {
    ...target,
    status: "completed",
    updatedAt: now,
    hasUnreadReply: true,
    messages: [...target.messages, newMsg],
  };

  const nextAll = existing.map((t) => (t.id === ticketId ? updatedTicket : t));
  const savedAll = await writeAllServerTickets(nextAll, adminUserId);
  return {
    ticket: updatedTicket,
    tickets: savedAll,
    counts: computeTicketCounts(savedAll),
  };
}

export async function adminUpdateServerTicket(
  adminUserId: string,
  input: {
    ticketId?: unknown;
    isFlagged?: unknown;
    status?: unknown;
  }
): Promise<{ ticket: TicketItem; tickets: TicketItem[]; counts: TicketCounts }> {
  const ticketId = typeof input.ticketId === "string" ? input.ticketId.trim() : "";
  if (!ticketId) throw new Error("缺少工单编号");

  const existing = await readAllServerTickets();
  const target = existing.find((t) => t.id === ticketId);
  if (!target) {
    throw new Error("未找到对应工单");
  }

  const updatedTicket: TicketItem = {
    ...target,
    ...(typeof input.isFlagged === "boolean" ? { isFlagged: input.isFlagged } : {}),
    ...(input.status === "processing" || input.status === "completed" ? { status: input.status } : {}),
    updatedAt: formatTicketTimestamp(),
  };

  const nextAll = existing.map((t) => (t.id === ticketId ? updatedTicket : t));
  const savedAll = await writeAllServerTickets(nextAll, adminUserId);
  return {
    ticket: updatedTicket,
    tickets: savedAll,
    counts: computeTicketCounts(savedAll),
  };
}
