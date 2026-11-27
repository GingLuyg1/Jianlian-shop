import { NextResponse } from "next/server";

import { PROMOTION_MIN_TRANSFER_AMOUNT } from "@/lib/promotion";
import { checkRateLimit, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getPromotionSettings } from "@/lib/settings/server";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function mapTransferError(rawMessage: string): { message: string; status: number } {
  const msg = rawMessage || "";
  if (msg.includes("PROMOTION_LOGIN_REQUIRED")) return { message: "请先登录后再操作。", status: 401 };
  if (msg.includes("PROMOTION_NO_AVAILABLE_COMMISSION")) return { message: "当前暂无可转入余额的推广佣金。", status: 400 };
  if (msg.includes("PROMOTION_BELOW_MIN_TRANSFER")) {
    return { message: `可用佣金尚未达到最低转入门槛（¥${PROMOTION_MIN_TRANSFER_AMOUNT.toFixed(2)}）。`, status: 400 };
  }
  if (msg.includes("transfer_promotion_commission_to_balance") || msg.includes("could not find the function")) {
    return { message: "推广返佣转入余额功能尚未完成数据库初始化，请联系管理员执行迁移。", status: 503 };
  }
  return { message: "转入余额失败，请稍后重试。", status: 500 };
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "服务配置未就绪" }, { status: 500 });
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const limit = checkRateLimit("order_create", getUserRateLimitKey(user.id, "promotion_transfer"));
  if (!limit.allowed) return limit.response!;

  const body = (await request.json().catch(() => null)) as { requestId?: string } | null;
  const requestId =
    typeof body?.requestId === "string" && body.requestId.trim().length > 0
      ? body.requestId.trim().slice(0, 80)
      : crypto.randomUUID();

  const settings = await getPromotionSettings(supabase).catch(() => ({
    enabled: true,
    commissionRate: 0.03,
    minWithdrawAmount: PROMOTION_MIN_TRANSFER_AMOUNT,
  }));
  const minAmount = Math.max(
    1,
    Number.isFinite(settings.minWithdrawAmount) && settings.minWithdrawAmount > 0
      ? Math.min(settings.minWithdrawAmount, PROMOTION_MIN_TRANSFER_AMOUNT)
      : PROMOTION_MIN_TRANSFER_AMOUNT
  );

  const { data, error } = await supabase.rpc("transfer_promotion_commission_to_balance", {
    p_request_id: requestId,
    p_min_amount: minAmount,
  });

  if (error) {
    const mapped = mapTransferError(error.message ?? "");
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json({ ok: true, result: data });
}
