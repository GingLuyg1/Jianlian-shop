import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getPaymentErrorMessage } from "@/lib/payments/payment-status";
import { normalizePaymentRecord } from "@/lib/payments/payment-queries";

function isSchemaMissing(message: string) {
  return /order_payments|admin_review_order_payment|schema cache|PGRST205|42P01/i.test(message);
}

export async function PATCH(
  request: Request,
  { params }: { params: { paymentId: string } }
) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: string; adminNote?: string }
    | null;
  const action = body?.action;

  if (!action || !["start_review", "approve", "reject", "cancel"].includes(action)) {
    return NextResponse.json({ error: "未知审核操作" }, { status: 400 });
  }

  if (action === "reject" && !body?.adminNote?.trim()) {
    return NextResponse.json({ error: "驳回支付记录必须填写原因" }, { status: 400 });
  }

  try {
    const { data, error } = await admin.supabase.rpc("admin_review_order_payment", {
      p_payment_id: params.paymentId,
      p_action: action,
      p_admin_note: body?.adminNote?.trim() || null,
    });

    if (error) throw error;

    return NextResponse.json({ payment: normalizePaymentRecord(data as Record<string, unknown>) });
  } catch (error) {
    const message = getPaymentErrorMessage(error, "支付审核操作失败");
    return NextResponse.json(
      { error: isSchemaMissing(message) ? "支付记录表尚未初始化，请先执行 order_payments migration。" : message },
      { status: isSchemaMissing(message) ? 503 : 400 }
    );
  }
}
