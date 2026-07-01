import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const COMPENSATION_STATUSES = ["pending", "retrying", "manual_review", "resolved", "cancelled"] as const;
export const COMPENSATION_BUSINESS_TYPES = [
  "product",
  "order",
  "payment",
  "recharge",
  "refund",
  "balance",
  "delivery",
  "inventory",
  "system",
] as const;

export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number];

export type CompensationFilters = {
  businessType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export type CompensationAction = "mark_manual_review" | "mark_resolved" | "mark_cancelled";

const STATUS_SET = new Set<string>(COMPENSATION_STATUSES);
const BUSINESS_TYPE_SET = new Set<string>(COMPENSATION_BUSINESS_TYPES);

function clampPage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function clampPageSize(value?: number) {
  if (!Number.isFinite(value) || !value) return 20;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

function isMissingTable(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return /business_compensation_tasks|schema cache|Could not find the table/i.test(message) || ["42P01", "42703", "PGRST205"].includes(code);
}

export function normalizeCompensationError(error: unknown) {
  if (isMissingTable(error)) {
    return "补偿任务表尚未初始化，请管理员执行事务补偿 migration。";
  }
  return "补偿任务读取失败，请稍后重试。";
}

export async function listCompensationTasks(filters: CompensationFilters) {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return { tasks: [], count: 0, error: "SUPABASE_SERVICE_ROLE_KEY 未配置，无法读取补偿任务。" };
  }

  const page = clampPage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = service
    .from("business_compensation_tasks")
    .select(
      "id,business_type,business_id,business_no,operation,failure_stage,status,retryable,attempts,next_retry_at,error_code,error_summary,request_id,resolved_by,resolution_note,created_at,updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all" && STATUS_SET.has(filters.status)) {
    query = query.eq("status", filters.status);
  }

  if (filters.businessType && filters.businessType !== "all" && BUSINESS_TYPE_SET.has(filters.businessType)) {
    query = query.eq("business_type", filters.businessType);
  }

  const { data, error, count } = await query;
  if (error) {
    return { tasks: [], count: 0, error: normalizeCompensationError(error) };
  }

  return { tasks: data ?? [], count: count ?? 0, error: null };
}

export async function updateCompensationTaskStatus(input: {
  taskId: string;
  action: CompensationAction;
  adminId: string;
  reason: string;
}) {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY 未配置，无法处理补偿任务。" };
  }

  const reason = input.reason.trim();
  if (reason.length < 4) {
    return { ok: false, error: "请填写至少 4 个字符的处理原因。" };
  }
  if (reason.length > 300) {
    return { ok: false, error: "处理原因不能超过 300 个字符。" };
  }

  const nextStatusByAction: Record<CompensationAction, CompensationStatus> = {
    mark_manual_review: "manual_review",
    mark_resolved: "resolved",
    mark_cancelled: "cancelled",
  };
  const nextStatus = nextStatusByAction[input.action];

  const loaded = await service
    .from("business_compensation_tasks")
    .select("id,status,business_type,business_id,business_no,operation")
    .eq("id", input.taskId)
    .maybeSingle();

  if (loaded.error) {
    return { ok: false, error: normalizeCompensationError(loaded.error) };
  }
  if (!loaded.data) {
    return { ok: false, error: "补偿任务不存在或已被处理。" };
  }
  if (["resolved", "cancelled"].includes(String(loaded.data.status))) {
    return { ok: false, error: "已结束的补偿任务不能重复处理。" };
  }

  const updated = await service
    .from("business_compensation_tasks")
    .update({
      status: nextStatus,
      resolved_by: ["resolved", "cancelled"].includes(nextStatus) ? input.adminId : null,
      resolution_note: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.taskId)
    .select("id,status,business_type,business_id,business_no,operation,failure_stage,error_code,error_summary,request_id,updated_at")
    .single();

  if (updated.error) {
    return { ok: false, error: normalizeCompensationError(updated.error) };
  }

  return { ok: true, task: updated.data, before: loaded.data };
}
