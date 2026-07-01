import { NextRequest, NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { auditEmailAdminAction, summarizeEmailError } from "@/lib/email/jobs";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return { ok: false as const, response: json({ error: admin.message }, { status: admin.status }) };
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    await auditEmailAdminAction({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "email_template_access_denied", result: "denied" });
    return { ok: false as const, response: json({ error: "无权管理邮件模板。" }, { status: 403 }) };
  }
  const service = getSupabaseServiceRoleClient();
  if (!service) return { ok: false as const, response: json({ error: "后台服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" }, { status: 503 }) };
  return { ok: true as const, admin, service };
}

export async function GET(request: NextRequest, { params }: { params: { templateId: string } }) {
  const ctx = await requireSuperAdmin(request);
  if (!ctx.ok) return ctx.response;
  const { data, error } = await ctx.service.from("email_templates").select("*").eq("id", params.templateId).maybeSingle();
  if (error) return json({ error: summarizeEmailError(error) }, { status: 500 });
  if (!data) return json({ error: "邮件模板不存在。" }, { status: 404 });
  return json({ template: data });
}

export async function PATCH(request: NextRequest, { params }: { params: { templateId: string } }) {
  const ctx = await requireSuperAdmin(request);
  if (!ctx.ok) return ctx.response;
  try {
    const body = await request.json();
    const action = String(body.action ?? "update").trim();
    const reason = String(body.reason ?? "").trim();

    const loaded = await ctx.service.from("email_templates").select("*").eq("id", params.templateId).maybeSingle();
    if (loaded.error) return json({ error: summarizeEmailError(loaded.error) }, { status: 500 });
    if (!loaded.data) return json({ error: "邮件模板不存在。" }, { status: 404 });
    const before = loaded.data as Record<string, any>;

    if (action === "publish") {
      if (!reason) return json({ error: "发布邮件模板必须填写原因。" }, { status: 400 });
      await ctx.service
        .from("email_templates")
        .update({ is_current: false })
        .eq("template_code", before.template_code)
        .eq("status", "published");
      const updated = await ctx.service
        .from("email_templates")
        .update({ status: "published", is_current: true, published_at: new Date().toISOString(), published_by: ctx.admin.user.id, updated_by: ctx.admin.user.id })
        .eq("id", params.templateId)
        .select("*")
        .single();
      if (updated.error || !updated.data) return json({ error: summarizeEmailError(updated.error) }, { status: 500 });
      await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_publish", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "success", reason, beforeSummary: { status: before.status, is_current: before.is_current }, afterSummary: { status: "published", is_current: true } });
      return json({ template: updated.data });
    }

    if (action === "archive") {
      if (!reason) return json({ error: "归档邮件模板必须填写原因。" }, { status: 400 });
      const updated = await ctx.service
        .from("email_templates")
        .update({ status: "archived", is_current: false, archived_at: new Date().toISOString(), updated_by: ctx.admin.user.id })
        .eq("id", params.templateId)
        .select("*")
        .single();
      if (updated.error || !updated.data) return json({ error: summarizeEmailError(updated.error) }, { status: 500 });
      await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_archive", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "success", reason, beforeSummary: { status: before.status }, afterSummary: { status: "archived" } });
      return json({ template: updated.data });
    }

    if (before.status !== "draft") return json({ error: "只有草稿模板可以编辑。" }, { status: 400 });
    const patch: Record<string, unknown> = { updated_by: ctx.admin.user.id };
    for (const [inputKey, column] of Object.entries({ name: "name", subjectTemplate: "subject_template", htmlTemplate: "html_template", textTemplate: "text_template", variablesSchema: "variables_schema" })) {
      if (body[inputKey] !== undefined) patch[column] = body[inputKey];
    }
    const updated = await ctx.service.from("email_templates").update(patch).eq("id", params.templateId).select("*").single();
    if (updated.error || !updated.data) return json({ error: summarizeEmailError(updated.error) }, { status: 500 });
    await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_update_draft", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "success", beforeSummary: { updated_at: before.updated_at }, afterSummary: { updated_at: updated.data.updated_at } });
    return json({ template: updated.data });
  } catch (error) {
    return json({ error: summarizeEmailError(error) }, { status: 500 });
  }
}
