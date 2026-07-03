import { NextResponse } from "next/server";

import { readPublicSettings } from "@/lib/settings/server";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { DEFAULT_PUBLIC_SETTINGS } from "@/lib/settings/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      {
        settings: DEFAULT_PUBLIC_SETTINGS,
        warning: "Supabase 环境变量未配置，已使用默认公开配置。",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = getSupabaseServerClient();
  const result = await readPublicSettings(supabase);

  return NextResponse.json(
    {
      settings: result.settings,
      needsMigration: result.needsMigration,
      warning: result.error,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}