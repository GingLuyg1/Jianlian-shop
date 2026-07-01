import { NextResponse } from "next/server";

import { listPublishedLegalDocuments } from "@/lib/legal/legal-service";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
  }
  try {
    const documents = await listPublishedLegalDocuments(getSupabaseServerClient());
    return NextResponse.json({ documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String((error as { message?: unknown })?.message ?? "");
    const missing = /legal_documents|schema cache|Could not find|42P01|PGRST205/i.test(message);
    return NextResponse.json(
      { error: missing ? "协议版本表尚未初始化，请管理员执行 legal documents migration。" : "协议读取失败，请稍后重试" },
      { status: missing ? 503 : 500 }
    );
  }
}
