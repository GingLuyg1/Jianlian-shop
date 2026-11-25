import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { enforceAdminWriteGuard } from "@/lib/security/rate-limit";
import {
  adminReplyServerTicket,
  adminUpdateServerTicket,
  getAdminTicketCountsFast,
  listAdminServerTickets,
} from "@/lib/tickets/server";

export const dynamic = "force-dynamic";

function toSafeTicketError(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : "";
  if (!raw || /^(?:READ_|WRITE_|TICKET_SERVICE_)/i.test(raw) || /postgres|supabase|PGRST|syntax|relation/i.test(raw)) {
    return fallback;
  }
  return raw;
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  try {
    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      const counts = await getAdminTicketCountsFast();
      return NextResponse.json({ counts }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await listAdminServerTickets();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: toSafeTicketError(err, "读取工单列表失败") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const guardError = enforceAdminWriteGuard(request, admin.user.id, "ticket_reply", 16 * 1024 * 1024);
  if (guardError) return guardError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  try {
    const result = await adminReplyServerTicket(admin.user.id, {
      ticketId: body.ticketId,
      content: body.content,
      images: body.images,
      attachments: body.attachments,
    });
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "reply_support_ticket",
      module: "users",
      targetType: "support_ticket",
      targetId: String(body.ticketId ?? ""),
      result: "success",
      afterSummary: { status: result.ticket.status },
    });
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const status = raw.startsWith("READ_") || raw.startsWith("WRITE_") || raw.startsWith("TICKET_SERVICE_")
      ? 500
      : 400;
    const message = toSafeTicketError(err, "发送回复失败");
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "reply_support_ticket",
      module: "users",
      targetType: "support_ticket",
      targetId: String(body.ticketId ?? ""),
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const guardError = enforceAdminWriteGuard(request, admin.user.id, "ticket_update", 32 * 1024);
  if (guardError) return guardError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  try {
    const result = await adminUpdateServerTicket(admin.user.id, {
      ticketId: body.ticketId,
      isFlagged: body.isFlagged,
      status: body.status,
    });
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "update_support_ticket",
      module: "users",
      targetType: "support_ticket",
      targetId: String(body.ticketId ?? ""),
      result: "success",
      afterSummary: {
        status: result.ticket.status,
        isFlagged: result.ticket.isFlagged,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const status = raw.startsWith("READ_") || raw.startsWith("WRITE_") || raw.startsWith("TICKET_SERVICE_")
      ? 500
      : 400;
    const message = toSafeTicketError(err, "更新工单状态失败");
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "update_support_ticket",
      module: "users",
      targetType: "support_ticket",
      targetId: String(body.ticketId ?? ""),
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status });
  }
}
