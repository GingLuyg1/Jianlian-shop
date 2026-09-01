import { NextResponse } from "next/server";

import { getAuditErrorMessage, sanitizeAuditValue } from "@/lib/admin/audit-log-service";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { sanitizeMessage } from "@/lib/monitoring/logger";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const VALID_MODULES = new Set([
  "payments",
  "recharges",
  "orders",
  "users",
  "products",
  "categories",
  "inventory",
  "delivery",
  "settings",
  "system",
  "privacy",
  "notifications",
]);

const VALID_RESULTS = new Set(["success", "failed", "denied", "partial"]);

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function isAuditTableMissing(error: unknown) {
  const message = getAuditErrorMessage(error, "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("admin_audit_logs") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache")
  );
}

export async function GET(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }
  
  const serviceClient = getSupabaseServiceRoleClient();
  const supabase = serviceClient ?? admin.supabase;
  const searchParams = new URL(request.url).searchParams;

  const page = clampNumber(searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampNumber(searchParams.get("pageSize"), 20, 10, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("admin_audit_logs")
    .select("id,admin_user_id,admin_email,module,action,target_type,target_id,target_label,request_id,ip_address,user_agent,result,error_code,error_message,before_summary,after_summary,metadata,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  const adminEmail = searchParams.get("adminEmail")?.trim();
  const auditModule = searchParams.get("module")?.trim();
  const action = searchParams.get("action")?.trim();
  const result = searchParams.get("result")?.trim();
  const targetId = searchParams.get("targetId")?.trim();
  const requestId = searchParams.get("requestId")?.trim();
  const startAt = searchParams.get("startAt")?.trim();
  const endAt = searchParams.get("endAt")?.trim();

  if (adminEmail) query = query.ilike("admin_email", `%${adminEmail}%`);
  if (auditModule && VALID_MODULES.has(auditModule)) query = query.eq("module", auditModule);
  if (action) query = query.ilike("action", `%${action}%`);
  if (result && VALID_RESULTS.has(result)) query = query.eq("result", result);
  if (targetId) query = query.ilike("target_id", `%${targetId}%`);
  if (requestId) query = query.ilike("request_id", `%${requestId}%`);
  if (startAt) query = query.gte("created_at", startAt);
  if (endAt) query = query.lte("created_at", endAt);

  const { data, error, count } = await query.range(from, to);

  if (error) {
    if (isAuditTableMissing(error)) {
      return NextResponse.json(
        {
          error: "审计日志表尚未初始化，请先执行 admin_audit_logs migration。",
          logs: [],
          count: 0,
          page,
          pageSize,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "审计日志加载失败，请稍后重试。", logs: [], count: 0, page, pageSize },
      { status: 500 }
    );
  }

  return NextResponse.json({
    logs: (data ?? []).map((row) => ({
      ...row,
      before_summary: sanitizeAuditValue(row.before_summary),
      after_summary: sanitizeAuditValue(row.after_summary),
      metadata: sanitizeAuditValue(row.metadata),
      error_message: typeof row.error_message === "string" ? sanitizeMessage(row.error_message) : row.error_message,
    })),
    count: count ?? 0,
    page,
    pageSize,
  });
}
