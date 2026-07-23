import "server-only";

import {
  addBep20UnderpaymentDecimal,
  multiplyBep20UnderpaymentDecimalToCny,
  readBep20UnderpaymentConfirmations,
  subtractBep20UnderpaymentDecimal,
  summarizeBep20UnderpaymentSessionId,
} from "@/lib/payments/bep20-underpayment-runtime.mjs";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminBep20UnderpaymentPreview = {
  sessionId: string;
  sessionIdSummary: string;
  orderId: string;
  orderNo: string;
  userIdSummary: string;
  expectedUsdt: string;
  receivedUsdt: string;
  shortfallUsdt: string;
  exchangeRate: string;
  creditedCny: string;
  balanceBefore: string;
  balanceAfter: string;
  orderStatus: string;
  orderPaymentStatus: string;
  paymentSessionStatus: string;
  chainSessionStatus: string;
  confirmationCount: number | null;
  requiredConfirmations: number;
  confirmedAt: string | null;
  expiresAt: string | null;
  txHash: string | null;
  txHashSummary: string | null;
  chainId: number | null;
  tokenContractSummary: string | null;
  receiveAddressSummary: string | null;
  blockTimestamp: string | null;
  evidenceCreatedAt: string | null;
  inventoryState: {
    reservedCount: number;
    released: boolean;
  };
  dispositionState: {
    exists: boolean;
    disposition: string | null;
    processedAt: string | null;
    transactionNo: string | null;
    requestId: string | null;
  };
  claimCount: number;
  transactionCount: number;
  eligible: boolean;
  blockingReasons: string[];
  expectedResult: "wallet_credit_and_cancel" | "already_settled" | "blocked";
  idempotencyState: "not_settled" | "already_settled";
};

type Row = Record<string, unknown>;

function serviceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("BEP20_UNDERPAYMENT_SERVICE_ROLE_NOT_CONFIGURED");
  return service;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

