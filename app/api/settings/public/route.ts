import { NextResponse } from "next/server";

import { readPublicSettings } from "@/lib/settings/server";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { DEFAULT_PUBLIC_SETTINGS, type PublicAnnouncement } from "@/lib/settings/types";

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
  const now = new Date().toISOString();
  const announcementsResult = await supabase
    .from("announcements")
    .select("id,title,content,announcement_type,placement,starts_at,ends_at,sort_order")
    .eq("is_enabled", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const announcements = announcementsResult.error
    ? []
    : ((announcementsResult.data ?? []) as PublicAnnouncement[]);

  return NextResponse.json(
    {
      settings: { ...result.settings, announcements },
      needsMigration: result.needsMigration,
      warning: result.error,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
