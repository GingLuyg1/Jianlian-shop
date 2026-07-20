import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    orderId: string;
    itemId: string;
  };
};

type AuditAdmin = { id: string; email?: string | null };

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function sanitizeDeliverError(error: unknown) {
  const message = getOrderErrorMessage(error, "人工交付失败");
  if (/Could not find|schema cache|PGRST|42883|42P01/i.test(message)) {
    return "订单项交付功能尚未完成数据库初始化，请先执行混合交付 migration。";
  }
  if (message.includes("empty") || message.includes("空")) return "交付内容不能为空";
  if (message.includes("paid") || message.includes("未支付")) return "订单未支付，不能交付";
  if (message.includes("duplicate") || message.includes("重复")) return "该订单项已交付，当前不支持重复提交";
  if (message.includes("type") || message.includes("类型")) return "该订单项不是人工交付类型";
  if (message.includes("not found") || message.includes("不存在")) return "订单或订单项不存在";
  return message || "人工交付失败";
}

export async function POST(request: Request, context: RouteContext) {
  let auditAdmin: AuditAdmin | undefined;
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      await writeAdminAuditLog({
        request,
        action: "deliver_order_item",
        module: "delivery",
        targetType: "order_item",
        targetId: context.params.itemId,
        result: "denied",
        errorMessage: admin.message,
      });
      return json({ error: admin.message }, { status: admin.status });
    }
    auditAdmin = { id: admin.user.id, email: admin.user.email };

    const body = (await request.json().catch(() => null)) as { delivery_content?: string; delivery_note?: string | null } | null;
    const deliveryContent = body?.delivery_content?.trim() ?? "";
    const deliveryNote = body?.delivery_note?.trim() || null;
    if (!deliveryContent) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "deliver_order_item",
        module: "delivery",
        targetType: "order_item",
        targetId: context.params.itemId,
        result: "failed",
        errorCode: "empty_delivery_content",
        errorMessage: "交付内容不能为空",
        metadata: { order_id: context.params.orderId },
      });
      return json({ error: "交付内容不能为空" }, { status: 400 });
    }

    const serviceClient = getSupabaseServiceRoleClient();
    if (!serviceClient) {
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "deliver_order_item",
        module: "delivery",
        targetType: "order_item",
        targetId: context.params.itemId,
        result: "failed",
        errorCode: "service_role_unavailable",
        errorMessage: "服务端交付权限未配置",
        metadata: { order_id: context.params.orderId },
      });
      return json({ error: "服务端交付权限未配置" }, { status: 503 });
    }

    const { data, error } = await serviceClient.rpc("admin_deliver_order_item_manual", {
      p_order_id: context.params.orderId,
      p_order_item_id: context.params.itemId,
      p_delivery_content: deliveryContent,
      p_delivery_note: deliveryNote,
    });

    if (error) {
      const message = sanitizeDeliverError(error);
      await writeAdminAuditLog({
        request,
        admin: auditAdmin,
        action: "deliver_order_item",
        module: "delivery",
        targetType: "order_item",
        targetId: context.params.itemId,
        result: "failed",
        errorCode: typeof error.code === "string" ? error.code : null,
        errorMessage: message,
        metadata: { order_id: context.params.orderId, has_delivery_content: true },
      });
      return json({ error: message }, { status: 400 });
    }

    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "deliver_order_item",
      module: "delivery",
      targetType: "order_item",
      targetId: context.params.itemId,
      result: "success",
      metadata: {
        order_id: context.params.orderId,
        has_delivery_content: true,
        has_delivery_note: Boolean(deliveryNote),
      },
    });

    return json({ delivery: data });
  } catch (error) {
    const message = sanitizeDeliverError(error);
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "deliver_order_item",
      module: "delivery",
      targetType: "order_item",
      targetId: context.params.itemId,
      result: "failed",
      errorMessage: message,
    });
    return json({ error: message }, { status: 500 });
  }
}
