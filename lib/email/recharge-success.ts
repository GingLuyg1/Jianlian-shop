import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createEmailIdempotencyKey, queueBusinessEmail } from "./jobs";
import { queueRechargeSuccessEmailRuntime } from "./recharge-success-runtime.mjs";

type RechargeSuccessSource = "recharge_review" | "bep20_scanner" | string;

type RechargeSuccessRow = {
  id: string;
  recharge_no: string;
  user_id: string;
  status: string;
  credited_amount: string | number | null;
  currency: string | null;
};

function warnRechargeSuccessEmail(code: string, context: { rechargeId?: string | null; reason: string }) {
  console.warn("[email][recharge_success]", code, context);
}

export async function queueRechargeSuccessEmailBestEffort(
  rechargeId: string,
  source: RechargeSuccessSource,
) {
  const normalizedRechargeId = rechargeId.trim();
  if (!normalizedRechargeId) {
    warnRechargeSuccessEmail("missing_recharge_id", { rechargeId: null, reason: "missing_recharge_id" });
    return { ok: true as const, queued: false as const, skipped: "missing_recharge_id" };
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    warnRechargeSuccessEmail("service_role_unavailable", {
      rechargeId: normalizedRechargeId,
      reason: "service_role_unavailable",
    });
    return { ok: true as const, queued: false as const, skipped: "service_role_unavailable" };
  }

  try {
    const rechargeResult = await supabase
      .from("account_recharges")
      .select("id,recharge_no,user_id,status,credited_amount,currency")
      .eq("id", normalizedRechargeId)
      .maybeSingle();

    if (rechargeResult.error || !rechargeResult.data) {
      warnRechargeSuccessEmail("recharge_lookup_failed", {
        rechargeId: normalizedRechargeId,
        reason: "recharge_lookup_failed",
      });
      return { ok: true as const, queued: false as const, skipped: "recharge_lookup_failed" };
    }

    const recharge = rechargeResult.data as RechargeSuccessRow;
    if (!["paid", "succeeded"].includes(String(recharge.status))) {
      return { ok: true as const, queued: false as const, skipped: "recharge_not_credited" };
    }

    const userId = String(recharge.user_id ?? "").trim();
    if (!userId) {
      warnRechargeSuccessEmail("missing_user_id", {
        rechargeId: normalizedRechargeId,
        reason: "missing_user_id",
      });
      return { ok: true as const, queued: false as const, skipped: "missing_user_id" };
    }

    const authUser = await supabase.auth.admin.getUserById(userId);
    const recipientEmail = authUser.data.user?.email?.trim() ?? "";
    if (authUser.error || !recipientEmail) {
      warnRechargeSuccessEmail("trusted_recipient_lookup_failed", {
        rechargeId: normalizedRechargeId,
        reason: "trusted_recipient_lookup_failed",
      });
      return { ok: true as const, queued: false as const, skipped: "trusted_recipient_lookup_failed" };
    }

    return await queueRechargeSuccessEmailRuntime(
      {
        userId,
        recipientEmail,
        rechargeId: recharge.id,
        rechargeNo: recharge.recharge_no,
        creditedAmount: recharge.credited_amount,
        currency: recharge.currency,
        source,
      },
      {
        queue: queueBusinessEmail,
        createIdempotencyKey: createEmailIdempotencyKey,
        warn: warnRechargeSuccessEmail,
      },
    );
  } catch {
    warnRechargeSuccessEmail("best_effort_failed", {
      rechargeId: normalizedRechargeId,
      reason: "best_effort_failed",
    });
    return { ok: true as const, queued: false as const, error: "best_effort_failed" };
  }
}
