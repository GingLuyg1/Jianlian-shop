import { NextResponse } from "next/server";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getPersonalCatalogManager } from "@/lib/providers/bitrefill/catalog-server";
import { saveBitrefillSkuBinding } from "@/lib/providers/core/admin-sku-binding.mjs";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
export const dynamic = "force-dynamic";
async function readInput(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw Error("BINDING_INPUT_REQUIRED");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try { for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 12000) { void reader.cancel().catch(() => {}); throw Error("BINDING_BODY_TOO_LARGE"); }
    chunks.push(value);
  } } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sameOrigin(request: Request) {
  try {
    const supplied = request.headers.get("origin"); if (!supplied) return false;
    const origin = new URL(supplied), host = request.headers.get("host") ?? new URL(request.url).host;
    return ["http:", "https:"].includes(origin.protocol) && supplied === origin.origin && origin.host === host &&
      request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}
export async function POST(request: Request, { params }: { params: { productId: string } }) {
  const admin = await getServerSuperAdminContext();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: "同源管理请求必需" }, { status: 403, headers });
  try {
    const input = await readInput(request);
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.website_sku_id !== "string") throw Error("BINDING_INPUT_INVALID");
    const service = getSupabaseServiceRoleClient(); if (!service) throw Error("BINDING_DATABASE_UNAVAILABLE");
    const result = await saveBitrefillSkuBinding({ service, productId: params.productId, input, catalog: getPersonalCatalogManager(), actor: admin.user.id });
    const audit = await writeAdminAuditLog({ request, admin: { id: admin.user.id }, action: "bind_bitrefill_supplier_sku_candidate",
      module: "products", targetType: "product_sku", targetId: input.website_sku_id, result: "success",
      afterSummary: { supplier: "bitrefill", binding_version: result.candidate.supplier_binding_version, automatic_purchase: false, candidate_only: true } });
    return NextResponse.json({ ...result, auditMirrored: audit.ok }, { headers });
  } catch (e) {
    const message = (e as Error)?.message;
    return NextResponse.json({ error: "绑定草稿未保存；请核对参数或重新打开 SKU", code: /^BINDING_[A-Z0-9_]+$/.test(message ?? "") ? message : "BINDING_SAVE_UNAVAILABLE" }, { status: 409, headers });
  }
}
