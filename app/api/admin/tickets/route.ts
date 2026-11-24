import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  adminReplyServerTicket,
  adminUpdateServerTicket,
  listAdminServerTickets,
} from "@/lib/tickets/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  try {
    const result = await listAdminServerTickets();
    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      return NextResponse.json({ counts: result.counts });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取工单列表失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

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
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "发送回复失败";
    const status = message.startsWith("READ_") || message.startsWith("WRITE_") || message.startsWith("TICKET_SERVICE_")
      ? 500
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

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
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新工单状态失败";
    const status = message.startsWith("READ_") || message.startsWith("WRITE_") || message.startsWith("TICKET_SERVICE_")
      ? 500
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
