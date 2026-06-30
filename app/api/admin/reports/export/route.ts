import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { buildCsv, exportFileName, loadBusinessReport, normalizeReportError, normalizeReportRange } from "@/lib/reports/business-reports";

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

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({ request, action: "export_report_csv", module: "system", result: "denied", errorMessage: admin.message });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "orders";
  if (!ALLOWED_EXPORTS.has(type)) return NextResponse.json({ error: "不支持的导出类型。" }, { status: 400 });

  try {
    const range = normalizeReportRange(url.searchParams.get("start"), url.searchParams.get("end"));
    const report = await loadBusinessReport(admin.supabase, range);
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
