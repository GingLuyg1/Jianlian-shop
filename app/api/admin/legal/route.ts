import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { revalidateLegalDocumentsCache } from "@/lib/cache/cache-tags";
import { classifyLegalDatabaseError, getLegalConstraintSummary } from "@/lib/legal/legal-error.mjs";
import { hashLegalContent } from "@/lib/legal/legal-service";

export const dynamic = "force-dynamic";

const DOCUMENT_TYPES = new Set(["terms_of_service", "privacy_policy", "refund_policy", "digital_delivery_policy", "purchase_notice"]);
function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function documentIdSummary(value: unknown) {
  const id = text(value);
  if (!id) return null;
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-6)}` : "[redacted]";
}

function revalidateLegalCacheSafely(action: string, document: Record<string, unknown>) {
  if (revalidateLegalDocumentsCache()) return;
  console.warn("[LegalAdmin] cache revalidation failed", {
    action,
    document_id_summary: documentIdSummary(document.id),
    document_type: text(document.document_type) || null,
    version: text(document.version) || null,
  });
}

function logLegalFailure(input: {
  action: string;
  error: unknown;
  documentId?: unknown;
  documentType?: unknown;
  version?: unknown;
}) {
  const classified = classifyLegalDatabaseError(input.error);
  console.warn("[LegalAdmin] request failed", {
    action: input.action || "legal_action_failed",
    database_error_code: classified.code,
    constraint_summary: getLegalConstraintSummary(input.error),
    document_id_summary: documentIdSummary(input.documentId),
    document_type: text(input.documentType) || null,
    version: text(input.version) || null,
  });
  return classified;
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  try {
    const url = new URL(request.url);
    const documentType = url.searchParams.get("documentType") ?? "all";
    const status = url.searchParams.get("status") ?? "all";
    let query = admin.supabase
      .from("legal_documents")
      .select("id,document_type,version,title,content,content_hash,status,effective_at,published_at,published_by,publish_reason,created_at,updated_at")
      .order("document_type", { ascending: true })
      .order("created_at", { ascending: false });
    if (documentType !== "all") query = query.eq("document_type", documentType);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return json({ documents: data ?? [] });
  } catch (error) {
    const classified = classifyLegalDatabaseError(error, "协议列表读取失败，请稍后重试。");
    return json({ error: classified.message }, classified.status);
  }
}

export async function POST(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = text(body?.action);

  try {
    if (action === "create_draft") {
      const documentType = text(body?.documentType);
      const version = text(body?.version);
      const title = text(body?.title);
      const content = text(body?.content);
      if (!DOCUMENT_TYPES.has(documentType) || !version || !title || !content) {
        return json({ error: "请填写完整协议草稿信息" }, 400);
      }
      const row = {
        document_type: documentType,
        version,
        title,
        content,
        content_hash: hashLegalContent(content),
        status: "draft",
        effective_at: body?.effectiveAt ? new Date(String(body.effectiveAt)).toISOString() : null,
      };
      const { data, error } = await admin.supabase.from("legal_documents").insert(row).select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: "legal_create_draft", targetType: "legal_document", targetId: data.id, targetLabel: title, result: "success", afterSummary: { documentType, version, title } });
      return json({ document: data });
    }

    if (action === "update_draft") {
      const id = text(body?.id);
      const { data: before, error: beforeError } = await admin.supabase.from("legal_documents").select("*").eq("id", id).maybeSingle();
      if (beforeError) throw beforeError;
      if (!before) return json({ error: "协议草稿不存在" }, 404);
      if (before.status !== "draft") return json({ error: "已发布或已归档协议不能直接编辑" }, 409);
      const title = text(body?.title) || String(before.title ?? "");
      const content = text(body?.content) || String(before.content ?? "");
      const patch = {
        title,
        content,
        content_hash: hashLegalContent(content),
        effective_at: body?.effectiveAt ? new Date(String(body.effectiveAt)).toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.supabase.from("legal_documents").update(patch).eq("id", id).eq("status", "draft").select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: "legal_update_draft", targetType: "legal_document", targetId: id, targetLabel: title, result: "success", beforeSummary: { title: before.title, content_hash: before.content_hash }, afterSummary: { title, content_hash: patch.content_hash } });
      return json({ document: data });
    }

    if (action === "publish") {
      const id = text(body?.id);
      const reason = text(body?.reason);
      if (!reason) return json({ error: "发布原因必须填写" }, 400);
      const { data: doc, error: readError } = await admin.supabase.from("legal_documents").select("*").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!doc) return json({ error: "协议不存在" }, 404);
      if (doc.status !== "draft") return json({ error: "只有草稿可以发布为新版本" }, 409);

      // These remain two writes. A fully atomic publish requires a separately reviewed transaction RPC.
      const { error: archivePreviousError } = await admin.supabase
        .from("legal_documents")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("document_type", doc.document_type)
        .eq("status", "published");
      if (archivePreviousError) throw archivePreviousError;

      const { data, error } = await admin.supabase.from("legal_documents").update({ status: "published", published_at: new Date().toISOString(), published_by: admin.user.id, publish_reason: reason, effective_at: doc.effective_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: "legal_publish", targetType: "legal_document", targetId: id, targetLabel: data.title, result: "success", afterSummary: { document_type: data.document_type, version: data.version, reason } });
      revalidateLegalCacheSafely("publish", data);
      return json({ document: data });
    }

    if (action === "archive") {
      const id = text(body?.id);
      const reason = text(body?.reason);
      if (!reason) return json({ error: "归档原因必须填写" }, 400);
      const { data: doc, error: readError } = await admin.supabase.from("legal_documents").select("*").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!doc) return json({ error: "协议不存在" }, 404);
      if (doc.status !== "published") return json({ error: "只有已发布协议可以归档" }, 409);
      const { data, error } = await admin.supabase.from("legal_documents").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "published").select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: "legal_archive", targetType: "legal_document", targetId: id, targetLabel: data.title, result: "success", metadata: { reason } });
      revalidateLegalCacheSafely("archive", data);
      return json({ document: data });
    }

    return json({ error: "不支持的协议操作" }, 400);
  } catch (error) {
    const classified = logLegalFailure({
      action,
      error,
      documentId: body?.id,
      documentType: body?.documentType,
      version: body?.version,
    });
    return json({ error: classified.message }, classified.status);
  }
}
