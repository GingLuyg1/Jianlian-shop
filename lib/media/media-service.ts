import "server-only";

import { createHash, randomUUID } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type MediaPurpose = "product" | "sku" | "category" | "logo" | "favicon" | "announcement" | "avatar" | "misc";
type MediaOwnerType = "product" | "sku" | "category" | "site_setting" | "profile" | "announcement" | "unassigned";

type UploadMediaInput = {
  file: File;
  purpose: MediaPurpose;
  ownerType?: MediaOwnerType;
  ownerId?: string | null;
  altText?: string | null;
  admin: Pick<User, "id" | "email">;
};

export type MediaAssetRow = Record<string, any>;

const PUBLIC_BUCKETS = new Set(["public-assets", "product-images", "avatars"]);
const PURPOSE_BUCKET: Record<MediaPurpose, string> = {
  product: "product-images",
  sku: "product-images",
  category: "public-assets",
  logo: "public-assets",
  favicon: "public-assets",
  announcement: "public-assets",
  avatar: "avatars",
  misc: "public-assets",
};

const PURPOSE_PREFIX: Record<MediaPurpose, string> = {
  product: "products",
  sku: "skus",
  category: "categories",
  logo: "site/logo",
  favicon: "site/favicon",
  announcement: "announcements",
  avatar: "avatars",
  misc: "misc",
};

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const ALLOWED_MIME = new Set(Object.keys(MIME_EXTENSION));
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BATCH_COUNT = 10;

export function mediaInitError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  if (/schema cache|PGRST205|42P01|relation .*media_assets|Could not find/i.test(message)) {
    return "媒体资源表尚未初始化，请先执行媒体系统 migration。";
  }
  if (/Bucket not found|bucket/i.test(message)) return "Storage Bucket 尚未配置，请按文档在 Supabase Storage 中创建对应 Bucket。";
  return "媒体资源操作失败，请稍后重试。";
}

function assertSafePurpose(value: unknown): MediaPurpose {
  const purpose = typeof value === "string" ? value.trim() : "misc";
  if (["product", "sku", "category", "logo", "favicon", "announcement", "avatar", "misc"].includes(purpose)) return purpose as MediaPurpose;
  return "misc";
}

export function normalizeMediaPurpose(value: unknown) {
  return assertSafePurpose(value);
}

export function normalizeOwnerType(value: unknown): MediaOwnerType {
  const ownerType = typeof value === "string" ? value.trim() : "unassigned";
  if (["product", "sku", "category", "site_setting", "profile", "announcement", "unassigned"].includes(ownerType)) return ownerType as MediaOwnerType;
  return "unassigned";
}

function detectMime(buffer: Buffer, declaredType?: string) {
  if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return "image/x-icon";
  return declaredType && ALLOWED_MIME.has(declaredType) ? declaredType : null;
}

