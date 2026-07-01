import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { hashLegalContent, LEGAL_DOCUMENT_TYPES, listLegalDocuments, normalizeLegalError } from "@/lib/legal/legal-documents";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function cleanText(value: unknown, max = 20000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  try {
    const url = new URL(request.url);
    const documents = await listLegalDocuments(admin.supabase, {
      type: url.searchParams.get("type") ?? "all",
      status: url.searchParams.get("status") ?? "all",
    });
    return json({ documents });
  } catch (error) {
    return json({ error: normalizeLegalError(error) }, 500);
  }
}

export async function POST(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const documentType = cleanText(body?.document_type) as (typeof LEGAL_DOCUMENT_TYPES)[number];
    const title = cleanText(body?.title, 200);
    const version = cleanText(body?.version, 80);
    const content = cleanText(body?.content, 50000);

    if (!LEGAL_DOCUMENT_TYPES.includes(documentType)) return json({ error: "协议类型不正确。" }, 400);
    if (!title) return json({ error: "协议标题不能为空。" }, 400);
    if (!version) return json({ error: "协议版本不能为空。" }, 400);
    if (!content) return json({ error: "协议正文不能为空。" }, 400);

    const { data, error } = await admin.supabase
      .from("legal_documents")
      .insert({
        document_type: documentType,
        title,
        version,
        content,
        content_hash: hashLegalContent(content),
        status: "draft",
        is_current: false,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "create_legal_document_draft",
      module: "settings",
      targetType: "legal_document",
      targetId: String((data as { id?: string }).id ?? ""),
      targetLabel: `${documentType} ${version}`,
      result: "success",
      afterSummary: { document_type: documentType, version, title },
    });

    return json({ document: data }, 201);
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "create_legal_document_draft",
      module: "settings",
      targetType: "legal_document",
      result: "failed",
      errorMessage: normalizeLegalError(error),
    });
    return json({ error: normalizeLegalError(error, "协议草稿创建失败。") }, 500);
  }
}
