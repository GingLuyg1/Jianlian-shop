import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { loadAdminOrderRelations } from "@/lib/admin/order-relations";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { orderId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const orderId = context.params.orderId;
  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "服务端数据库权限未配置，无法读取订单关联业务。" }, { status: 503 });
  }

  try {
    const payload = await loadAdminOrderRelations(serviceClient, orderId);
    if (!payload) {
      return NextResponse.json({ error: "订单不存在或已被删除。" }, { status: 404 });
    }

    await writeAdminAuditLog({
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      module: "orders",
      action: "view_order_relations",
      targetType: "order",
      targetId: orderId,
      result: "success",
      metadata: { reason: "查看订单关联业务与时间线" },
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    await writeAdminAuditLog({
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      module: "orders",
      action: "view_order_relations",
      targetType: "order",
      targetId: orderId,
      result: "failed",
      errorMessage: "订单关联业务读取失败",
    });
    return NextResponse.json({ error: "订单关联业务读取失败，请稍后重试。" }, { status: 500 });
  }
}

