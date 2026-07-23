import "server-only";

import type { Bep20UnderpaymentWalletCreditSummary } from "@/lib/orders/order-types";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function maskTxHash(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 22 ? `${text.slice(0, 12)}...${text.slice(-8)}` : text || null;
}

export async function getUserBep20UnderpaymentWalletCredit(
  orderId: string,
  userId: string,
): Promise<Bep20UnderpaymentWalletCreditSummary | null> {
  const service = getSupabaseServiceRoleClient();
  if (!service) return null;

  const { data: disposition, error } = await service
    .from("bep20_underpayment_dispositions")
    .select("chain_session_id,order_id,user_id,balance_transaction_id,received_usdt,expected_usdt,shortfall_usdt,exchange_rate,credited_cny,disposition,processed_at")
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .eq("disposition", "wallet_credit")
    .maybeSingle();
  if (error || !disposition) return null;

  const [transactionResult, chainResult] = await Promise.all([
    service
      .from("balance_transactions")
      .select("transaction_no")
      .eq("id", disposition.balance_transaction_id)
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("chain_payment_sessions")
      .select("submitted_tx_hash")
      .eq("id", disposition.chain_session_id)
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);

  return {
    disposition: "wallet_credit",
    received_usdt: String(disposition.received_usdt ?? "0"),
    expected_usdt: String(disposition.expected_usdt ?? "0"),
    shortfall_usdt: String(disposition.shortfall_usdt ?? "0"),
    exchange_rate: String(disposition.exchange_rate ?? "0"),
    credited_cny: String(disposition.credited_cny ?? "0"),
    processed_at: String(disposition.processed_at ?? ""),
    transaction_no: transactionResult.data?.transaction_no
      ? String(transactionResult.data.transaction_no)
      : null,
    tx_hash_summary: maskTxHash(chainResult.data?.submitted_tx_hash),
  };
}

