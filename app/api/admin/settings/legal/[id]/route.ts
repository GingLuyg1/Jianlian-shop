import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { revalidateLegalDocumentsCache } from "@/lib/cache/cache-tags";
import { getLegalDocumentById, hashLegalContent, normalizeLegalError } from "@/lib/legal/legal-documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function cleanText(value: unknown, max = 20000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(_request: Request, context: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  try {
    const document = await getLegalDocumentById(admin.supabase, context.params.id);
    if (!document) return json({ error: "协议版本不存在。" }, 404);
    return json({ document });
  } catch (error) {
    return json({ error: normalizeLegalError(error) }, 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  try {
    const document = await getLegalDocumentById(admin.supabase, context.params.id);
    if (!document) return json({ error: "协议版本不存在。" }, 404);
    if (document.status !== "draft") return json({ error: "已发布或已归档协议不能直接编辑，请创建新版本。" }, 409);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const title = cleanText(body?.title, 200) || document.title;
    const version = cleanText(body?.version, 80) || document.version;
    const content = cleanText(body?.content, 50000) || document.content;
    if (!title || !version || !content) return json({ error: "标题、版本和正文不能为空。" }, 400);

    const { data, error } = await admin.supabase
      .from("legal_documents")
      .update({ title, version, content, content_hash: hashLegalContent(content), updated_at: new Date().toISOString() })
      .eq("id", context.params.id)
      .eq("status", "draft")
      .select("*")
      .single();
    if (error) throw error;

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "update_legal_document_draft",
      module: "settings",
      targetType: "legal_document",
      targetId: context.params.id,
      targetLabel: `${document.document_type} ${version}`,
      result: "success",
      beforeSummary: { title: document.title, version: document.version, content_hash: document.content_hash },
      afterSummary: { title, version, content_hash: hashLegalContent(content) },
    });

    return json({ document: data });
  } catch (error) {
    return json({ error: normalizeLegalError(error, "协议草稿保存失败。") }, 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = cleanText(body?.action, 40);

  try {
    const document = await getLegalDocumentById(admin.supabase, context.params.id);
    if (!document) return json({ error: "协议版本不存在。" }, 404);

    if (action === "publish") {
      if (document.status !== "draft") return json({ error: "只有草稿协议可以发布。" }, 409);
      const reason = cleanText(body?.reason, 500);
      if (!reason) return json({ error: "发布原因不能为空。" }, 400);
      const effectiveAt = cleanText(body?.effective_at, 80) || new Date().toISOString();

      await admin.supabase
        .from("legal_documents")
        .update({ is_current: false, status: "archived", archived_at: new Date().toISOString(), archived_by: admin.user.id })
        .eq("document_type", document.document_type)
        .eq("status", "published")
        .eq("is_current", true);

      const { data, error } = await admin.supabase
        .from("legal_documents")
        .update({
          status: "published",
          is_current: true,
          effective_at: effectiveAt,
          published_at: new Date().toISOString(),
          published_by: admin.user.id,
          publish_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", context.params.id)
        .eq("status", "draft")
        .select("*")
        .single();
      if (error) throw error;

      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email ?? null },
        action: "publish_legal_document",
        module: "settings",
        targetType: "legal_document",
        targetId: context.params.id,
        targetLabel: `${document.document_type} ${document.version}`,
        result: "success",
        afterSummary: { document_type: document.document_type, version: document.version, effective_at: effectiveAt, reason },
      });
      revalidateLegalDocumentsCache();
      return json({ document: data });
    }

    if (action === "archive") {
      if (document.status !== "published") return json({ error: "只有已发布协议可以归档。" }, 409);
      const { data, error } = await admin.supabase
        .from("legal_documents")
        .update({ status: "archived", is_current: false, archived_at: new Date().toISOString(), archived_by: admin.user.id, updated_at: new Date().toISOString() })
        .eq("id", context.params.id)
        .neq("id", "00000000-0000-0000-0000-000000000000")
        .select("*")
        .single();
      if (error) throw error;

      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email ?? null },
        action: "archive_legal_document",
        module: "settings",
        targetType: "legal_document",
        targetId: context.params.id,
        targetLabel: `${document.document_type} ${document.version}`,
        result: "success",
      });
      revalidateLegalDocumentsCache();
      return json({ document: data });
    }

    return json({ error: "不支持的协议操作。" }, 400);
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: action || "legal_document_action",
      module: "settings",
      targetType: "legal_document",
      targetId: context.params.id,
      result: "failed",
      errorMessage: normalizeLegalError(error),
    });
    return json({ error: normalizeLegalError(error, "协议操作失败。") }, 500);
  }
}
