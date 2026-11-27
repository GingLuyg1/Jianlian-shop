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
  const admin = await getServerAdminContext("reports.export");
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
    const requiredSections: Record<string, readonly string[]> = {
      orders: ["订单"], payments: ["支付"], recharges: ["充值"], refunds: ["退款"], users: ["用户"],
      "product-sales": ["订单", "商品"], "sku-sales": ["订单", "商品", "SKU"],
      inventory: ["数字库存"], deliveries: ["交付"], balance: ["余额流水"],
    };
    const affected = requiredSections[type].filter((name) => report.errors[name]);
    if (affected.length > 0) {
      return NextResponse.json({ error: "报表数据不完整，已停止导出。请缩短时间范围后重试。", sections: affected }, { status: 503 });
    }
    const csv = buildCsv(type, report, isSuperAdmin);
    const fileName = exportFileName(type, range);

    const audit = await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "export_report_csv",
      module: "system",
      targetType: "business_report",
      targetLabel: type,
      result: "success",
      metadata: { type, range, fileName },
    });

    if (!audit.ok) {
      return NextResponse.json({ error: "审计记录暂不可用，未发放报表文件。" }, { status: 503 });
    }
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
