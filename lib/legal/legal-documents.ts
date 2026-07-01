import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const LEGAL_DOCUMENT_TYPES = [
  "terms_of_service",
  "privacy_policy",
  "refund_policy",
  "digital_delivery_policy",
  "purchase_notice",
] as const;

export const REQUIRED_ORDER_DOCUMENT_TYPES = [
  "terms_of_service",
  "refund_policy",
  "digital_delivery_policy",
  "purchase_notice",
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];
export type LegalDocumentStatus = "draft" | "published" | "archived";

export type LegalDocumentRecord = {
  id: string;
  document_type: LegalDocumentType;
  version: string;
  title: string;
  content: string;
  content_hash: string;
  status: LegalDocumentStatus;
  is_current?: boolean | null;
  effective_at: string | null;
  published_at: string | null;
  published_by: string | null;
  publish_reason?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalAgreementInput = {
  document_type?: string;
  document_version_id?: string;
  document_version?: string;
  content_hash?: string;
};

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  terms_of_service: "用户协议",
  privacy_policy: "隐私政策",
  refund_policy: "退款政策",
  digital_delivery_policy: "数字商品交付规则",
  purchase_notice: "购买须知",
};

export function hashLegalContent(content: string) {
  return createHash("sha256").update(content.trim(), "utf8").digest("hex");
}

export function normalizeLegalError(error: unknown, fallback = "协议数据读取失败，请稍后重试。") {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (/legal_documents|order_agreement_acceptances|schema cache|Could not find|42P01|42703|PGRST/i.test(`${message} ${code}`)) {
    return "协议版本数据表尚未初始化，请先在 Supabase 执行协议版本 migration。";
  }
  if (/duplicate key|unique/i.test(message)) return "同类协议已有当前生效版本，请刷新后重试。";
  if (/permission|policy|forbidden|unauthorized/i.test(message)) return "没有权限执行该协议操作。";
  return message || fallback;
}

function normalizeDocument(row: Record<string, unknown>): LegalDocumentRecord {
  const type = String(row.document_type ?? "") as LegalDocumentType;
  return {
    id: String(row.id),
    document_type: LEGAL_DOCUMENT_TYPES.includes(type) ? type : "terms_of_service",
    version: String(row.version ?? ""),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    content_hash: String(row.content_hash ?? ""),
    status: String(row.status ?? "draft") as LegalDocumentStatus,
    is_current: row.is_current === null || row.is_current === undefined ? null : Boolean(row.is_current),
    effective_at: row.effective_at ? String(row.effective_at) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    published_by: row.published_by ? String(row.published_by) : null,
    publish_reason: row.publish_reason ? String(row.publish_reason) : null,
    archived_at: row.archived_at ? String(row.archived_at) : null,
    archived_by: row.archived_by ? String(row.archived_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listLegalDocuments(
  supabase: SupabaseClient,
  options: { type?: string; status?: string; limit?: number } = {}
) {
  let query = supabase
    .from("legal_documents")
    .select("*")
    .order("document_type", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 200, 1), 500));

  if (options.type && options.type !== "all") query = query.eq("document_type", options.type);
  if (options.status && options.status !== "all") query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw new Error(normalizeLegalError(error));
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeDocument);
}

export async function getLegalDocumentById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("legal_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(normalizeLegalError(error));
  return data ? normalizeDocument(data as Record<string, unknown>) : null;
}

export async function getCurrentLegalDocuments(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("legal_documents")
    .select("*")
    .eq("status", "published")
    .eq("is_current", true)
    .in("document_type", [...LEGAL_DOCUMENT_TYPES])
    .order("document_type", { ascending: true });

  if (error) throw new Error(normalizeLegalError(error));
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeDocument);
}

export async function getCurrentRequiredOrderDocuments(supabase: SupabaseClient) {
  const documents = await getCurrentLegalDocuments(supabase);
  return documents.filter((item) =>
    (REQUIRED_ORDER_DOCUMENT_TYPES as readonly string[]).includes(item.document_type)
  );
}

export function validateOrderAgreementInputs(
  currentDocuments: LegalDocumentRecord[],
  agreements: LegalAgreementInput[]
) {
  const required = currentDocuments.filter((item) =>
    (REQUIRED_ORDER_DOCUMENT_TYPES as readonly string[]).includes(item.document_type)
  );
  if (required.length !== REQUIRED_ORDER_DOCUMENT_TYPES.length) {
    return "下单协议版本尚未完整发布，请联系管理员处理。";
  }

  const byId = new Map(agreements.map((item) => [String(item.document_version_id ?? ""), item]));
  for (const document of required) {
    const input = byId.get(document.id);
    if (!input) return `请确认${LEGAL_DOCUMENT_LABELS[document.document_type]}。`;
    if (input.document_type !== document.document_type) return "协议确认信息不匹配，请刷新后重新确认。";
    if (input.document_version !== document.version) return "协议版本已更新，请重新确认后下单。";
    if (input.content_hash !== document.content_hash) return "协议内容已更新，请重新确认后下单。";
  }
  return null;
}

export function toOrderAgreementPayload(document: LegalDocumentRecord) {
  return {
    document_type: document.document_type,
    document_version_id: document.id,
    document_version: document.version,
    title: document.title,
    content_hash: document.content_hash,
  };
}
