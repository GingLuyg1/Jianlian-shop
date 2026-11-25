import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { buildCsv, exportFileName, loadBusinessReport, normalizeReportError, normalizeReportRange } from "@/lib/reports/business-reports";
import { checkRateLimit, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const ALLOWED_EXPORTS = new Set([
  "orders",
  "payments",
  "recharges",
  "refunds",
  "users",
  "product-sales",
  "sku-sales",
  "inventory",
  "deliveries",
  "balance",
]);

const SUPER_ADMIN_ONLY_EXPORTS = new Set(["users", "refunds", "balance"]);

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({ request, action: "export_report_csv", module: "system", result: "denied", errorMessage: admin.message });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "report_export"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "orders";
  if (!ALLOWED_EXPORTS.has(type)) return NextResponse.json({ error: "不支持的导出类型。" }, { status: 400 });

  const isSuperAdmin = admin.adminAuthorization?.admin_level === "super_admin";
  if (SUPER_ADMIN_ONLY_EXPORTS.has(type) && !isSuperAdmin) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "export_report_csv",
      module: "system",
      targetType: "business_report",
      targetLabel: type,
      result: "denied",
      errorMessage: "该导出类型仅限超级管理员操作",
    });
    return NextResponse.json({ error: "无超级管理员权限，不可导出用户、退款或余额流水明细。" }, { status: 403 });
  }

  try {
    const range = normalizeReportRange(url.searchParams.get("start"), url.searchParams.get("end"));
    const reader = getSupabaseServiceRoleClient() ?? admin.supabase;
    const report = await loadBusinessReport(reader, range);
    const csv = buildCsv(type, report);
    const fileName = exportFileName(type, range);

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "export_report_csv",
      module: "system",
      targetType: "business_report",
      targetLabel: type,
      result: "success",
      metadata: { type, range, fileName },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = normalizeReportError(error, "导出失败");
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "export_report_csv",
      module: "system",
      targetType: "business_report",
      targetLabel: type,
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
