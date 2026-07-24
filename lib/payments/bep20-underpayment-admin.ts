import "server-only";

import {
  addBep20UnderpaymentDecimal,
  multiplyBep20UnderpaymentDecimalToCny,
  readBep20UnderpaymentConfirmations,
  subtractBep20UnderpaymentDecimal,
  summarizeBep20UnderpaymentSessionId,
} from "@/lib/payments/bep20-underpayment-runtime.mjs";
import {
  compareUnsignedDecimal,
  evaluateAdminUnderpaymentEligibility,
  rawAmountMatchesDecimal,
} from "@/lib/payments/bep20-underpayment-admin-runtime.mjs";
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
  inventoryState: { reservedCount: number; released: boolean };
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
  automaticEligible: boolean;
  manualEligible: boolean;
  manualBeforeDeadline: boolean;
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

function normalized(value: unknown) {
  return text(value).trim().toLowerCase();
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

function earliestDeadline(values: unknown[]) {
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

async function rows(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  fallback: string,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) queryError(error, fallback);
  return Array.isArray(data) ? data as Row[] : [];
}

function by(rowsToIndex: Row[], field: string) {
  return new Map(rowsToIndex.map((row) => [text(row[field]), row]));
}

function grouped(rowsToIndex: Row[], field: string) {
  const map = new Map<string, Row[]>();
  for (const row of rowsToIndex) {
    const key = normalized(row[field]);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function exact(left: unknown, right: unknown) {
  return compareUnsignedDecimal(left, right) === 0;
}

function positive(value: unknown) {
  return compareUnsignedDecimal(value, "0") === 1;
}

async function buildPreviews(chains: Row[], includeFullTxHash: boolean) {
  if (chains.length === 0) return [];
  const service = serviceClient();
  const sessionIds = unique(chains.map((row) => text(row.id)));
  const orderIds = unique(chains.map((row) => text(row.order_id)));
  const paymentSessionIds = unique(chains.map((row) => text(row.payment_session_id)));
  const paymentIds = unique(chains.map((row) => text(row.payment_id)));
  const txHashes = unique(chains.map((row) => normalized(row.submitted_tx_hash)));

  // One authority RPC plus eight bulk reads. There are no per-record requests.
  const [
    authorityRows,
    orderRows,
    paymentSessionRows,
    orderPaymentRows,
    transactionRows,
    claimRows,
    dispositionRows,
    inventoryRows,
  ] = await Promise.all([
    rows(
      service.rpc("list_expirable_bep20_underpayments", { p_limit: 200 }),
      "BEP20_UNDERPAYMENT_AUTHORITY_READ_FAILED",
    ),
    rows(
      service.from("orders")
        .select("id,order_no,user_id,status,payment_status,total_amount,currency,payment_method,payment_expires_at,reservation_released_at")
        .in("id", orderIds),
      "BEP20_UNDERPAYMENT_ORDER_READ_FAILED",
    ),
    rows(
      service.from("payment_sessions")
        .select("id,business_id,user_id,status,payable_amount,currency,expires_at,business_type,business_no,channel_code,network,wallet_address,provider_transaction_id")
        .in("id", paymentSessionIds),
      "BEP20_UNDERPAYMENT_PAYMENT_SESSION_READ_FAILED",
    ),
    rows(
      service.from("order_payments")
        .select("id,order_id,user_id,payment_session_id,status,payable_amount,received_amount,payable_currency,received_currency,transaction_reference,provider_trade_no,payment_method,network,amount,order_amount,currency,order_currency")
        .in("id", paymentIds),
      "BEP20_UNDERPAYMENT_ORDER_PAYMENT_READ_FAILED",
    ),
    rows(
      service.from("chain_transactions")
        .select("id,chain_payment_session_id,order_id,chain_id,tx_hash,log_index,token_contract,to_address,raw_amount,normalized_amount,confirmation_count,block_number,block_timestamp,created_at,status")
        .in("tx_hash", txHashes),
      "BEP20_UNDERPAYMENT_TRANSACTION_READ_FAILED",
    ),
    rows(
      service.from("chain_transaction_claims")
        .select("chain_id,tx_hash,order_id,chain_payment_session_id,claimed_at")
        .in("tx_hash", txHashes),
      "BEP20_UNDERPAYMENT_CLAIM_READ_FAILED",
    ),
    rows(
      service.from("bep20_underpayment_dispositions")
        .select("id,chain_session_id,order_id,user_id,balance_transaction_id,received_usdt,expected_usdt,shortfall_usdt,exchange_rate,credited_cny,disposition,settlement_source,processed_at,request_id")
        .in("chain_session_id", sessionIds),
      "BEP20_UNDERPAYMENT_DISPOSITION_READ_FAILED",
    ),
    rows(
      service.from("digital_inventory")
        .select("id,reserved_order_id,status")
        .in("reserved_order_id", orderIds),
      "BEP20_UNDERPAYMENT_INVENTORY_READ_FAILED",
    ),
  ]);

  const ordersById = by(orderRows, "id");
  const userIds = unique(orderRows.map((row) => text(row.user_id)));
  const profiles = await rows(
    service.from("profiles").select("id,balance").in("id", userIds),
    "BEP20_UNDERPAYMENT_PROFILE_READ_FAILED",
  );
  const dispositionBySession = by(dispositionRows, "chain_session_id");
  const balanceTransactionIds = unique(
    dispositionRows.map((row) => text(row.balance_transaction_id)),
  );
  const balanceTransactions = balanceTransactionIds.length > 0
    ? await rows(
        service.from("balance_transactions")
          .select("id,transaction_no,balance_before,balance_after")
          .in("id", balanceTransactionIds),
        "BEP20_UNDERPAYMENT_BALANCE_TRANSACTION_READ_FAILED",
      )
    : [];

  const paymentSessionsById = by(paymentSessionRows, "id");
  const orderPaymentsById = by(orderPaymentRows, "id");
  const profilesById = by(profiles, "id");
  const balanceTransactionsById = by(balanceTransactions, "id");
  const transactionsByHash = grouped(transactionRows, "tx_hash");
  const claimsByHash = grouped(claimRows, "tx_hash");
  const inventoryByOrder = grouped(inventoryRows, "reserved_order_id");
  const authorityIds = new Set(
    authorityRows.map((row) => text(row.session_id ?? row.id ?? row.chain_session_id)),
  );
  const requiredConfirmations = readBep20UnderpaymentConfirmations(
    process.env.BSC_REQUIRED_CONFIRMATIONS,
  );

  return chains.map((chain): AdminBep20UnderpaymentPreview => {
    const sessionId = text(chain.id);
    const orderId = text(chain.order_id);
    const order = ordersById.get(orderId) ?? null;
    const paymentSession = paymentSessionsById.get(text(chain.payment_session_id)) ?? null;
    const orderPayment = orderPaymentsById.get(text(chain.payment_id)) ?? null;
    const profile = order ? profilesById.get(text(order.user_id)) ?? null : null;
    const disposition = dispositionBySession.get(sessionId) ?? null;
    const balanceTransaction = disposition
      ? balanceTransactionsById.get(text(disposition.balance_transaction_id)) ?? null
      : null;
    const txHash = normalized(chain.submitted_tx_hash);
    const matchingTransactions = transactionsByHash.get(txHash) ?? [];
    const matchingClaims = claimsByHash.get(txHash) ?? [];
    const transaction = matchingTransactions.length === 1 ? matchingTransactions[0] : null;
    const claim = matchingClaims.length === 1 ? matchingClaims[0] : null;
    const inventory = inventoryByOrder.get(normalized(orderId)) ?? [];
    const reservedCount = inventory.filter((row) => text(row.status) === "reserved").length;
    const deadline = earliestDeadline([
      order?.payment_expires_at,
      paymentSession?.expires_at,
      chain.expires_at,
    ]);
    const providerReference = transaction
      ? `${txHash}:${text(transaction.log_index)}`
      : "";
    const expectedUsdt = text(chain.expected_amount);
    const receivedUsdt = text(chain.confirmed_amount);
    let shortfallUsdt = "0";
    let creditedCny = "0";
    const balanceBefore = text(balanceTransaction?.balance_before ?? profile?.balance ?? "0");
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

    if (disposition) {
      blockingReasons.push("该链上会话已经完成处置");
    } else {
      if (!order || !paymentSession || !orderPayment) blockingReasons.push("订单支付关联不完整");
      if (!profile) blockingReasons.push("用户余额资料不存在");
      if (text(chain.status) !== "underpaid") blockingReasons.push("链上会话不是欠额状态");
      if (chain.manual_review_decision !== null && chain.manual_review_decision !== undefined) {
        blockingReasons.push("链上会话已有人工审核决定");
      }
      if (!chain.confirmed_at) blockingReasons.push("链上确认时间缺失");
      if (normalized(chain.network) !== "bep20" || numberOrNull(chain.chain_id) !== 56) {
        blockingReasons.push("链或网络快照不匹配");
      }
      if (
        normalized(chain.asset) !== "usdt"
        || normalized(chain.payment_currency) !== "usdt"
        || normalized(chain.order_currency) !== "cny"
        || numberOrNull(chain.token_decimals) !== 18
      ) {
        blockingReasons.push("币种或精度快照不匹配");
      }
      if (!positive(chain.exchange_rate)) blockingReasons.push("冻结汇率无效");
      if (
        !positive(receivedUsdt)
        || compareUnsignedDecimal(receivedUsdt, expectedUsdt) !== -1
        || !positive(chain.confirmed_raw_amount)
        || compareUnsignedDecimal(chain.confirmed_raw_amount, chain.expected_raw_amount) !== -1
      ) {
        blockingReasons.push("欠额金额快照无效");
      }
      if (
        text(order?.status) !== "pending_payment"
        || text(order?.payment_status) !== "unpaid"
        || normalized(order?.currency) !== "cny"
        || normalized(order?.payment_method) !== "usdt_bep20"
        || !positive(order?.total_amount)
      ) {
        blockingReasons.push("订单状态或人民币快照不匹配");
      }
      if (
        text(paymentSession?.business_id) !== orderId
        || text(paymentSession?.user_id) !== text(order?.user_id)
        || text(paymentSession?.business_no) !== text(order?.order_no)
        || text(paymentSession?.business_type) !== "order"
        || !["pending", "processing"].includes(text(paymentSession?.status))
        || normalized(paymentSession?.channel_code) !== "usdt_bep20"
        || normalized(paymentSession?.network) !== "bep20"
        || normalized(paymentSession?.wallet_address) !== normalized(chain.receive_address)
      ) {
        blockingReasons.push("支付会话归属或快照不匹配");
      }
      if (
        text(orderPayment?.order_id) !== orderId
        || text(orderPayment?.user_id) !== text(order?.user_id)
        || text(orderPayment?.payment_session_id) !== text(paymentSession?.id)
        || text(orderPayment?.status) !== "under_review"
        || normalized(orderPayment?.payment_method) !== "usdt_bep20"
        || normalized(orderPayment?.network) !== "bep20"
        || normalized(orderPayment?.currency) !== "cny"
        || normalized(orderPayment?.order_currency) !== "cny"
      ) {
        blockingReasons.push("订单支付记录归属或状态不匹配");
      }
      if (
        !exact(chain.order_amount, order?.total_amount)
        || !exact(paymentSession?.payable_amount, expectedUsdt)
        || !exact(orderPayment?.payable_amount, expectedUsdt)
        || !exact(orderPayment?.received_amount, receivedUsdt)
        || !exact(orderPayment?.amount, order?.total_amount)
        || !exact(orderPayment?.order_amount, order?.total_amount)
        || normalized(paymentSession?.currency) !== "usdt"
        || normalized(orderPayment?.payable_currency) !== "usdt"
        || normalized(orderPayment?.received_currency) !== "usdt"
      ) {
        blockingReasons.push("支付金额快照不匹配");
      }
      if (matchingClaims.length !== 1 || !claim
        || numberOrNull(claim.chain_id) !== 56
        || normalized(claim.tx_hash) !== txHash
        || text(claim.order_id) !== orderId
        || text(claim.chain_payment_session_id) !== sessionId) {
        blockingReasons.push("TxHash claim 不唯一或归属不匹配");
      }
      if (matchingTransactions.length !== 1 || !transaction
        || numberOrNull(transaction.chain_id) !== 56
        || normalized(transaction.tx_hash) !== txHash
        || text(transaction.order_id) !== orderId
        || text(transaction.chain_payment_session_id) !== sessionId
        || numberOrNull(transaction.log_index) === null
        || Number(transaction.log_index) < 0
        || normalized(transaction.token_contract) !== normalized(chain.token_contract)
        || normalized(transaction.to_address) !== normalized(chain.receive_address)
        || !exact(transaction.raw_amount, chain.confirmed_raw_amount)
        || !exact(transaction.normalized_amount, receivedUsdt)
        || normalized(transaction.status) !== "underpaid") {
        blockingReasons.push("链上交易证据不唯一或快照不匹配");
      }
      if (
        !rawAmountMatchesDecimal(chain.confirmed_raw_amount, receivedUsdt, chain.token_decimals)
        || !rawAmountMatchesDecimal(chain.expected_raw_amount, expectedUsdt, chain.token_decimals)
      ) {
        blockingReasons.push("链上原始金额与标准化金额不匹配");
      }
      const confirmationCount = numberOrNull(transaction?.confirmation_count);
      if (confirmationCount === null || confirmationCount < requiredConfirmations) {
        blockingReasons.push("链上确认数不足");
      }
      const blockTimestamp = nullableText(transaction?.block_timestamp);
      if (!deadline) {
        blockingReasons.push("付款截止时间不完整");
      } else if (!blockTimestamp || Date.parse(blockTimestamp) > Date.parse(deadline)) {
        blockingReasons.push("链上转账晚于付款截止时间");
      }
      const paymentProviderRef = normalized(paymentSession?.provider_transaction_id);
      const transactionReference = normalized(orderPayment?.transaction_reference);
      const providerTradeNo = normalized(orderPayment?.provider_trade_no);
      const allowedRefs = new Set(["", txHash, providerReference]);
      if (
        !allowedRefs.has(paymentProviderRef)
        || !allowedRefs.has(transactionReference)
        || !allowedRefs.has(providerTradeNo)
      ) {
        blockingReasons.push("支付提供方交易引用不匹配");
      }
      if (
        compareUnsignedDecimal(balanceBefore, "0") === -1
        || compareUnsignedDecimal(balanceAfter, "9999999999.99") === 1
      ) {
        blockingReasons.push("用户余额超出数据库安全范围");
      }
      if (!positive(creditedCny)) blockingReasons.push("折算人民币金额小于最小记账单位");
      if (order?.reservation_released_at) blockingReasons.push("订单库存已释放");
    }

    const expired = Boolean(deadline && Date.now() > Date.parse(deadline));
    const eligibility = evaluateAdminUnderpaymentEligibility({
      expired,
      authorityCandidate: authorityIds.has(sessionId),
      checks: Object.fromEntries(blockingReasons.map((reason) => [reason, false])),
    });
    const confirmationCount = numberOrNull(transaction?.confirmation_count);
    const blockTimestamp = nullableText(transaction?.block_timestamp);
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
      txHash: includeFullTxHash ? nullableText(chain.submitted_tx_hash) : null,
      txHashSummary: mask(chain.submitted_tx_hash, 10, 8),
      chainId: numberOrNull(chain.chain_id),
      tokenContractSummary: mask(chain.token_contract),
      receiveAddressSummary: mask(chain.receive_address),
      blockTimestamp,
      evidenceCreatedAt: nullableText(transaction?.created_at),
      inventoryState: { reservedCount, released: Boolean(order?.reservation_released_at) },
      dispositionState: {
        exists: Boolean(disposition),
        disposition: nullableText(disposition?.disposition),
        processedAt: nullableText(disposition?.processed_at),
        transactionNo: nullableText(balanceTransaction?.transaction_no),
        requestId: nullableText(disposition?.request_id),
      },
      claimCount: matchingClaims.length,
      transactionCount: matchingTransactions.length,
      eligible: eligibility.manualEligible,
      automaticEligible: eligibility.automaticEligible,
      manualEligible: eligibility.manualEligible,
      manualBeforeDeadline: eligibility.manualBeforeDeadline,
      blockingReasons,
      expectedResult: disposition
        ? "already_settled"
        : blockingReasons.length === 0
          ? "wallet_credit_and_cancel"
          : "blocked",
      idempotencyState: disposition ? "already_settled" : "not_settled",
    };
  });
}

const CHAIN_SELECT = "id,order_id,payment_session_id,payment_id,network,chain_id,asset,token_contract,token_decimals,order_currency,order_amount,payment_currency,exchange_rate,expected_amount,expected_raw_amount,receive_address,status,expires_at,submitted_tx_hash,confirmed_amount,confirmed_raw_amount,confirmed_at,manual_review_decision,created_at";

export async function getAdminBep20UnderpaymentPreview(sessionId: string) {
  const service = serviceClient();
  const chainRows = await rows(
    service.from("chain_payment_sessions").select(CHAIN_SELECT).eq("id", sessionId).limit(1),
    "BEP20_UNDERPAYMENT_SESSION_READ_FAILED",
  );
  if (chainRows.length === 0) return null;
  return (await buildPreviews(chainRows, true))[0] ?? null;
}

export async function listAdminBep20Underpayments(limit = 50) {
  const service = serviceClient();
  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 50, 100));
  const chains = await rows(
    service.from("chain_payment_sessions")
      .select(CHAIN_SELECT)
      .eq("payment_method", "usdt_bep20")
      .eq("status", "underpaid")
      .order("confirmed_at", { ascending: false })
      .limit(safeLimit),
    "BEP20_UNDERPAYMENT_LIST_FAILED",
  );
  return buildPreviews(chains, false);
}
