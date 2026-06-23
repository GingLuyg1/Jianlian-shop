import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
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
    await writeAdminAuditLog({
      request,
      action: "update_settings",
      module: "settings",
      targetType: "site_settings",
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { settings?: Partial<AdminSiteSettings> }
    | null;

  if (!body?.settings || typeof body.settings !== "object") {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_settings",
      module: "settings",
      targetType: "site_settings",
      result: "failed",
      errorCode: "invalid_settings_payload",
      errorMessage: "缺少要保存的配置",
    });
    return NextResponse.json({ error: "缺少要保存的配置" }, { status: 400 });
  }

  const saved = await saveAdminSettings(admin.supabase, admin.user.id, body.settings);
  if (!saved.ok) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_settings",
      module: "settings",
      targetType: "site_settings",
      result: "failed",
      errorMessage: saved.error,
      afterSummary: {
        changed_keys: Object.keys(body.settings),
      },
    });
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  const result = await readAdminSettings(admin.supabase);
  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "update_settings",
    module: "settings",
    targetType: "site_settings",
    result: "success",
    afterSummary: {
      changed_keys: Object.keys(body.settings),
    },
  });

  return NextResponse.json({
    ...result,
    message: "系统设置已保存",
  });
}
