import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import {
  assertUploadBatchLimit,
  listMediaAssets,
  mediaInitError,
  normalizeMediaPurpose,
  normalizeOwnerType,
  scanMediaReferences,
  updateMediaAssetStatus,
  uploadMediaAsset,
} from "@/lib/media/media-service";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireSuperAdmin(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin;
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "media_access",
      module: "system",
      result: "denied",
      errorMessage: "仅超级管理员可以管理媒体资源",
    });
    return { ok: false as const, response: json({ error: "仅超级管理员可以管理媒体资源。" }, { status: 403 }) };
  }
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;
  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;
  try {
    const url = new URL(request.url);
    const result = await listMediaAssets(supabase, url.searchParams);
    return json(result);
  } catch (error) {
    return json({ error: mediaInitError(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;

  const sizeError = checkRequestSize(request, 8 * 1024 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("media_upload", getAdminRateLimitKey(admin.user.id, "media_upload"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) return json({ error: "请选择要上传的图片文件。" }, { status: 400 });
    assertUploadBatchLimit(files);

    const purpose = normalizeMediaPurpose(form.get("purpose"));
    const ownerType = normalizeOwnerType(form.get("ownerType"));
    const ownerId = String(form.get("ownerId") ?? "").trim() || null;
    const altText = String(form.get("altText") ?? "").trim() || null;

    const assets = [];
    for (const file of files) {
      const asset = await uploadMediaAsset({ file, purpose, ownerType, ownerId, altText, admin: admin.user });
      assets.push(asset);
    }

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "upload_media",
      module: "system",
      targetType: "media_asset",
      targetLabel: `${purpose}:${assets.length}`,
      result: "success",
      metadata: { purpose, ownerType, ownerId, count: assets.length },
    });

    return json({ assets }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : mediaInitError(error);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "upload_media",
      module: "system",
      result: "failed",
      errorMessage: message,
    });
    return json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;
  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const assetId = String(body.assetId ?? "").trim();
    const action = String(body.action ?? "").trim();
    if (!assetId) return json({ error: "缺少媒体资源 ID。" }, { status: 400 });

    const { data: asset, error } = await supabase.from("media_assets").select("*").eq("id", assetId).maybeSingle();
    if (error) throw error;
    if (!asset) return json({ error: "媒体资源不存在。" }, { status: 404 });

    const references = await scanMediaReferences(supabase, asset);
    if ((action === "archive" || action === "delete") && references.length > 0) {
      return json({ error: "该资源仍被业务引用，不能归档或删除。", references }, { status: 409 });
    }

    const nextStatus = action === "delete" ? "deleted" : action === "archive" ? "archived" : action === "mark_unused" ? "unused" : null;
    if (!nextStatus) return json({ error: "不支持的媒体操作。" }, { status: 400 });
    const updated = await updateMediaAssetStatus(supabase, assetId, nextStatus);

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: `media_${action}`,
      module: "system",
      targetType: "media_asset",
      targetId: assetId,
      targetLabel: String(asset.original_name ?? asset.storage_path ?? assetId),
      result: "success",
      beforeSummary: { status: asset.status, bucket: asset.bucket, storagePath: asset.storage_path },
      afterSummary: { status: updated.status },
      metadata: { references },
    });

    return json({ asset: updated, references });
  } catch (error) {
    const message = mediaInitError(error);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "media_update",
      module: "system",
      result: "failed",
      errorMessage: message,
    });
    return json({ error: message }, { status: 500 });
  }
}
