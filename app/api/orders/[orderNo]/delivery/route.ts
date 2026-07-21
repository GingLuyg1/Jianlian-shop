import { NextResponse } from "next/server";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    orderNo: string;
  };
};

type DeliveryRow = {
  order_no: string;
  order_status: string;
  payment_status: string;
  product_name: string | null;
  delivery_id: string | null;
  delivery_status: string | null;
  delivery_type: string | null;
  delivered_at: string | null;
  viewed_at: string | null;
  masked_content: string | null;
  content: string | null;
  delivery_note: string | null;
};

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function getDeliveryErrorCode(error: unknown) {
  return typeof (error as { code?: unknown } | null)?.code === "string"
    ? String((error as { code: string }).code)
    : "UNKNOWN";
}

function classifyDeliveryError(error: unknown) {
  const message = getOrderErrorMessage(error, "交付内容读取失败");
  const normalized = message.toLowerCase();
  if (normalized.includes("please sign in")) {
    return { status: 401, message: "请先登录" };
  }
  if (normalized.includes("not paid") || message.includes("未支付")) {
    return { status: 403, message: "订单未支付，不能查看交付内容" };
  }
  if (normalized.includes("does not allow delivery access")) {
    return { status: 403, message: "当前订单状态不允许查看交付内容" };
  }
  if (
    normalized.includes("access denied") ||
    normalized.includes("not found") ||
    message.includes("无权") ||
    message.includes("不存在")
  ) {
    return { status: 404, message: "订单不存在或无权查看" };
  }
  return { status: 500, message: "交付信息加载失败，请稍后重试" };
}

function logDeliveryDatabaseError(requestId: string, error: unknown) {
  console.error("[Orders] delivery RPC failed", {
    requestId,
    code: getDeliveryErrorCode(error),
    message: getOrderErrorMessage(error, "Unknown delivery database error"),
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    if (!hasSupabaseServerConfig()) {
      return json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "请先登录" }, { status: 401 });
    }

    try {
      await assertUserBusinessAllowed(supabase, user.id, "view_delivery");
    } catch (guardError) {
      if (isAccountRestrictionError(guardError)) {
        return json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
      }
      throw guardError;
    }

    const { data, error } = await supabase.rpc("get_order_delivery_for_user", {
      p_order_no: context.params.orderNo,
    });

    if (error) {
      logDeliveryDatabaseError(requestId, error);
      const classified = classifyDeliveryError(error);
      return json({ error: classified.message, request_id: requestId }, { status: classified.status });
    }

    const rows = (data ?? []) as DeliveryRow[];
    if (rows.length === 0) {
      return json({ status: "pending", deliveries: [], message: "正在处理" });
    }

    return json({
      status: rows.some((row) => row.delivery_status === "delivered") ? "delivered" : "pending",
      deliveries: rows.map((row, index) => ({
        id: row.delivery_id ?? `${context.params.orderNo}:${index}`,
        product_name: row.product_name ?? "—",
        delivery_status: row.delivery_status ?? "pending",
        delivery_type: row.delivery_type ?? "—",
        delivered_at: row.delivered_at,
        viewed_at: row.viewed_at,
        masked_content: row.masked_content ?? "—",
        content: row.content ?? null,
        delivery_note: row.delivery_note ?? null,
      })),
    });
  } catch (error) {
    logDeliveryDatabaseError(requestId, error);
    return json({ error: "交付信息加载失败，请稍后重试", request_id: requestId }, { status: 500 });
  }
}

