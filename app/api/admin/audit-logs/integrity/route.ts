import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { isAuditIntegritySchemaMissing, verifyAuditRecordHash } from "@/lib/admin/audit-integrity";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 10), 200);
}

export async function GET(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "check_audit_integrity",
      module: "system",
      targetType: "admin_audit_logs",
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  
  const serviceClient = getSupabaseServiceRoleClient();
  const supabase = serviceClient ?? admin.supabase;
  const limit = clampLimit(new URL(request.url).searchParams.get("limit"));

  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select(
      "id,request_id,admin_user_id,admin_email,actor_type,actor_user_id,actor_admin_id,action,module,target_type,target_id,target_label,resource_type,resource_id,business_no,result,reason,error_code,error_message,before_summary,after_summary,metadata,created_at,previous_hash,record_hash,integrity_status"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const message = isAuditIntegritySchemaMissing(error)
      ? "审计完整性字段尚未初始化，请管理员执行 audit integrity migration。"
      : "审计完整性检查失败，请稍后重试。";

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "check_audit_integrity",
      module: "system",
      targetType: "admin_audit_logs",
      result: "failed",
      errorMessage: message,
    });

    return NextResponse.json(
      { configured: false, error: message, checked: 0, valid: 0, missing: 0, broken: 0, rows: [] },
      { status: isAuditIntegritySchemaMissing(error) ? 503 : 500 }
    );
  }

  const rows = (data ?? []).map((row) => {
    const check = verifyAuditRecordHash(row);
    return {
      id: row.id,
      requestId: row.request_id,
      action: row.action,
      module: row.module,
      result: row.result,
      createdAt: row.created_at,
      integrityStatus: row.integrity_status ?? check.status,
      hashStatus: check.status,
    };
  });

  const summary = rows.reduce(
    (acc, row) => {
      if (row.hashStatus === "valid") acc.valid += 1;
      if (row.hashStatus === "missing") acc.missing += 1;
      if (row.hashStatus === "broken") acc.broken += 1;
      return acc;
    },
    { valid: 0, missing: 0, broken: 0 }
  );

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "check_audit_integrity",
    module: "system",
    targetType: "admin_audit_logs",
    result: summary.broken > 0 ? "partial" : "success",
    metadata: { checked: rows.length, ...summary },
  });

  return NextResponse.json({ configured: true, checked: rows.length, ...summary, rows });
}
