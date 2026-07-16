import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { revalidateSiteSettingsCache } from "@/lib/cache/cache-tags";

export const dynamic = "force-dynamic";

const TYPES = new Set(["info", "warning", "success", "important"]);
const PLACEMENTS = new Set(["global_top", "home", "checkout", "account"]);

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function announcementError(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? "");
  if (/announcements|schema cache|Could not find|42P01|PGRST205/i.test(message)) return "公告表尚未初始化，请先执行系统设置 migration。";
  return "公告操作失败，请稍后重试。";
}

export async function GET() {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);
  const { data, error } = await admin.supabase.from("announcements").select("id,title,content,announcement_type,is_enabled,starts_at,ends_at,sort_order,placement,created_at,updated_at").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) return json({ error: announcementError(error) }, 500);
  return json({ announcements: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, admin.status);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = cleanText(body?.action, 30);
  try {
    if (action === "create" || action === "update") {
      const title = cleanText(body?.title, 120);
      const content = cleanText(body?.content, 2000);
      const announcementType = cleanText(body?.announcementType, 30) || "info";
      const placement = cleanText(body?.placement, 30) || "global_top";
      const startsAt = optionalDate(body?.startsAt);
      const endsAt = optionalDate(body?.endsAt);
      const sortOrder = Number(body?.sortOrder ?? 100);
      if (!title || !content) return json({ error: "请填写公告标题和内容。" }, 400);
      if (!TYPES.has(announcementType) || !PLACEMENTS.has(placement)) return json({ error: "公告类型或展示位置无效。" }, 400);
      if (startsAt === undefined || endsAt === undefined) return json({ error: "公告时间格式无效。" }, 400);
      if (startsAt && endsAt && startsAt >= endsAt) return json({ error: "公告结束时间必须晚于开始时间。" }, 400);
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return json({ error: "公告排序必须是 0 到 9999 的整数。" }, 400);
      const row = { title, content, announcement_type: announcementType, placement, is_enabled: body?.isEnabled === true, starts_at: startsAt, ends_at: endsAt, sort_order: sortOrder, updated_by: admin.user.id };
      const id = cleanText(body?.id, 80);
      if (action === "update" && !id) return json({ error: "公告 ID 无效。" }, 400);
      const query = action === "create" ? admin.supabase.from("announcements").insert({ ...row, created_by: admin.user.id }) : admin.supabase.from("announcements").update(row).eq("id", id);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: action === "create" ? "announcement_create" : "announcement_update", targetType: "announcement", targetId: data.id, targetLabel: title, result: "success", afterSummary: { title, announcementType, placement, isEnabled: row.is_enabled, startsAt, endsAt, sortOrder } });
      revalidateSiteSettingsCache();
      return json({ announcement: data });
    }
    if (action === "toggle") {
      const id = cleanText(body?.id, 80);
      if (!id) return json({ error: "公告 ID 无效。" }, 400);
      const isEnabled = body?.isEnabled === true;
      const { data, error } = await admin.supabase.from("announcements").update({ is_enabled: isEnabled, updated_by: admin.user.id }).eq("id", id).select("*").single();
      if (error) throw error;
      await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: isEnabled ? "announcement_enable" : "announcement_disable", targetType: "announcement", targetId: id, targetLabel: data.title, result: "success" });
      revalidateSiteSettingsCache();
      return json({ announcement: data });
    }
    return json({ error: "不支持的公告操作。" }, 400);
  } catch (error) {
    const message = announcementError(error);
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, module: "settings", action: action || "announcement_action", targetType: "announcement", result: "failed", errorMessage: message });
    return json({ error: message }, 500);
  }
}
