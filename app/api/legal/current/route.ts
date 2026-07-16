import { NextResponse } from "next/server";

import { listPublishedLegalDocuments } from "@/lib/legal/legal-service";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleConfiguration } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const REQUIRED_DOCUMENT_TYPES = [
  "terms_of_service",
  "refund_policy",
  "digital_delivery_policy",
  "purchase_notice",
] as const;

type SupabaseLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
};

function getProjectRef() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  try {
    const host = new URL(rawUrl).host;
    return {
      host,
      projectRef: host.split(".")[0] ?? "unknown",
      containsRestV1: rawUrl.includes("/rest/v1"),
    };
  } catch {
    return { host: "invalid", projectRef: "unknown", containsRestV1: rawUrl.includes("/rest/v1") };
  }
}

function getPublicAnonKeyType() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("eyJ")) return "jwt";
  return "unknown";
}

function getErrorField(error: SupabaseLikeError, field: keyof SupabaseLikeError) {
  const value = error[field];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function classifyLegalError(error: unknown) {
  const typed = (error ?? {}) as SupabaseLikeError;
  const code = getErrorField(typed, "code");
  const message = getErrorField(typed, "message");
  const details = getErrorField(typed, "details");
  const hint = getErrorField(typed, "hint");
  const combined = `${code} ${message} ${details} ${hint}`;

  if (code === "42P01" || /relation ["']?public\.legal_documents["']? does not exist/i.test(combined)) {
    return { status: 503, message: "协议版本表尚未初始化，请管理员执行 legal documents migration。" };
  }

  if (code === "PGRST205" || /Could not find the table.*legal_documents|schema cache.*legal_documents/i.test(combined)) {
    return { status: 503, message: "协议版本表暂不可用，请确认已在当前 Supabase 项目执行 migration 并刷新 schema cache。" };
  }

  if (code === "42703" || /column .* does not exist/i.test(combined)) {
    return { status: 500, message: "协议版本表结构与代码不兼容，请检查 legal_documents 字段。" };
  }

  if (code === "42501" || /permission denied|row-level security|violates row-level security/i.test(combined)) {
    return { status: 403, message: "协议版本读取权限不足，请检查 legal_documents RLS policy。" };
  }

  if (/invalid api key|invalid jwt|jwserror|JWT|API key/i.test(combined)) {
    return { status: 500, message: "Supabase API Key 配置无效，请检查本地环境变量是否属于当前测试项目。" };
  }

  return { status: 500, message: "协议读取失败，请稍后重试" };
}

function logLegalError(error: unknown) {
  const typed = (error ?? {}) as SupabaseLikeError;
  const serviceRoleConfig = getSupabaseServiceRoleConfiguration();
  const project = getProjectRef();

  console.error("[LegalCurrent] failed to load legal documents", {
    supabaseHost: project.host,
    projectRef: project.projectRef,
    containsRestV1: project.containsRestV1,
    anonKeyType: getPublicAnonKeyType(),
    serviceRoleKeyType: serviceRoleConfig.keyType,
    serviceRolePresent: serviceRoleConfig.serviceRolePresent,
    serviceRoleValid: serviceRoleConfig.valid,
    code: getErrorField(typed, "code") || null,
    message: getErrorField(typed, "message") || null,
    details: getErrorField(typed, "details") || null,
    hint: getErrorField(typed, "hint") || null,
    status: getErrorField(typed, "status") || null,
  });
}

export async function GET() {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
  }

  try {
    const documents = await listPublishedLegalDocuments(getSupabaseServerClient());
    const availableTypes = new Set(documents.map((document) => document.document_type));
    const missingTypes = REQUIRED_DOCUMENT_TYPES.filter((type) => !availableTypes.has(type));

    if (missingTypes.length > 0) {
      return NextResponse.json(
        {
          error: "下单协议尚未发布完整，请管理员发布用户协议、退款政策、数字商品交付规则和购买须知。",
          missing_document_types: missingTypes,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({ documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logLegalError(error);
    const result = classifyLegalError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