function readPngSize(buffer: Buffer) {
  if (buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifSize(buffer: Buffer) {
  if (buffer.length < 10) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readJpegSize(buffer: Buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpSize(buffer: Buffer) {
  const type = buffer.toString("ascii", 12, 16);
  if (type === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (type === "VP8 " && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (type === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function readImageSize(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return readPngSize(buffer);
  if (mimeType === "image/jpeg") return readJpegSize(buffer);
  if (mimeType === "image/webp") return readWebpSize(buffer);
  if (mimeType === "image/gif") return readGifSize(buffer);
  if (mimeType === "image/x-icon" || mimeType === "image/vnd.microsoft.icon") return { width: null, height: null };
  return null;
}

export async function validateImageFile(file: File) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("请选择要上传的图片文件。");
  if (file.size <= 0) throw new Error("不能上传空文件。");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("图片不能超过 5MB。");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = detectMime(buffer, file.type);
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) throw new Error("仅支持 JPEG、PNG、WebP、GIF 或 ICO 图片。");
  const dimensions = readImageSize(buffer, mimeType);
  if (!dimensions) throw new Error("图片尺寸读取失败，请更换标准图片文件。");
  if (dimensions.width !== null && dimensions.height !== null && (dimensions.width <= 0 || dimensions.height <= 0)) {
    throw new Error("图片尺寸异常，请更换图片。");
  }
  return {
    buffer,
    mimeType,
    fileSize: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
    extension: MIME_EXTENSION[mimeType] ?? "bin",
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}

export function assertUploadBatchLimit(files: File[]) {
  if (files.length > MAX_BATCH_COUNT) throw new Error(`单次最多上传 ${MAX_BATCH_COUNT} 个文件。`);
}

function datePrefix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "/");
}

function publicUrlFor(client: SupabaseClient, bucket: string, path: string) {
  if (!PUBLIC_BUCKETS.has(bucket)) return null;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

export async function uploadMediaAsset(input: UploadMediaInput) {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端 Storage Key 未配置，暂不能上传媒体资源。");

  const purpose = assertSafePurpose(input.purpose);
  const ownerType = normalizeOwnerType(input.ownerType);
  const validation = await validateImageFile(input.file);
  const bucket = PURPOSE_BUCKET[purpose];
  const storagePath = `${PURPOSE_PREFIX[purpose]}/${datePrefix()}/${randomUUID()}.${validation.extension}`;

  const { error: uploadError } = await service.storage.from(bucket).upload(storagePath, validation.buffer, {
    contentType: validation.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw new Error(mediaInitError(uploadError));

  const publicUrl = publicUrlFor(service, bucket, storagePath);
  const row = {
    owner_type: ownerType,
    owner_id: input.ownerId || null,
    bucket,
    storage_path: storagePath,
    public_url: publicUrl,
    original_name: sanitizeOriginalName(input.file.name),
    mime_type: validation.mimeType,
    file_size: validation.fileSize,
    width: validation.width,
    height: validation.height,
    checksum: validation.checksum,
    alt_text: input.altText?.trim() || null,
    status: input.ownerId ? "active" : "unused",
    uploaded_by: input.admin.id,
  };

  const { data, error } = await service.from("media_assets").insert(row).select("*").single();
  if (error) {
    await service.storage.from(bucket).remove([storagePath]).catch(() => undefined);
    throw new Error(mediaInitError(error));
  }
  return data as MediaAssetRow;
}

function sanitizeOriginalName(name: string) {
  return name.replace(/[\\/\0\r\n]/g, "_").slice(0, 180) || "upload";
}

export async function listMediaAssets(client: SupabaseClient, params: URLSearchParams) {
  const page = Math.max(Number(params.get("page") ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(params.get("pageSize") ?? 30), 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = client
    .from("media_assets")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  const ownerType = params.get("ownerType");
  const mimeType = params.get("mimeType");
  const status = params.get("status");
  const uploadedBy = params.get("uploadedBy");
  const start = params.get("start");
  const end = params.get("end");
  if (ownerType && ownerType !== "all") query = query.eq("owner_type", ownerType);
  if (mimeType && mimeType !== "all") query = query.ilike("mime_type", `${mimeType}%`);
  if (status && status !== "all") query = query.eq("status", status);
  if (uploadedBy) query = query.eq("uploaded_by", uploadedBy);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lte("created_at", end);
  const { data, error, count } = await query;
  if (error) throw new Error(mediaInitError(error));
  return { assets: data ?? [], total: count ?? 0, page, pageSize };
}

export async function scanMediaReferences(client: SupabaseClient, asset: MediaAssetRow) {
  const url = String(asset.public_url ?? "");
  const refs: Array<{ type: string; count: number }> = [];
  if (!url) return refs;
  const checks: Array<[string, PromiseLike<{ count: number | null; error: any }>]> = [
    ["products.image_url", client.from("products").select("id", { count: "exact", head: true }).eq("image_url", url)],
    ["product_skus.image_url", client.from("product_skus").select("id", { count: "exact", head: true }).eq("image_url", url)],
    ["categories.icon", client.from("categories").select("id", { count: "exact", head: true }).eq("icon", url)],
    ["profiles.avatar_url", client.from("profiles").select("id", { count: "exact", head: true }).eq("avatar_url", url)],
    ["site_settings.setting_value", client.from("site_settings").select("id", { count: "exact", head: true }).ilike("setting_value", `%${url}%`)],
  ];
  for (const [type, promise] of checks) {
    try {
      const { count, error } = await promise;
      if (!error && (count ?? 0) > 0) refs.push({ type, count: count ?? 0 });
    } catch {
      // Optional tables should not break media reference checks.
    }
  }
  return refs;
}

export async function updateMediaAssetStatus(client: SupabaseClient, assetId: string, status: "active" | "unused" | "archived" | "deleted" | "failed") {
  const { data, error } = await client.from("media_assets").update({ status, updated_at: new Date().toISOString() }).eq("id", assetId).select("*").single();
  if (error) throw new Error(mediaInitError(error));
  return data as MediaAssetRow;
}

export async function markMediaReferenceByUrl(client: SupabaseClient, url: string | null | undefined, ownerType: MediaOwnerType, ownerId: string) {
  if (!url || !ownerId) return;
  const patch = { owner_type: ownerType, owner_id: ownerId, status: "active", updated_at: new Date().toISOString() };
  try {
    await client.from("media_assets").update(patch).eq("public_url", url);
    await client.from("media_assets").update(patch).eq("storage_path", url);
  } catch {
    // Media tracking is additive. Product/category save must not fail only because migration has not been applied yet.
  }
}

