import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/admin/api-auth";
import { getSafeErrorMessage, isPaymentSchemaMissing } from "@/lib/payments/payment-errors";
import {
  closePaymentSession,
  PaymentSessionError,
} from "@/lib/payments/payment-session-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = await requireApiUser();
  if (!context.ok) return context.response;
  const body = (await request.json().catch(() => null)) as { sessionNo?: string } | null;
  const sessionNo = body?.sessionNo?.trim();
  if (!sessionNo) {
    return NextResponse.json({ code: "SESSION_NO_REQUIRED", error: "缺少支付会话编号" }, { status: 400 });
  }

  try {
    return NextResponse.json(await closePaymentSession(sessionNo, context.user.id));
  } catch (error) {
    const schemaMissing = isPaymentSchemaMissing(error);
    const code =
      error instanceof PaymentSessionError
        ? error.code
        : schemaMissing
          ? "PAYMENT_SCHEMA_NOT_READY"
          : "PAYMENT_SESSION_CLOSE_FAILED";
    const message = schemaMissing
      ? "支付会话数据表尚未初始化，请先执行 payment migration。"
      : getSafeErrorMessage(error, "支付会话关闭失败");
    return NextResponse.json({ code, error: message }, { status: schemaMissing ? 503 : 400 });
  }
}
