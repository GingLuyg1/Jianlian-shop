import "server-only";

import type { Bep20UnderpaymentWalletCreditSummary } from "@/lib/orders/order-types";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type Row = Record<string, unknown>;

export type Bep20UnderpaymentBalanceDispositionSummary =
  Bep20UnderpaymentWalletCreditSummary & {
    order_id: string;
    order_no: string;
  };

function maskTxHash(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 22 ? `${text.slice(0, 12)}...${text.slice(-8)}` : text || null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function getUserBep20UnderpaymentWalletCredits(
  orderIds: string[],
  userId: string,
): Promise<Map<string, Bep20UnderpaymentWalletCreditSummary>> {
  const result = new Map<string, Bep20UnderpaymentWalletCreditSummary>();
  const safeOrderIds = unique(orderIds.map((value) => String(value ?? "").trim()));
  const service = getSupabaseServiceRoleClient();
  if (!service || safeOrderIds.length === 0) return result;

  const { data: dispositionData, error } = await service
    .from("bep20_underpayment_dispositions")
    .select("chain_session_id,order_id,user_id,balance_transaction_id,received_usdt,expected_usdt,shortfall_usdt,exchange_rate,credited_cny,disposition,processed_at")
    .in("order_id", safeOrderIds)
    .eq("user_id", userId)
    .eq("disposition", "wallet_credit");
  if (error) return result;
  const dispositions = (dispositionData ?? []) as Row[];
  if (dispositions.length === 0) return result;

  const balanceIds = unique(dispositions.map((row) => String(row.balance_transaction_id ?? "")));
  const chainIds = unique(dispositions.map((row) => String(row.chain_session_id ?? "")));
  const [transactionResult, chainResult] = await Promise.all([
    service.from("balance_transactions")
      .select("id,user_id,transaction_no")
      .in("id", balanceIds)
      .eq("user_id", userId),
    service.from("chain_payment_sessions")
      .select("id,order_id,submitted_tx_hash")
      .in("id", chainIds)
      .in("order_id", safeOrderIds),
  ]);
  if (transactionResult.error || chainResult.error) return result;

  const transactions = new Map(
    ((transactionResult.data ?? []) as Row[]).map((row) => [String(row.id), row]),
  );
  const chains = new Map(
    ((chainResult.data ?? []) as Row[]).map((row) => [String(row.id), row]),
  );
  for (const disposition of dispositions) {
    const orderId = String(disposition.order_id ?? "");
    const transaction = transactions.get(String(disposition.balance_transaction_id ?? ""));
    const chain = chains.get(String(disposition.chain_session_id ?? ""));
    if (!orderId || !chain || String(chain.order_id ?? "") !== orderId) continue;
    result.set(orderId, {
      disposition: "wallet_credit",
      received_usdt: String(disposition.received_usdt ?? "0"),
      expected_usdt: String(disposition.expected_usdt ?? "0"),
      shortfall_usdt: String(disposition.shortfall_usdt ?? "0"),
      exchange_rate: String(disposition.exchange_rate ?? "0"),
      credited_cny: String(disposition.credited_cny ?? "0"),
      processed_at: String(disposition.processed_at ?? ""),
      transaction_no: transaction?.transaction_no
        ? String(transaction.transaction_no)
        : null,
      tx_hash_summary: maskTxHash(chain.submitted_tx_hash),
    });
  }
  return result;
}

export async function getUserBep20UnderpaymentWalletCredit(
  orderId: string,
  userId: string,
) {
  return (await getUserBep20UnderpaymentWalletCredits([orderId], userId)).get(orderId) ?? null;
}

export async function getUserBep20UnderpaymentBalanceDispositions(
  chainSessionIds: string[],
  userId: string,
): Promise<Map<string, Bep20UnderpaymentBalanceDispositionSummary>> {
  const result = new Map<string, Bep20UnderpaymentBalanceDispositionSummary>();
  const safeChainSessionIds = unique(chainSessionIds.map((value) => String(value ?? "").trim()));
  const service = getSupabaseServiceRoleClient();
  if (!service || safeChainSessionIds.length === 0) return result;

  const { data: dispositionData, error } = await service
    .from("bep20_underpayment_dispositions")
    .select("chain_session_id,order_id,user_id,received_usdt,expected_usdt,shortfall_usdt,exchange_rate,credited_cny,disposition,processed_at")
    .in("chain_session_id", safeChainSessionIds)
    .eq("user_id", userId)
    .eq("disposition", "wallet_credit");
  if (error) return result;

  const dispositions = (dispositionData ?? []) as Row[];
  if (dispositions.length === 0) return result;
  const orderIds = unique(dispositions.map((row) => String(row.order_id ?? "")));
  const [orderResult, chainResult] = await Promise.all([
    service
      .from("orders")
      .select("id,order_no,user_id")
      .in("id", orderIds)
      .eq("user_id", userId),
    service
      .from("chain_payment_sessions")
      .select("id,order_id,submitted_tx_hash")
      .in("id", safeChainSessionIds),
  ]);
  if (orderResult.error || chainResult.error) return result;

  const orders = new Map(
    ((orderResult.data ?? []) as Row[]).map((row) => [String(row.id), row]),
  );
  const chains = new Map(
    ((chainResult.data ?? []) as Row[]).map((row) => [String(row.id), row]),
  );

  for (const disposition of dispositions) {
    const chainSessionId = String(disposition.chain_session_id ?? "");
    const orderId = String(disposition.order_id ?? "");
    const order = orders.get(orderId);
    const chain = chains.get(chainSessionId);
    const orderNo = String(order?.order_no ?? "").trim();
    if (
      !chainSessionId
      || !orderId
      || !orderNo
      || String(disposition.user_id ?? "") !== userId
      || String(order?.user_id ?? "") !== userId
      || String(chain?.order_id ?? "") !== orderId
    ) {
      continue;
    }

    result.set(chainSessionId, {
      disposition: "wallet_credit",
      order_id: orderId,
      order_no: orderNo,
      received_usdt: String(disposition.received_usdt ?? "0"),
      expected_usdt: String(disposition.expected_usdt ?? "0"),
      shortfall_usdt: String(disposition.shortfall_usdt ?? "0"),
      exchange_rate: String(disposition.exchange_rate ?? "0"),
      credited_cny: String(disposition.credited_cny ?? "0"),
      processed_at: String(disposition.processed_at ?? ""),
      transaction_no: null,
      tx_hash_summary: maskTxHash(chain?.submitted_tx_hash),
    });
  }

  return result;
}
