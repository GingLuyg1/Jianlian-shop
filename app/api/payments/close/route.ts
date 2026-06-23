import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/admin/api-auth";
import { getSafeErrorMessage, isPaymentSchemaMissing } from "@/lib/payments/payment-errors";
import { closePaymentSession } from "@/lib/payments/session-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = await requireApiUser();
  if (!context.ok) return context.response;

  const body = (await request.json().catch(() => null)) as { sessionNo?: string } | null;
  const sessionNo = body?.sessionNo?.trim();
  if (!sessionNo) return NextResponse.json({ error: "缺少支付会话编号" }, { status: 400 });

  try {
    const result = await closePaymentSession(sessionNo, context.user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = getSafeErrorMessage(error, "支付会话关闭失败");
    return NextResponse.json(
      { error: isPaymentSchemaMissing(error) ? "支付会话数据表尚未初始化，请先执行 payment provider migration。" : message },
      { status: isPaymentSchemaMissing(error) ? 503 : 400 }
    );
  }
}
