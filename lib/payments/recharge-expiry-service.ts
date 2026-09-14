import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { shouldExpireLiuhaoyiRecharge } from "@/lib/payments/recharge-expiry.mjs";

const ACTIVE_SESSION_STATUSES = ["pending", "processing"];

export async function expireOverdueLiuhaoyiRecharges(
  service: SupabaseClient,
  input: { userId?: string; rechargeNo?: string } = {},
) {
  let query = service
    .from("account_recharges")
    .select("id,recharge_no,channel,channel_code,status,expires_at")
    .in("status", ["pending", "waiting_payment", "processing"])
    .not("expires_at", "is", null);

  if (input.userId) query = query.eq("user_id", input.userId);
  if (input.rechargeNo) query = query.eq("recharge_no", input.rechargeNo);

  const { data, error } = await query.limit(input.rechargeNo ? 1 : 100);
  if (error) throw error;

  const overdue = (data ?? []).filter((row) => shouldExpireLiuhaoyiRecharge(row));
  if (overdue.length === 0) return 0;

  const rechargeIds = overdue.map((row) => String(row.id));
  const expiredAt = new Date().toISOString();
  const { error: rechargeError } = await service
    .from("account_recharges")
    .update({ status: "expired", error_summary: "充值订单已过期" })
    .in("id", rechargeIds)
    .in("status", ["pending", "waiting_payment", "processing"]);
  if (rechargeError) throw rechargeError;

  const { error: sessionError } = await service
    .from("payment_sessions")
    .update({ status: "expired", closed_at: expiredAt, last_error: "充值订单已过期" })
    .eq("business_type", "recharge")
    .in("business_id", rechargeIds)
    .in("status", ACTIVE_SESSION_STATUSES);
  if (sessionError) throw sessionError;

  return rechargeIds.length;
}
