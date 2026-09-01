import { NextRequest, NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { auditEmailAdminAction, summarizeEmailError } from "@/lib/email/jobs";
import { getAllowedTemplateVariables, validateSafeEmailHtml, validateTemplateVariables } from "@/lib/email/templates";
import type { EmailTemplateRecord } from "@/lib/email/types";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) return { ok: false as const, response: json({ error: admin.message }, { status: admin.status }) };
  const service = getSupabaseServiceRoleClient();
  if (!service) return { ok: false as const, response: json({ error: "后台服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" }, { status: 503 }) };
  return { ok: true as const, admin, service };
}

function validateTemplateForPublish(template: Record<string, any>) {
  if (!String(template.subject_template ?? "").trim() || !String(template.html_template ?? "").trim()) {
    return { ok: false as const, error: "邮件主题和 HTML 模板不能为空。" };
  }
  const htmlSafety = validateSafeEmailHtml(String(template.html_template));
  if (!htmlSafety.ok) return htmlSafety;

  const schema = getAllowedTemplateVariables(
    template.variables_schema && typeof template.variables_schema === "object" && !Array.isArray(template.variables_schema)
      ? template.variables_schema
      : {}
  );
  const validation = validateTemplateVariables(
    template as EmailTemplateRecord,
    Object.fromEntries(schema.required.map((key) => [key, "validation-placeholder"]))
  );
  return validation.ok ? { ok: true as const } : validation;
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
      if (before.status !== "draft") {
        const message = before.status === "archived" ? "已归档模板不能发布。" : "只有草稿模板可以发布。";
        await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_publish", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "failed", reason, beforeSummary: { status: before.status, is_current: before.is_current }, errorMessage: message });
        return json({ error: message }, { status: 400 });
      }
      const validation = validateTemplateForPublish(before);
      if (!validation.ok) {
        await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_publish", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "failed", reason, beforeSummary: { status: before.status, is_current: before.is_current }, errorMessage: validation.error });
        return json({ error: validation.error }, { status: 400 });
      }
      const published = await ctx.service
        .rpc("publish_email_template_atomic", { p_template_id: params.templateId, p_admin_id: ctx.admin.user.id })
        .single();
      if (published.error || !published.data) {
        const message = /EMAIL_TEMPLATE_NOT_DRAFT/i.test(String(published.error?.message ?? ""))
          ? "模板状态已变化，只有草稿模板可以发布。"
          : "邮件模板原子发布失败，原 current 模板保持不变。";
        await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_publish", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "failed", reason, beforeSummary: { status: before.status, is_current: before.is_current }, errorMessage: message });
        return json({ error: message }, { status: /EMAIL_TEMPLATE_NOT_DRAFT/i.test(String(published.error?.message ?? "")) ? 409 : 500 });
      }
      await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_publish", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "success", reason, beforeSummary: { status: before.status, is_current: before.is_current }, afterSummary: { status: "published", is_current: true } });
      return json({ template: published.data });
    }

    if (action === "archive") {
      if (!reason) return json({ error: "归档邮件模板必须填写原因。" }, { status: 400 });
      if (before.status === "archived") {
        const message = "邮件模板已经归档，不能重复归档。";
        await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_archive", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "failed", reason, beforeSummary: { status: before.status, is_current: before.is_current }, errorMessage: message });
        return json({ error: message }, { status: 400 });
      }
      if (before.is_current) {
        const message = "当前生效模板不能直接归档，请先发布替代草稿。";
        await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_archive", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "failed", reason, beforeSummary: { status: before.status, is_current: before.is_current }, errorMessage: message });
        return json({ error: message }, { status: 409 });
      }
      const updated = await ctx.service
        .from("email_templates")
        .update({ status: "archived", is_current: false, archived_at: new Date().toISOString(), updated_by: ctx.admin.user.id })
        .eq("id", params.templateId)
        .eq("status", before.status)
        .eq("is_current", false)
        .select("*")
        .maybeSingle();
      if (updated.error || !updated.data) return json({ error: updated.error ? summarizeEmailError(updated.error) : "模板状态已变化，请刷新后重试。" }, { status: updated.error ? 500 : 409 });
      await auditEmailAdminAction({ request, admin: { id: ctx.admin.user.id, email: ctx.admin.user.email }, action: "email_template_archive", targetId: params.templateId, targetLabel: `${before.template_code} v${before.version}`, result: "success", reason, beforeSummary: { status: before.status }, afterSummary: { status: "archived" } });
      return json({ template: updated.data });
    }

    if (before.status !== "draft") return json({ error: "只有草稿模板可以编辑。" }, { status: 400 });
    if (body.htmlTemplate !== undefined) {
      const htmlSafety = validateSafeEmailHtml(String(body.htmlTemplate));
      if (!htmlSafety.ok) return json({ error: htmlSafety.error }, { status: 400 });
    }
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
