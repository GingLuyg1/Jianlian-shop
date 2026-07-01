import "server-only";

import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";

export const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

export async function requireRiskAdmin() {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin;
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { ok: false as const, response: NextResponse.json({ error: "仅超级管理员可以访问风险审核中心。" }, { status: 403 }) };
  }
  return admin;
}

export function normalizeRiskError(error: unknown, fallback = "风险数据读取失败，请稍后重试。") {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  if (/risk_events|risk_reviews|schema cache|Could not find the table|42P01|PGRST205/i.test(message)) {
    return "风险事件表尚未初始化，请先手动执行 risk control migration。";
  }
  if (/permission|policy|forbidden|unauthorized/i.test(message)) return "无权限访问风险数据。";
  return message.trim() || fallback;
}

export function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
