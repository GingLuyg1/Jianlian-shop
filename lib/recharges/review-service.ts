import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { canTransitionRecharge, normalizeRechargeStatus, type RechargeFlowStatus } from "@/lib/recharges/status-machine";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type RechargeReviewAction = "start_review" | "approve" | "reject" | "request_more_proof" | "cancel" | "retry_credit";

type ReviewInput = { rechargeId: string; action: RechargeReviewAction; adminId: string; reason: string; requestId?: string };

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  if (/amount|金额/i.test(message)) return "充值金额校验失败，未执行入账。";
  if (/currency|币种/i.test(message)) return "充值币种校验失败，未执行入账。";
  if (/status|状态/i.test(message)) return "当前充值状态不允许执行入账。";
  return "充值入账失败，请核对记录后重试。";
}

async function appendEvent(service: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await service.from("recharge_review_events").insert(row);
  if (error) console.error("[RechargeReview] event write failed", { code: error.code });
}

function safeCreditFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  if (/amount|金额/i.test(message)) return "充值金额校验失败，未执行入账。";
  if (/currency|币种/i.test(message)) return "充值币种校验失败，未执行入账。";
  if (/status|状态/i.test(message)) return "当前充值状态不允许执行入账。";
  return "充值入账失败，请核对记录后重试。";
}

export async function processRechargeReview(input: ReviewInput) {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端可信凭据未配置，无法处理充值审核。");
  const requestId = input.requestId || randomUUID();
  const { data: recharge, error: readError } = await service.from("account_recharges").select("*").eq("id", input.rechargeId).maybeSingle();
  if (readError) throw readError;
  if (!recharge) throw new Error("充值申请不存在。");
  const current = normalizeRechargeStatus(recharge.status);
  if (current === "succeeded") return { recharge, idempotent: true, requestId };

  let target: RechargeFlowStatus;
  if (input.action === "start_review") target = "reviewing";
  else if (input.action === "approve" || input.action === "retry_credit") target = "approved";
  else if (input.action === "reject") target = "rejected";
  else if (input.action === "request_more_proof") target = "submitted";
  else target = "cancelled";

  if (input.action === "retry_credit" && !["approved", "processing", "failed"].includes(current)) throw new Error("当前充值状态不允许重新入账。");
  if (input.action !== "retry_credit" && !canTransitionRecharge(current, target)) throw new Error("当前充值状态不允许执行该操作。");
  if (["approve", "reject", "request_more_proof", "cancel"].includes(input.action) && !input.reason.trim()) throw new Error("请填写操作原因。");

  if (input.action === "approve" || input.action === "retry_credit") {
    const transactionReference = String(recharge.transaction_reference ?? recharge.provider_trade_no ?? "").trim();
    if (!transactionReference) throw new Error("缺少真实交易流水号，不能确认入账。");
    const { error: markError } = await service.from("account_recharges").update({ status: "approved", approved_at: recharge.approved_at ?? new Date().toISOString(), reviewed_at: new Date().toISOString(), reviewed_by: input.adminId, review_reason: input.reason.trim() || "重新处理入账", exception_type: null, error_summary: null }).eq("id", input.rechargeId).in("status", [String(recharge.status), "approved", "processing", "failed"]);
    if (markError) throw markError;
    await appendEvent(service, { recharge_id: recharge.id, recharge_no: recharge.recharge_no, actor_user_id: input.adminId, actor_type: "admin", action: input.action, from_status: current, to_status: "approved", reason: input.reason, request_id: requestId });
    await service.from("account_recharges").update({ status: "processing" }).eq("id", input.rechargeId).eq("status", "approved");
    try {
      const { data: creditResult, error: creditError } = await service.rpc("complete_account_recharge", { p_recharge_id: recharge.id, p_provider_transaction_id: transactionReference, p_paid_amount: Number(recharge.payable_amount ?? recharge.amount), p_currency: recharge.currency ?? "CNY" });
      if (creditError) throw creditError;
      await service.from("account_recharges").update({ status: "succeeded", completed_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), reviewed_by: input.adminId, exception_type: null, error_summary: null }).eq("id", input.rechargeId).in("status", ["paid", "processing", "approved"]);
      await appendEvent(service, { recharge_id: recharge.id, recharge_no: recharge.recharge_no, actor_user_id: input.adminId, actor_type: "system", action: "credit_succeeded", from_status: "processing", to_status: "succeeded", request_id: requestId, metadata: { idempotent: Boolean((creditResult as { alreadyCompleted?: unknown })?.alreadyCompleted) } });
      const { data: latest } = await service.from("account_recharges").select("*").eq("id", recharge.id).single();
      return { recharge: latest, idempotent: Boolean((creditResult as { alreadyCompleted?: unknown })?.alreadyCompleted), requestId };
    } catch (error) {
      const message = safeCreditFailureMessage(error);
      await service.from("account_recharges").update({ status: "approved", exception_type: "credit_failed", error_summary: message }).eq("id", input.rechargeId).neq("status", "succeeded");
      await appendEvent(service, { recharge_id: recharge.id, recharge_no: recharge.recharge_no, actor_user_id: input.adminId, actor_type: "system", action: "credit_failed", from_status: "processing", to_status: "approved", request_id: requestId, reason: message });
      throw new Error(message);
    }
  }

  const timestamp = new Date().toISOString();
  const patch: Record<string, unknown> = { status: target, reviewed_at: timestamp, reviewed_by: input.adminId, review_reason: input.reason.trim() || null };
  if (target === "reviewing") patch.reviewing_at = timestamp;
  if (target === "rejected") patch.rejected_at = timestamp;
  if (target === "cancelled") patch.cancelled_at = timestamp;
  const { data, error } = await service.from("account_recharges").update(patch).eq("id", input.rechargeId).eq("status", recharge.status).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("充值状态已变化，请刷新后重试。");
  await appendEvent(service, { recharge_id: recharge.id, recharge_no: recharge.recharge_no, actor_user_id: input.adminId, actor_type: "admin", action: input.action, from_status: current, to_status: target, reason: input.reason, request_id: requestId });
  return { recharge: data, idempotent: false, requestId };
}
