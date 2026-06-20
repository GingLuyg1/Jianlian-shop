import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  readAdminSettings,
  saveAdminSettings,
} from "@/lib/settings/server";
import type { AdminSiteSettings } from "@/lib/settings/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const result = await readAdminSettings(admin.supabase);
  return NextResponse.json(result);
}

export async function PATCH(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { settings?: Partial<AdminSiteSettings> }
    | null;

  if (!body?.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "缺少要保存的配置" }, { status: 400 });
  }

  const saved = await saveAdminSettings(admin.supabase, admin.user.id, body.settings);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  const result = await readAdminSettings(admin.supabase);
  return NextResponse.json({
    ...result,
    message: "系统设置已保存",
  });
}
