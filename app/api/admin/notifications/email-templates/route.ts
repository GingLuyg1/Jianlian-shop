import { NextRequest, NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { auditEmailAdminAction, summarizeEmailError } from "@/lib/email/jobs";
import { EMAIL_TEMPLATE_CODES } from "@/lib/email/types";
import { getAdminRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function isSuperAdmin(email?: string | null) {
  return email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

async function requireSuperAdmin(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return { ok: false as const, response: json({ error: admin.message }, { status: admin.status }) };
  if (!isSuperAdmin(admin.user.email)) {
    await auditEmailAdminAction({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "email_template_access_denied", result: "denied" });
    return { ok: false as const, response: json({ error: "无权管理邮件模板。" }, { status: 403 }) };
  }
  const limit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "email_templates"));
  if (!limit.allowed) return { ok: false as const, response: limit.response! };
  const service = getSupabaseServiceRoleClient();
  if (!service) return { ok: false as const, response: json({ error: "后台服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" }, { status: 503 }) };
  return { ok: true as const, admin, service };
}

export async function GET(request: NextRequest) {
  const ctx = await requireSuperAdmin(request);
  if (!ctx.ok) return ctx.response;

  const url = new URL(request.url);
  const code = url.searchParams.get("templateCode")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? 20) || 20));
  const from = (page - 1) * pageSize;

  let query = ctx.service
    .from("email_templates")
    .select("id,template_code,version,name,subject_template,status,is_current,created_at,updated_at,published_at", { count: "exact" })
    .order("template_code", { ascending: true })
    .order("version", { ascending: false })
    .range(from, from + pageSize - 1);

  if (code && EMAIL_TEMPLATE_CODES.includes(code as any)) query = query.eq("template_code", code);
  if (status && ["draft", "published", "archived"].includes(status)) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return json({ error: summarizeEmailError(error) }, { status: 500 });
  return json({ templates: data ?? [], total: count ?? 0, page, pageSize });
}

export async function POST(request: NextRequest) {
  const ctx = await requireSuperAdmin(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const templateCode = String(body.templateCode ?? "").trim();
    const subject = String(body.subjectTemplate ?? "").trim();
    const html = String(body.htmlTemplate ?? "").trim();
    const text = String(body.textTemplate ?? "").trim();
    const name = String(body.name ?? templateCode).trim();
    const variablesSchema = typeof body.variablesSchema === "object" && body.variablesSchema ? body.variablesSchema : {};

    if (!EMAIL_TEMPLATE_CODES.includes(templateCode as any)) return json({ error: "模板代码不在允许列表中。" }, { status: 400 });
    if (!subject || !html) return json({ error: "邮件主题和 HTML 模板不能为空。" }, { status: 400 });

    const latest = await ctx.service
      .from("email_templates")
      .select("version")
      .eq("template_code", templateCode)
      .order("version", { ascending: false })
      .limit(1);
    if (latest.error) return json({ error: summarizeEmailError(latest.error) }, { status: 500 });
    const nextVersion = Number(latest.data?.[0]?.version ?? 0) + 1;

    const { data, error } = await ctx.service
      .from("email_templates")
      .insert({
        template_code: templateCode,
        version: nextVersion,
        name,
        subject_template: subject,
        html_template: html,
        text_template: text || null,
        variables_schema: variablesSchema,
        status: "draft",
        is_current: false,
        created_by: ctx.admin.user.id,
        updated_by: ctx.admin.user.id,
      })
      .select("id,template_code,version,name,status,is_current,created_at")
      .single();

    if (error || !data) return json({ error: summarizeEmailError(error) }, { status: 500 });
    await auditEmailAdminAction({
      request,
      admin: { id: ctx.admin.user.id, email: ctx.admin.user.email },
      action: "email_template_create_draft",
      targetId: data.id,
      targetLabel: `${templateCode} v${nextVersion}`,
      result: "success",
      afterSummary: { templateCode, version: nextVersion },
    });
    return json({ template: data });
  } catch (error) {
    return json({ error: summarizeEmailError(error) }, { status: 500 });
  }
}
