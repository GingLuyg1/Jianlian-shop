import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getVerifiedMerchantCostsForOrderCore} from "./verified-merchant-costs-core.mjs";

export type VerifiedBalanceMerchantCosts=Readonly<{
  source:"verified_payment_costs";orderId:string;settlementKind:"balance_ledger";
  settlementId:string;transactionNo:string;provider:"internal_balance";currency:"CNY";
  paymentFee:"0.000000";otherFees:"0.000000";costScope:"order_settlement_only";checkedAt:string;
}>;
export async function getVerifiedMerchantCostsForOrder(
  service:SupabaseClient,orderId:string,
):Promise<VerifiedBalanceMerchantCosts> {
  return getVerifiedMerchantCostsForOrderCore(service,orderId);
}
