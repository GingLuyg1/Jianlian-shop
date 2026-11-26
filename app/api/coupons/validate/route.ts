import { NextResponse } from "next/server";

import { validateCouponForOrderAmount } from "@/lib/coupons/coupon-service";
import {
  checkRateLimit,
  getRequestSourceKey,
  getUserRateLimitKey,
  readBoundedJsonBody,
} from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "服务未配置" }, { status: 503 });
  }

  const sourceLimit = checkRateLimit("coupon_validate", getRequestSourceKey(request));
  if (!sourceLimit.allowed) return sourceLimit.response!;

  const supabase = getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (authData?.user) {
    const userLimit = checkRateLimit("coupon_validate", getUserRateLimitKey(authData.user.id, "coupon_validate"));
    if (!userLimit.allowed) return userLimit.response!;
  }

  const parsedBody = await readBoundedJsonBody<{ code?: unknown; orderAmount?: unknown; order_amount?: unknown }>(
    request,
    4096
  );
  if (!parsedBody.ok) return parsedBody.response;

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "优惠券服务暂不可用" }, { status: 503 });
  }

  const rawAmount = parsedBody.data.orderAmount ?? parsedBody.data.order_amount;
  const orderAmount = Number(rawAmount);
  const result = await validateCouponForOrderAmount(service, parsedBody.data.code, orderAmount);

  if (!result.ok) {
    return NextResponse.json({ valid: false, code: result.code, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    valid: true,
    coupon: result.coupon,
  });
}
