import { NextResponse } from "next/server";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { readBitrefillAftercare } from "@/lib/admin/bitrefill-aftercare.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const admin = await getServerSuperAdminContext();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status, headers });
  const page = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,3}$/.test(page)) return NextResponse.json({ error: "页码无效" }, { status: 400, headers });
  const client = getSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ error: "后台读取连接尚未配置" }, { status: 503, headers });
  try { return NextResponse.json(await readBitrefillAftercare(client, Number(page)), { headers }); }
  catch { return NextResponse.json({ error: "异常记录暂不可用；数据库或权限可能尚未准备完成" }, { status: 503, headers }); }
}
