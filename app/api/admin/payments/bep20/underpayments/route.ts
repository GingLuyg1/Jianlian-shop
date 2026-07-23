import { NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import {
  getAdminBep20UnderpaymentPreview,
  listAdminBep20Underpayments,
} from "@/lib/payments/bep20-underpayment-admin";
import { isUuid } from "@/lib/business/business-ids";
import { checkRateLimit, getAdminRateLimitKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function safeReadError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (
    code === "BEP20_UNDERPAYMENT_SERVICE_ROLE_NOT_CONFIGURED"
    || code === "BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID"
    || code === "BEP20_UNDERPAYMENT_MIGRATION_REQUIRED"
  ) {
    return {
      status: 503,
      code,
      message: "欠额支付预检查服务暂不可用。",
    };
  }
  return {
    status: 500,
    code: "BEP20_UNDERPAYMENT_PREVIEW_FAILED",
    message: "欠额支付预检查失败，请稍后重试。",
  };
}

export async function GET(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    return NextResponse.json(
      { success: false, code: "ADMIN_AUTH_REQUIRED", message: admin.message },
      { status: admin.status },
    );
  }

  const rateLimit = checkRateLimit(
    "admin_write",
    getAdminRateLimitKey(admin.user.id, "bep20_underpayment_preview"),
  );
  if (!rateLimit.allowed) return rateLimit.response!;

  const params = new URL(request.url).searchParams;
  const sessionId = String(params.get("session_id") ?? "").trim();
  const limit = Math.max(1, Math.min(Math.floor(Number(params.get("limit") ?? 50)) || 50, 100));

  if (sessionId && !isUuid(sessionId)) {
    return NextResponse.json(
      { success: false, code: "SESSION_ID_INVALID", message: "链上支付会话 ID 无效。" },
      { status: 400 },
    );
  }

  try {
    if (sessionId) {
      const preview = await getAdminBep20UnderpaymentPreview(sessionId);
      if (!preview) {
        return NextResponse.json(
          { success: false, code: "BEP20_UNDERPAYMENT_SESSION_NOT_FOUND", message: "欠额支付记录不存在。" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        dry_run: true,
        eligible: preview.eligible,
        preview,
      });
    }

    const records = await listAdminBep20Underpayments(limit);
    return NextResponse.json({
      success: true,
      dry_run: true,
      count: records.length,
      records,
    });
  } catch (error) {
    const safe = safeReadError(error);
    return NextResponse.json(
      { success: false, code: safe.code, message: safe.message },
      { status: safe.status },
    );
  }
}