function mask(value: unknown, left = 6, right = 4) {
  const valueText = text(value).trim();
  if (!valueText) return null;
  if (valueText.length <= left + right + 3) return valueText;
  return `${valueText.slice(0, left)}...${valueText.slice(-right)}`;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function earliestDeadline(values: Array<unknown>) {
  const timestamps = values.map((value) => Date.parse(text(value)));
  if (timestamps.some((value) => !Number.isFinite(value))) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

function queryError(error: unknown, fallback: string): never {
  const code = text((error as { code?: unknown } | null)?.code);
  if (/PGRST202|PGRST205|42P01|42703|42883/.test(code)) {
    throw new Error("BEP20_UNDERPAYMENT_MIGRATION_REQUIRED");
  }
  throw new Error(fallback);
}

async function maybeSingle(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  fallback: string,
) {
  const { data, error } = await query;
  if (error) queryError(error, fallback);
  return data && typeof data === "object" ? data as Row : null;
}

async function countRows(
  query: PromiseLike<{ count: number | null; error: unknown }>,
  fallback: string,
) {
  const { count, error } = await query;
  if (error) queryError(error, fallback);
  return count ?? 0;
}

async function buildPreview(chain: Row): Promise<AdminBep20UnderpaymentPreview> {
  const service = serviceClient();
  const sessionId = text(chain.id);
  const orderId = text(chain.order_id);
  const paymentSessionId = text(chain.payment_session_id);
  const paymentId = text(chain.payment_id);
  const requiredConfirmations = readBep20UnderpaymentConfirmations(
    process.env.BSC_REQUIRED_CONFIRMATIONS,
  );

  const [
    order,
    paymentSession,
    orderPayment,
    transaction,
    disposition,
    claimCount,
    transactionCount,
    reservedCount,
  ] = await Promise.all([
    maybeSingle(
      service
        .from("orders")
        .select("id,order_no,user_id,status,payment_status,total_amount,currency,payment_method,payment_expires_at,reservation_released_at")
        .eq("id", orderId)
        .maybeSingle(),
      "BEP20_UNDERPAYMENT_ORDER_READ_FAILED",
    ),
    maybeSingle(
      service
        .from("payment_sessions")
        .select("id,business_id,user_id,status,payable_amount,currency,expires_at")
        .eq("id", paymentSessionId)
        .maybeSingle(),
      "BEP20_UNDERPAYMENT_PAYMENT_SESSION_READ_FAILED",
    ),
    maybeSingle(
      service
        .from("order_payments")
        .select("id,order_id,user_id,payment_session_id,status,payable_amount,received_amount,payable_currency,received_currency")
        .eq("id", paymentId)
        .maybeSingle(),
      "BEP20_UNDERPAYMENT_ORDER_PAYMENT_READ_FAILED",
    ),
    maybeSingle(
      service
        .from("chain_transactions")
        .select("id,chain_payment_session_id,order_id,tx_hash,log_index,token_contract,to_address,normalized_amount,confirmation_count,block_number,block_timestamp,created_at,status")
        .eq("chain_payment_session_id", sessionId)
        .limit(1)
        .maybeSingle(),
      "BEP20_UNDERPAYMENT_TRANSACTION_READ_FAILED",
    ),
    maybeSingle(
      service
        .from("bep20_underpayment_dispositions")
        .select("id,chain_session_id,order_id,user_id,balance_transaction_id,received_usdt,expected_usdt,shortfall_usdt,exchange_rate,credited_cny,disposition,settlement_source,processed_at,request_id")
        .eq("chain_session_id", sessionId)
        .maybeSingle(),
      "BEP20_UNDERPAYMENT_DISPOSITION_READ_FAILED",
    ),
    countRows(
      service
        .from("chain_transaction_claims")
        .select("id", { count: "exact", head: true })
        .eq("chain_payment_session_id", sessionId),
      "BEP20_UNDERPAYMENT_CLAIM_READ_FAILED",
    ),
    countRows(
      service
        .from("chain_transactions")
        .select("id", { count: "exact", head: true })
        .eq("chain_payment_session_id", sessionId),
      "BEP20_UNDERPAYMENT_TRANSACTION_READ_FAILED",
    ),
    countRows(
      service
        .from("digital_inventory")
        .select("id", { count: "exact", head: true })
        .eq("reserved_order_id", orderId)
        .eq("status", "reserved"),
      "BEP20_UNDERPAYMENT_INVENTORY_READ_FAILED",
    ),
  ]);

  const profile = order
    ? await maybeSingle(
        service.from("profiles").select("id,balance").eq("id", text(order.user_id)).maybeSingle(),
        "BEP20_UNDERPAYMENT_PROFILE_READ_FAILED",
      )
    : null;
  const balanceTransaction = disposition?.balance_transaction_id
    ? await maybeSingle(
        service
          .from("balance_transactions")
          .select("id,transaction_no,balance_before,balance_after")
          .eq("id", text(disposition.balance_transaction_id))
          .maybeSingle(),
        "BEP20_UNDERPAYMENT_BALANCE_TRANSACTION_READ_FAILED",
      )
    : null;

  const expectedUsdt = text(chain.expected_amount);
  const receivedUsdt = text(chain.confirmed_amount);
  let shortfallUsdt = "0";
  let creditedCny = "0";
  let balanceBefore = text(balanceTransaction?.balance_before ?? profile?.balance ?? "0");
  let balanceAfter = text(balanceTransaction?.balance_after ?? balanceBefore);
  const blockingReasons: string[] = [];

  try {
    shortfallUsdt = subtractBep20UnderpaymentDecimal(expectedUsdt, receivedUsdt);
    creditedCny = disposition
      ? text(disposition.credited_cny)
      : multiplyBep20UnderpaymentDecimalToCny(receivedUsdt, chain.exchange_rate);
    balanceAfter = disposition
      ? text(balanceTransaction?.balance_after ?? balanceBefore)
      : addBep20UnderpaymentDecimal(balanceBefore, creditedCny);
  } catch {
    blockingReasons.push("金额或汇率快照无效");
  }

  const deadline = earliestDeadline([
    order?.payment_expires_at,
    paymentSession?.expires_at,
    chain.expires_at,
  ]);
  const confirmationCount = numberOrNull(transaction?.confirmation_count);
  const blockTimestamp = nullableText(transaction?.block_timestamp);

  if (disposition) {
    blockingReasons.push("该链上会话已经完成处置");
  } else {
    if (!order || !paymentSession || !orderPayment) blockingReasons.push("订单支付关联不完整");
    if (text(chain.status) !== "underpaid") blockingReasons.push("链上会话不是欠额状态");
    if (chain.manual_review_decision !== null && chain.manual_review_decision !== undefined) {
      blockingReasons.push("链上会话已经存在人工审核决策");
    }
    if (!chain.confirmed_at) blockingReasons.push("链上确认时间缺失");
    if (text(order?.status) !== "pending_payment" || text(order?.payment_status) !== "unpaid") {
      blockingReasons.push("订单状态不允许欠额结算");
    }
    if (!["pending", "processing"].includes(text(paymentSession?.status))) {
      blockingReasons.push("支付会话状态不允许欠额结算");
    }
    if (text(orderPayment?.status) !== "under_review") {
      blockingReasons.push("订单支付记录不是审核中状态");
    }
    if (claimCount !== 1 || transactionCount !== 1) blockingReasons.push("链上证据数量不唯一");
    if (confirmationCount === null || confirmationCount < requiredConfirmations) {
      blockingReasons.push("链上确认数不足");
    }
    if (!deadline) {
      blockingReasons.push("付款截止时间不完整");
    } else if (!blockTimestamp || Date.parse(blockTimestamp) > Date.parse(deadline)) {
      blockingReasons.push("链上转账时间晚于付款截止时间");
    }
  }

  return {
    sessionId,
    sessionIdSummary: summarizeBep20UnderpaymentSessionId(sessionId),
    orderId,
    orderNo: text(order?.order_no),
    userIdSummary: summarizeBep20UnderpaymentSessionId(text(order?.user_id)),
    expectedUsdt,
    receivedUsdt,
    shortfallUsdt,
    exchangeRate: text(chain.exchange_rate),
    creditedCny,
    balanceBefore,
    balanceAfter,
    orderStatus: text(order?.status),
    orderPaymentStatus: text(orderPayment?.status),
    paymentSessionStatus: text(paymentSession?.status),
    chainSessionStatus: text(chain.status),
    confirmationCount,
    requiredConfirmations,
    confirmedAt: nullableText(chain.confirmed_at),
    expiresAt: deadline,
    txHash: nullableText(chain.submitted_tx_hash),
    txHashSummary: mask(chain.submitted_tx_hash, 10, 8),
    chainId: numberOrNull(chain.chain_id),
    tokenContractSummary: mask(chain.token_contract),
    receiveAddressSummary: mask(chain.receive_address),
    blockTimestamp,
    evidenceCreatedAt: nullableText(transaction?.created_at),
    inventoryState: {
      reservedCount,
      released: Boolean(order?.reservation_released_at),
    },
    dispositionState: {
      exists: Boolean(disposition),
      disposition: nullableText(disposition?.disposition),
      processedAt: nullableText(disposition?.processed_at),
      transactionNo: nullableText(balanceTransaction?.transaction_no),
      requestId: nullableText(disposition?.request_id),
    },
    claimCount,
    transactionCount,
    eligible: blockingReasons.length === 0,
    blockingReasons,
    expectedResult: disposition
      ? "already_settled"
      : blockingReasons.length === 0
        ? "wallet_credit_and_cancel"
        : "blocked",
    idempotencyState: disposition ? "already_settled" : "not_settled",
  };
}

export async function getAdminBep20UnderpaymentPreview(sessionId: string) {
  const service = serviceClient();
  const chain = await maybeSingle(
    service
      .from("chain_payment_sessions")
      .select("id,order_id,payment_session_id,payment_id,network,chain_id,asset,token_contract,token_decimals,order_currency,order_amount,payment_currency,exchange_rate,expected_amount,expected_raw_amount,receive_address,status,expires_at,submitted_tx_hash,confirmed_amount,confirmed_raw_amount,confirmed_at,manual_review_decision,created_at")
      .eq("id", sessionId)
      .maybeSingle(),
    "BEP20_UNDERPAYMENT_SESSION_READ_FAILED",
  );
  if (!chain) return null;
  return buildPreview(chain);
}

export async function listAdminBep20Underpayments(limit = 50) {
  const service = serviceClient();
  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 50, 100));
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select("id,order_id,payment_session_id,payment_id,network,chain_id,asset,token_contract,token_decimals,order_currency,order_amount,payment_currency,exchange_rate,expected_amount,expected_raw_amount,receive_address,status,expires_at,submitted_tx_hash,confirmed_amount,confirmed_raw_amount,confirmed_at,manual_review_decision,created_at")
    .eq("payment_method", "usdt_bep20")
    .eq("status", "underpaid")
    .order("confirmed_at", { ascending: false })
    .limit(safeLimit);
  if (error) queryError(error, "BEP20_UNDERPAYMENT_LIST_FAILED");
  return Promise.all(((data ?? []) as Row[]).map(buildPreview));
}
