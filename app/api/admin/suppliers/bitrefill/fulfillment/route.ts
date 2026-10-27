import { NextResponse } from "next/server";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { readBitrefillFulfillment } from "@/lib/admin/bitrefill-fulfillment.mjs";

export const dynamic = "force-dynamic";
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function GET(request: Request) {
  // Least privilege: purchase costs and internal identifiers are super-admin only.
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);
  const raw = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,3}$/.test(raw)) return json({ error: "页码无效" }, 400);
  const client = getSupabaseServiceRoleClient();
  if (!client) return json({ error: "后台只读连接尚未配置" }, 503);
  try { return json(await readBitrefillFulfillment(client, Number(raw))); }
  catch { return json({ error: "采购记录暂不可用；数据库或权限可能尚未准备完成", code: "BITREFILL_ADMIN_READ_UNAVAILABLE" }, 503); }
}
