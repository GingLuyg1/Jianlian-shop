import { NextResponse } from "next/server";

import { checkRateLimit, readBoundedJsonBody, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import {
  appendUserServerTicketReply,
  createUserServerTicket,
  listUserServerTickets,
  markUserServerTicketRead,
} from "@/lib/tickets/server";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, status: 500, error: "Supabase 环境变量未配置" };
  }
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false as const, status: 401, error: "请先登录账号后再查看或提交工单" };
  }
  return { ok: true as const, user };
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, tickets: [], counts: { processing: 0, completed: 0, flagged: 0, unread: 0, total: 0 } },
      { status: auth.status }
    );
  }

  try {
    const result = await listUserServerTickets({
      id: auth.user.id,
      email: auth.user.email,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取工单失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rateLimit = checkRateLimit("ticket_write", getUserRateLimitKey(auth.user.id, "ticket_write"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const parsed = await readBoundedJsonBody<Record<string, unknown> | null>(request, 2 * 1024 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "create";
  const userInfo = { id: auth.user.id, email: auth.user.email };

  try {
    if (action === "reply") {
      const result = await appendUserServerTicketReply(userInfo, {
        ticketId: body.ticketId,
        content: body.content,
        images: body.images,
      });
      return NextResponse.json(result);
    }

    if (action === "mark_read") {
      const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
      const result = await markUserServerTicketRead(userInfo, ticketId);
      return NextResponse.json(result);
    }

    const result = await createUserServerTicket(userInfo, {
      type: body.type,
      priority: body.priority,
      orderNo: body.orderNo,
      email: body.email,
      title: body.title,
      description: body.description,
      images: body.images,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "提交失败，请稍后重试";
    const status = message.startsWith("READ_") || message.startsWith("WRITE_") || message.startsWith("TICKET_SERVICE_")
      ? 500
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
