import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PROMOTION_COMMISSION_RATE } from "@/lib/promotion";

/**
 * Best-effort sync of referral commission for a paid order via the DB RPC.
 * Never throws to block canonical payment completion.
 */
export async function syncOrderReferralCommissionSafe(
  service: SupabaseClient,
  orderId: string,
  commissionRate = PROMOTION_COMMISSION_RATE
) {
  if (!orderId) return;
  try {
    const { error } = await service.rpc("sync_referral_commission_for_order", {
      p_order_id: orderId,
      p_commission_rate: commissionRate,
    });
    if (error) {
      console.warn("[PromotionCommission] sync skipped/failed", {
        orderId,
        code: error.code ?? null,
        message: error.message ?? "",
      });
    }
  } catch (err) {
    console.warn("[PromotionCommission] unexpected error", {
      orderId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
