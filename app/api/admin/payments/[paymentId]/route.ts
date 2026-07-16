import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  adminOrderPaymentSelect,
  adminRechargeSelect,
  isPaymentSchemaMissing,
  normalizeOrderPaymentRow,
  normalizeRechargeRow,
  sanitizePaymentError,
} from "@/lib/payments/admin-payment-queries";
import {
  approveLateBep20PaymentSession,
  getAdminBep20ChainPaymentDetail,
  getBep20ErrorMessage,
  rejectLateBep20PaymentSession,
  recheckAdminBep20ChainPaymentSession,
} from "@/lib/payments/bep20-chain-service";
import type { AdminPaymentCallback } from "@/lib/payments/admin-payment-types";
import type { AdminBep20OverpaymentWallet } from "@/lib/payments/admin-payment-types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    paymentId: string;
  };
};

function normalizeCallback(row: Record<string, unknown>): AdminPaymentCallback {
  return {
    id: String(row.id ?? ""),
    channel: typeof row.channel === "string" ? row.channel : null,
    payment_no: typeof row.payment_no === "string" ? row.payment_no : null,
    provider_trade_no: typeof row.provider_trade_no === "string" ? row.provider_trade_no : null,
    signature_result: typeof row.signature_result === "string" ? row.signature_result : null,
    process_result: typeof row.process_result === "string" ? row.process_result : null,
    http_status: row.http_status === null || row.http_status === undefined ? null : Number(row.http_status),
    is_duplicate: Boolean(row.is_duplicate),
    received_at: String(row.received_at ?? ""),
    payload_summary:
      row.payload_summary && typeof row.payload_summary === "object"
        ? (row.payload_summary as Record<string, unknown>)
        : null,
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "view_payment_detail",
      module: "payments",
      targetType: "payment_record",
      targetId: params.paymentId,
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const source = new URL(request.url).searchParams.get("source") ?? "order_payments";
  const auditModule = source === "account_recharges" ? "recharges" : "payments";

  try {
    const paymentResult =
      source === "account_recharges"
        ? await admin.supabase
            .from("account_recharges")
            .select(adminRechargeSelect)
            .eq("id", params.paymentId)
            .maybeSingle()
        : await admin.supabase
            .from("order_payments")
            .select(adminOrderPaymentSelect)
            .eq("id", params.paymentId)
            .maybeSingle();

    if (paymentResult.error) throw paymentResult.error;

    if (!paymentResult.data) {
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: "view_payment_detail",
        module: auditModule,
        targetType: "payment_record",
        targetId: params.paymentId,
        result: "failed",
        errorCode: "payment_not_found",
        errorMessage: "支付记录不存在",
        metadata: { source },
      });
      return NextResponse.json({ error: "支付记录不存在" }, { status: 404 });
    }

    const rawPaymentRow = paymentResult.data as Record<string, unknown>;
    const payment =
      source === "account_recharges"
        ? normalizeRechargeRow(rawPaymentRow)
        : normalizeOrderPaymentRow(rawPaymentRow);

    let callbacks: AdminPaymentCallback[] = [];
    let callbackError = "";
    const callbackResult = await admin.supabase
      .from("payment_callback_logs")
      .select(
        "id,channel,payment_no,provider_trade_no,signature_result,process_result,http_status,is_duplicate,received_at,payload_summary",
      )
      .eq("payment_no", payment.payment_no)
      .order("received_at", { ascending: false })
      .limit(50);

    if (callbackResult.error) {
      callbackError = isPaymentSchemaMissing(callbackResult.error)
        ? "回调记录表尚未初始化。"
        : "回调记录读取失败。";
    } else {
      callbacks = ((callbackResult.data ?? []) as Record<string, unknown>[]).map(normalizeCallback);
    }

    let chainPayment = null;
    let chainPaymentError = "";
    if (source !== "account_recharges" && payment.channel === "usdt_bep20") {
      try {
        chainPayment = await getAdminBep20ChainPaymentDetail({
          paymentId: payment.id,
          orderId: typeof rawPaymentRow.order_id === "string" ? rawPaymentRow.order_id : null,
        });
      } catch (chainError) {
        chainPaymentError = getBep20ErrorMessage(chainError);
      }
    }

    const overpaymentWallet: AdminBep20OverpaymentWallet = {
      authorized: admin.adminAuthorization?.status === "active"
        && admin.adminAuthorization.admin_level === "super_admin",
      available: true,
      error: null,
      disposition: null,
    };

    if (chainPayment && overpaymentWallet.authorized) {
      const dispositionResult = await admin.supabase
        .from("bep20_overpayment_dispositions")
        .select("chain_session_id,order_id,payment_id,overpaid_usdt,exchange_rate,credited_cny,processed_at,reason")
        .eq("chain_session_id", chainPayment.sessionId)
        .maybeSingle();

      if (dispositionResult.error) {
        const dispositionError = `${dispositionResult.error.code ?? ""} ${dispositionResult.error.message ?? ""}`;
        overpaymentWallet.available = false;
        overpaymentWallet.error = /42P01|PGRST205|bep20_overpayment_dispositions|schema cache/i.test(dispositionError)
          ? "超额支付余额处置功能尚未初始化。"
          : "超额支付余额处置状态读取失败。";
      } else if (dispositionResult.data) {
        const row = dispositionResult.data as Record<string, unknown>;
        overpaymentWallet.disposition = {
          chainSessionId: String(row.chain_session_id ?? ""),
          orderId: String(row.order_id ?? ""),
          paymentId: String(row.payment_id ?? ""),
          overpaidUsdt: String(row.overpaid_usdt ?? "0"),
          exchangeRate: String(row.exchange_rate ?? "0"),
          creditedCny: String(row.credited_cny ?? "0"),
          processedAt: String(row.processed_at ?? ""),
          reason: String(row.reason ?? ""),
        };
      }
    }

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "view_payment_detail",
      module: auditModule,
      targetType: "payment_record",
      targetId: params.paymentId,
      targetLabel: payment.payment_no,
      result: "success",
      metadata: {
        source,
        callback_count: callbacks.length,
        has_callback_error: Boolean(callbackError),
        has_chain_payment: Boolean(chainPayment),
        has_chain_payment_error: Boolean(chainPaymentError),
      },
    });

    return NextResponse.json({ payment, callbacks, callbackError, chainPayment, chainPaymentError, overpaymentWallet });
  } catch (error) {
    const message = sanitizePaymentError(error, "支付详情加载失败");
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "view_payment_detail",
      module: auditModule,
      targetType: "payment_record",
      targetId: params.paymentId,
      result: "failed",
      errorMessage: message,
      metadata: { source },
    });

    return NextResponse.json(
      { error: message },
      { status: isPaymentSchemaMissing(error) ? 503 : 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "manual_update_payment_status",
      module: "payments",
      targetType: "payment_record",
      targetId: params.paymentId,
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = (await request.json().catch(() => null)) as { action?: string; chainSessionId?: string; reason?: string } | null;
  const action = String(body?.action ?? "");
  if (["recheck_bep20", "approve_late_payment", "reject_late_payment"].includes(action)) {
    const chainSessionId = String(body?.chainSessionId ?? "");
    if (!chainSessionId) return NextResponse.json({ error: "缺少链上支付单 ID" }, { status: 400 });
    const reason = String(body?.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "重新核验必须填写原因" }, { status: 400 });

    try {
      const result = action === "approve_late_payment"
        ? await approveLateBep20PaymentSession(chainSessionId, admin.user.id, reason)
        : action === "reject_late_payment"
          ? await rejectLateBep20PaymentSession(chainSessionId, admin.user.id, reason)
          : await recheckAdminBep20ChainPaymentSession(chainSessionId, admin.user.id, reason);
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action,
        module: "payments",
        targetType: "chain_payment_session",
        targetId: chainSessionId,
        result: "success",
        afterSummary: { status: result.status, txHash: result.txHash, confirmations: result.confirmationCount },
        metadata: { reason },
      });
      return NextResponse.json({ result });
    } catch (error) {
      const message = getBep20ErrorMessage(error);
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action,
        module: "payments",
        targetType: "chain_payment_session",
        targetId: chainSessionId,
        result: "failed",
        errorMessage: message,
        metadata: { reason },
      });
      return NextResponse.json(
        { error: message },
        { status: typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status: number }).status) : 500 },
      );
    }
  }

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "manual_update_payment_status",
    module: "payments",
    targetType: "payment_record",
    targetId: params.paymentId,
    result: "denied",
    errorMessage: "当前后台不提供手动修改支付状态。",
  });

  return NextResponse.json({ error: "当前后台不提供手动修改支付状态。" }, { status: 403 });
}
