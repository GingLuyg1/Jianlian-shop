import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/admin/api-auth";
import { getSafeErrorMessage, isPaymentSchemaMissing } from "@/lib/payments/payment-errors";
import { getPaymentSessionStatus } from "@/lib/payments/session-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { sessionNo: string } }) {
  const userContext = await requireApiUser();
  if (!userContext.ok) return userContext.response;

  const sessionNo = context.params.sessionNo?.trim();
  if (!sessionNo) return NextResponse.json({ error: "缺少支付会话编号" }, { status: 400 });

  try {
    const { data: profile } = await userContext.supabase
      .from("profiles")
      .select("role")
      .eq("id", userContext.user.id)
      .maybeSingle();
    const status = await getPaymentSessionStatus(sessionNo, userContext.user.id, profile?.role === "admin");
    return NextResponse.json(status);
  } catch (error) {
    const message = getSafeErrorMessage(error, "支付状态查询失败");
    return NextResponse.json(
      { error: isPaymentSchemaMissing(error) ? "支付会话数据表尚未初始化，请先执行 payment provider migration。" : message },
      { status: isPaymentSchemaMissing(error) ? 503 : 400 }
    );
  }
}
