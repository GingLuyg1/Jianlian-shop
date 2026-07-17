import "server-only";

import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkTokenDecimalsWithRpc,
  createSharedAsyncCheck,
  createBep20CompletionInput,
  decideBep20TransferStatus,
  normalizeBep20TxHash,
} from "@/lib/payments/bep20-chain-logic.mjs";
import { completePayment } from "@/lib/payments/complete-payment-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ACTIVE_CHAIN_SESSION_STATUSES = [
  "waiting_payment",
  "submitted",
  "confirming",
  "verified",
  "completing",
  "payment_failed",
  "underpaid",
  "manual_review",
] as const;
const USER_RECOVERY_BLOCKED_STATUSES = ["underpaid", "expired", "manual_review", "payment_failed", "completing"] as const;
const SUPPORTED_PRICING_MODES = ["manual_fixed_rate", "provider_rate"] as const;

type PricingMode = (typeof SUPPORTED_PRICING_MODES)[number];

export class Bep20PaymentError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "Bep20PaymentError";
    this.code = code;
    this.status = status;
  }
}

type Bep20Config = {
  rpcUrl: string;
  chainId: number;
  tokenContract: string;
  tokenDecimals: number;
  receiveAddress: string;
  requiredConfirmations: number;
  expireMinutes: number;
  pricingMode: PricingMode;
  fixedRate: string | null;
  rateTtlSeconds: number;
  amountScale: number;
};

type OrderRow = {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  total_amount: number | string;
  currency: string | null;
};

type ChainSessionRow = {
  id: string;
  order_id: string;
  payment_session_id: string | null;
  payment_id: string | null;
  payment_method: string;
  network: string;
  chain_id: number;
  asset: string;
  token_contract: string;
  token_decimals: number;
  order_currency: string | null;
  order_amount: number | string | null;
  payment_currency: string | null;
  exchange_rate: number | string | null;
  exchange_rate_source: string | null;
  exchange_rate_fetched_at: string | null;
  exchange_rate_expires_at: string | null;
  expected_amount: number | string;
  expected_raw_amount: number | string;
  pricing_status: string | null;
  receive_address: string;
  status: string;
  expires_at: string;
  submitted_tx_hash: string | null;
  confirmed_amount: number | string | null;
  confirmed_raw_amount: number | string | null;
  confirmed_at: string | null;
  last_checked_at: string | null;
  failure_reason: string | null;
  manual_review_reason: string | null;
  manual_review_decision?: string | null;
  manual_review_decided_at?: string | null;
  manual_review_decided_by?: string | null;
  manual_review_decision_reason?: string | null;
  completion_attempt_id?: string | null;
  completion_started_at?: string | null;
  completion_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ReceiptLog = {
  address?: string;
  topics?: string[];
  data?: string;
  logIndex?: string;
  blockNumber?: string;
  blockHash?: string;
};

type TransactionReceipt = {
  transactionHash?: string;
  status?: string;
  blockNumber?: string;
  blockHash?: string;
  logs?: ReceiptLog[];
};

type ParsedTransfer = {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string | null;
  tokenContract: string;
  fromAddress: string;
  toAddress: string;
  rawAmount: bigint;
  normalizedAmount: string;
  confirmations: number;
  blockTimestamp: string;
};

type PricingSnapshot = {
  orderCurrency: string;
  orderAmount: string;
  paymentCurrency: "USDT";
  exchangeRate: string;
  exchangeRateSource: string;
  exchangeRateFetchedAt: string;
  exchangeRateExpiresAt: string;
  expectedAmount: string;
  expectedRawAmount: bigint;
  pricingStatus: "frozen";
};

export type Bep20SessionResponse = {
  orderNo: string;
  network: "BNB Smart Chain (BEP20)";
  chainId: number;
  asset: "USDT";
  orderCurrency: string;
  orderAmount: string;
  paymentCurrency: "USDT";
  exchangeRate: string;
  exchangeRateSource: string;
  exchangeRateFetchedAt: string | null;
  exchangeRateExpiresAt: string | null;
  expectedAmount: string;
  receiveAddress: string;
  expiresAt: string;
  status: string;
  submittedTxHash: string | null;
  requiredConfirmations: number;
  tokenContract: string;
  pricingStatus: string;
};

export type Bep20VerifyResponse = Bep20SessionResponse & {
  txHash: string;
  confirmationCount: number;
  confirmedAmount: string | null;
  message: string;
};

export type AdminBep20ChainPaymentDetail = Bep20SessionResponse & {
  sessionId: string;
  paymentSessionId: string | null;
  paymentId: string | null;
  tokenDecimals: number;
  expectedRawAmount: string;
  confirmedAmount: string | null;
  confirmedRawAmount: string | null;
  confirmedAt: string | null;
  lastCheckedAt: string | null;
  failureReason: string | null;
  manualReviewReason: string | null;
  manualReviewDecision: string | null;
  manualReviewDecisionReason: string | null;
  manualReviewDecidedAt: string | null;
  manualReviewDecidedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  transaction: {
    txHash: string;
    fromAddress: string | null;
    toAddress: string | null;
    blockNumber: string | null;
    blockHash: string | null;
    logIndex: number | null;
    confirmationCount: number | null;
    status: string | null;
    normalizedAmount: string | null;
    tokenContract: string | null;
  } | null;
  explorerUrl: string | null;
};

export function getBep20ConfigStatus() {
  const pricingMode = String(process.env.USDT_PRICING_MODE ?? "").trim();
  const checks = {
    BSC_RPC_URL: checkConfigValue(process.env.BSC_RPC_URL, (value) => isHttpUrl(value)),
    BSC_CHAIN_ID: checkConfigValue(process.env.BSC_CHAIN_ID, (value) => value === "56"),
    BSC_USDT_CONTRACT: checkConfigValue(process.env.BSC_USDT_CONTRACT, (value) => Boolean(normalizeAddress(value))),
    BSC_USDT_DECIMALS: checkConfigValue(process.env.BSC_USDT_DECIMALS, (value) => isIntegerInRange(value, 0, 36)),
    BSC_RECEIVE_ADDRESS: checkConfigValue(process.env.BSC_RECEIVE_ADDRESS, (value) => Boolean(normalizeAddress(value))),
    BSC_REQUIRED_CONFIRMATIONS: checkConfigValue(process.env.BSC_REQUIRED_CONFIRMATIONS, (value) => isIntegerInRange(value, 1, 10_000)),
    BSC_PAYMENT_EXPIRE_MINUTES: checkConfigValue(process.env.BSC_PAYMENT_EXPIRE_MINUTES, (value) => isIntegerInRange(value, 5, 10_080)),
    USDT_PRICING_MODE: checkConfigValue(process.env.USDT_PRICING_MODE, (value) => value === "manual_fixed_rate"),
    CNY_USDT_FIXED_RATE:
      pricingMode === "provider_rate"
        ? { status: "configured" as const }
        : checkConfigValue(process.env.CNY_USDT_FIXED_RATE, (value) => isPositiveDecimal(value)),
    CNY_USDT_RATE_TTL_SECONDS: checkConfigValue(process.env.CNY_USDT_RATE_TTL_SECONDS, (value) => isIntegerInRange(value, 60, 86_400)),
    USDT_AMOUNT_SCALE: checkConfigValue(process.env.USDT_AMOUNT_SCALE, (value) => isIntegerInRange(value, 2, 18)),
  };
  return { checks };
}

const tokenDecimalsCache = new Map<string, { valid: boolean; expiresAt: number }>();
const runSharedDecimalsCheck = createSharedAsyncCheck();

export async function getBep20RuntimeConfigStatus() {
  const base = getBep20ConfigStatus();
  const checks = { ...base.checks };
  if (Object.values(checks).every((check) => check.status === "configured")) {
    try {
      const config = readBep20Config();
      await assertConfiguredTokenDecimals(config);
    } catch {
      checks.BSC_USDT_DECIMALS = { status: "invalid" as const };
    }
  }
  return { checks };
}

function checkConfigValue(value: unknown, validator: (value: string) => boolean) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return { status: "missing" as const };
  return { status: validator(normalized) ? ("configured" as const) : ("invalid" as const) };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isIntegerInRange(value: string, minimum: number, maximum: number) {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum;
}

function isPositiveDecimal(value: string) {
  return /^\d+(\.\d+)?$/.test(value) && decimalToScaled(value, 18) > BigInt(0);
}

export async function createBep20PaymentSession(orderNo: string, userId: string): Promise<Bep20SessionResponse> {
  const service = requiredServiceClient();
  const config = readBep20Config();
  await assertConfiguredTokenDecimals(config);
  const order = await loadOwnedOrder(service, orderNo, userId);
  ensureOrderAllowsBep20(order);

  const existing = await getReusableChainSession(service, order.id);
  if (existing) return toBep20SessionResponse(order.order_no, existing, config);

  const pricing = createPricingSnapshot(order, config);
  const expiresAt = new Date(Date.now() + config.expireMinutes * 60_000).toISOString();
  const paymentSession = await ensurePaymentSession(service, order, config, pricing, expiresAt);
  const orderPaymentId = await ensureOrderPaymentRecord(service, order, paymentSession, pricing);

  const payload = {
    order_id: order.id,
    payment_session_id: paymentSession.id,
    payment_id: orderPaymentId,
    payment_method: "usdt_bep20",
    network: "BEP20",
    chain_id: config.chainId,
    asset: "USDT",
    token_contract: config.tokenContract,
    token_decimals: config.tokenDecimals,
    order_currency: pricing.orderCurrency,
    order_amount: pricing.orderAmount,
    payment_currency: pricing.paymentCurrency,
    exchange_rate: pricing.exchangeRate,
    exchange_rate_source: pricing.exchangeRateSource,
    exchange_rate_fetched_at: pricing.exchangeRateFetchedAt,
    exchange_rate_expires_at: pricing.exchangeRateExpiresAt,
    expected_amount: pricing.expectedAmount,
    expected_raw_amount: pricing.expectedRawAmount.toString(),
    pricing_status: pricing.pricingStatus,
    receive_address: config.receiveAddress,
    status: "waiting_payment",
    expires_at: expiresAt,
    request_id: randomUUID(),
  };

  const { data, error } = await service
    .from("chain_payment_sessions")
    .insert(payload)
    .select(chainSessionSelect)
    .single();

  if (!error && data) return toBep20SessionResponse(order.order_no, data as ChainSessionRow, config);
  if (!isUniqueViolation(error)) throw error;

  const raced = await getReusableChainSession(service, order.id);
  if (raced) return toBep20SessionResponse(order.order_no, raced, config);
  throw error;
}

export async function getBep20PaymentSession(orderNo: string, userId: string): Promise<Bep20SessionResponse> {
  const service = requiredServiceClient();
  const config = readBep20Config();
  const order = await loadOwnedOrder(service, orderNo, userId);
  const session = await getLatestChainSession(service, order.id);
  if (!session) return createBep20PaymentSession(orderNo, userId);
  return toBep20SessionResponse(order.order_no, session, config);
}

export async function verifyBep20TxHash(input: { orderNo: string; txHash: string; userId: string }): Promise<Bep20VerifyResponse> {
  const service = requiredServiceClient();
  const config = readBep20Config();
  await assertConfiguredTokenDecimals(config);
  const txHash = normalizeTxHash(input.txHash);
  const order = await loadOwnedOrder(service, input.orderNo, input.userId);
  ensureOrderAllowsBep20(order);
  return verifyBep20TxHashForOrder({ service, config, order, txHash, allowRecovery: false });
}

export async function recheckAdminBep20ChainPaymentSession(sessionId: string, adminId?: string | null, reason?: string | null): Promise<Bep20VerifyResponse> {
  const service = requiredServiceClient();
  const config = readBep20Config();
  await assertConfiguredTokenDecimals(config);
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(`${chainSessionSelect},orders(id,order_no,user_id,status,payment_status,payment_method,total_amount,currency)`)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  const session = data as (ChainSessionRow & { orders?: OrderRow | null }) | null;
  if (!session?.orders) throw new Bep20PaymentError("CHAIN_SESSION_NOT_FOUND", "链上支付单不存在。", 404);
  if (!session.submitted_tx_hash) throw new Bep20PaymentError("TX_HASH_MISSING", "该链上支付单还没有提交 TxHash。", 400);
  const audit = await createAdminReviewAttempt(service, session, adminId, reason, "recheck");
  try {
    const result = await verifyBep20TxHashForOrder({
      service, config, order: session.orders, txHash: session.submitted_tx_hash,
      allowRecovery: true, reviewAttemptId: audit.id,
    });
    await finishAdminReviewAttempt(service, audit.id, result.status === "completing" ? "processing" : "succeeded", result.status, null);
    return result;
  } catch (error) {
    await finishAdminReviewAttempt(service, audit.id, "failed", session.status, getBep20ErrorMessage(error));
    throw error;
  }
}

export async function approveLateBep20PaymentSession(sessionId: string, adminId: string, reason: string): Promise<Bep20VerifyResponse> {
  const service = requiredServiceClient();
  const config = readBep20Config();
  await assertConfiguredTokenDecimals(config);
  const session = await loadAdminChainSession(service, sessionId);
  if (!session.orders || !session.submitted_tx_hash) throw new Bep20PaymentError("CHAIN_SESSION_NOT_FOUND", "链上支付单或 TxHash 不存在。", 404);
  if (session.status === "paid") return toPaidVerifyResponse(session.orders.order_no, session, config);
  if (session.manual_review_decision === "rejected") throw new Bep20PaymentError("CHAIN_SESSION_ALREADY_REJECTED", "该晚到账支付已被拒绝，不能再次批准。", 409);
  if (session.status !== "manual_review") throw new Bep20PaymentError("CHAIN_SESSION_NOT_REVIEWABLE", "当前链上支付状态不允许人工批准。", 409);
  const audit = await createAdminReviewAttempt(service, session, adminId, reason, "approve_late_payment");
  try {
    const decision = await decideManualReview(service, session.id, adminId, "approved", reason);
    if (decision.result === "already_paid" && decision.session) {
      await finishAdminReviewAttempt(service, audit.id, "succeeded", "paid", null);
      return toPaidVerifyResponse(session.orders.order_no, decision.session, config);
    }
    if (decision.result === "already_rejected") {
      await finishAdminReviewAttempt(service, audit.id, "failed", session.status, "该晚到账支付已被拒绝，不能再次批准。");
      throw new Bep20PaymentError("CHAIN_SESSION_ALREADY_REJECTED", "该晚到账支付已被拒绝，不能再次批准。", 409);
    }
    if (!["approved", "already_approved"].includes(decision.result)) {
      await finishAdminReviewAttempt(service, audit.id, "failed", session.status, "人工审核决策状态已变化。");
      throw new Bep20PaymentError("CHAIN_SESSION_ALREADY_DECIDED", "链上支付人工审核已被其他管理员处理，请刷新后查看。", 409);
    }
    const result = await verifyBep20TxHashForOrder({
      service, config, order: session.orders, txHash: session.submitted_tx_hash,
      allowRecovery: true, allowLateApproval: true, reviewAttemptId: audit.id,
    });
    await finishAdminReviewAttempt(service, audit.id, result.status === "completing" ? "processing" : "succeeded", result.status, null);
    return result;
  } catch (error) {
    await finishAdminReviewAttempt(service, audit.id, "failed", session.status, getBep20ErrorMessage(error));
    throw error;
  }
}

export async function rejectLateBep20PaymentSession(sessionId: string, adminId: string, reason: string): Promise<Bep20VerifyResponse> {
  const service = requiredServiceClient();
  const config = readBep20Config();
  const session = await loadAdminChainSession(service, sessionId);
  if (!session.orders || !session.submitted_tx_hash) throw new Bep20PaymentError("CHAIN_SESSION_NOT_FOUND", "链上支付单或 TxHash 不存在。", 404);
  if (session.status === "paid") return toPaidVerifyResponse(session.orders.order_no, session, config);
  if (session.manual_review_decision === "approved") throw new Bep20PaymentError("CHAIN_SESSION_ALREADY_APPROVED", "该晚到账支付已被批准，不能再次拒绝。", 409);
  if (session.manual_review_decision === "rejected") {
    return {
      ...toBep20SessionResponse(session.orders.order_no, session, config),
      txHash: session.submitted_tx_hash,
      confirmationCount: 0,
      confirmedAmount: session.confirmed_amount ? String(session.confirmed_amount) : null,
      message: "晚到账支付此前已拒绝，TxHash 继续保留占用。",
    };
  }
  if (session.status !== "manual_review") throw new Bep20PaymentError("CHAIN_SESSION_NOT_REVIEWABLE", "当前链上支付状态不允许人工拒绝。", 409);
  const audit = await createAdminReviewAttempt(service, session, adminId, reason, "reject_late_payment");
  const decision = await decideManualReview(service, session.id, adminId, "rejected", reason);
  if (decision.result === "already_approved") {
    await finishAdminReviewAttempt(service, audit.id, "failed", session.status, "该晚到账支付已被批准，不能再次拒绝。");
    throw new Bep20PaymentError("CHAIN_SESSION_ALREADY_APPROVED", "该晚到账支付已被批准，不能再次拒绝。", 409);
  }
  if (!["rejected", "already_rejected"].includes(decision.result)) {
    await finishAdminReviewAttempt(service, audit.id, "failed", session.status, "人工审核决策状态已变化。");
    throw new Bep20PaymentError("CHAIN_SESSION_ALREADY_DECIDED", "链上支付人工审核已被其他管理员处理，请刷新后查看。", 409);
  }
  const updated = decision.session ?? await getChainSessionById(service, session.id);
  await finishAdminReviewAttempt(service, audit.id, "rejected", updated.status, null);
  return {
    ...toBep20SessionResponse(session.orders.order_no, updated, config),
    txHash: session.submitted_tx_hash,
    confirmationCount: 0,
    confirmedAmount: updated.confirmed_amount ? String(updated.confirmed_amount) : null,
    message: decision.result === "already_rejected" ? "晚到账支付此前已拒绝，TxHash 继续保留占用。" : "晚到账支付已拒绝，TxHash 继续保留占用。",
  };
}

type AdminChainSession = ChainSessionRow & { orders?: OrderRow | null };

async function loadAdminChainSession(service: SupabaseClient, sessionId: string): Promise<AdminChainSession> {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(`${chainSessionSelect},orders(id,order_no,user_id,status,payment_status,payment_method,total_amount,currency)`)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Bep20PaymentError("CHAIN_SESSION_NOT_FOUND", "链上支付单不存在。", 404);
  const row = data as unknown as AdminChainSession & { orders?: OrderRow | OrderRow[] | null };
  return { ...row, orders: Array.isArray(row.orders) ? (row.orders[0] ?? null) : (row.orders ?? null) };
}

async function createAdminReviewAttempt(
  service: SupabaseClient,
  session: ChainSessionRow,
  adminId: string | null | undefined,
  reason: string | null | undefined,
  action: "recheck" | "approve_late_payment" | "reject_late_payment"
) {
  const operatorId = String(adminId ?? "").trim();
  const normalizedReason = String(reason ?? "").trim();
  if (!operatorId) throw new Bep20PaymentError("ADMIN_REVIEW_OPERATOR_REQUIRED", "无法确认管理员身份。", 403);
  if (normalizedReason.length < 2 || normalizedReason.length > 500) {
    throw new Bep20PaymentError("ADMIN_REVIEW_REASON_INVALID", "操作原因长度必须为 2 到 500 个字符。", 400);
  }
  const { data, error } = await service
    .from("bep20_admin_review_attempts")
    .insert({
      payment_id: session.payment_session_id,
      chain_payment_session_id: session.id,
      operator_user_id: operatorId,
      action,
      reason: normalizedReason,
      previous_status: session.status,
      result_status: "requested",
      request_id: randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Bep20PaymentError("ADMIN_REVIEW_AUDIT_FAILED", "管理员操作审计写入失败，已中止链上支付处理。", 503);
  }
  return { id: String(data.id) };
}

async function finishAdminReviewAttempt(
  service: SupabaseClient,
  attemptId: string,
  resultStatus: "processing" | "succeeded" | "failed" | "rejected",
  businessStatus: string,
  errorMessage: string | null
) {
  const { data, error } = await service
    .from("bep20_admin_review_attempts")
    .update({
      result_status: resultStatus,
      error_message: errorMessage ? `${businessStatus}: ${errorMessage}`.slice(0, 500) : null,
      completed_at: resultStatus === "processing" ? null : new Date().toISOString(),
    })
    .eq("id", attemptId)
    .in("result_status", ["requested", "processing"])
    .select("id,result_status")
    .maybeSingle();
  if (error) throw new Bep20PaymentError("ADMIN_REVIEW_AUDIT_FAILED", "管理员操作审计更新失败。", 503);
  if (data) return;
  const { data: existing, error: readError } = await service
    .from("bep20_admin_review_attempts")
    .select("result_status")
    .eq("id", attemptId)
    .maybeSingle();
  if (readError || !existing || !["processing", "succeeded", "failed", "rejected"].includes(String(existing.result_status))) {
    throw new Bep20PaymentError("ADMIN_REVIEW_AUDIT_FAILED", "管理员操作审计结果未能确认。", 503);
  }
}

function toPaidVerifyResponse(orderNo: string, session: ChainSessionRow, config: Bep20Config): Bep20VerifyResponse {
  return {
    ...toBep20SessionResponse(orderNo, session, config),
    txHash: session.submitted_tx_hash ?? "",
    confirmationCount: 0,
    confirmedAmount: session.confirmed_amount ? String(session.confirmed_amount) : null,
    message: "该链上支付单已经处理完成。",
  };
}

export async function getAdminBep20ChainPaymentDetail(input: { orderId?: string | null; paymentId?: string | null }) {
  const service = requiredServiceClient();
  const config = readBep20Config();
  let query = service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("payment_method", "usdt_bep20")
    .order("created_at", { ascending: false })
    .limit(1);
  if (input.paymentId) query = query.eq("payment_id", input.paymentId);
  else if (input.orderId) query = query.eq("order_id", input.orderId);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const session = data as ChainSessionRow | null;
  if (!session) return null;

  const { data: tx } = await service
    .from("chain_transactions")
    .select("tx_hash,from_address,to_address,block_number,block_hash,log_index,confirmation_count,status,normalized_amount,token_contract")
    .eq("chain_payment_session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const response = toBep20SessionResponse("", session, config);
  const txHash = typeof tx?.tx_hash === "string" ? tx.tx_hash : session.submitted_tx_hash;
  return {
    ...response,
    sessionId: session.id,
    paymentSessionId: session.payment_session_id,
    paymentId: session.payment_id,
    tokenDecimals: Number(session.token_decimals),
    expectedRawAmount: String(session.expected_raw_amount),
    confirmedAmount: session.confirmed_amount ? decimalString(session.confirmed_amount) : null,
    confirmedRawAmount: session.confirmed_raw_amount ? String(session.confirmed_raw_amount) : null,
    confirmedAt: session.confirmed_at,
    lastCheckedAt: session.last_checked_at,
    failureReason: session.failure_reason,
    manualReviewReason: session.manual_review_reason,
    manualReviewDecision: session.manual_review_decision ?? null,
    manualReviewDecisionReason: session.manual_review_decision_reason ?? null,
    manualReviewDecidedAt: session.manual_review_decided_at ?? null,
    manualReviewDecidedBy: session.manual_review_decided_by ?? null,
    createdAt: session.created_at ?? null,
    updatedAt: session.updated_at ?? null,
    transaction: tx
      ? {
          txHash: String(tx.tx_hash ?? ""),
          fromAddress: typeof tx.from_address === "string" ? tx.from_address : null,
          toAddress: typeof tx.to_address === "string" ? tx.to_address : null,
          blockNumber: tx.block_number === null || tx.block_number === undefined ? null : String(tx.block_number),
          blockHash: typeof tx.block_hash === "string" ? tx.block_hash : null,
          logIndex: tx.log_index === null || tx.log_index === undefined ? null : Number(tx.log_index),
          confirmationCount: tx.confirmation_count === null || tx.confirmation_count === undefined ? null : Number(tx.confirmation_count),
          status: typeof tx.status === "string" ? tx.status : null,
          normalizedAmount: tx.normalized_amount === null || tx.normalized_amount === undefined ? null : String(tx.normalized_amount),
          tokenContract: typeof tx.token_contract === "string" ? tx.token_contract : null,
        }
      : null,
    explorerUrl: txHash ? getBscExplorerTxUrl(txHash) : null,
  } satisfies AdminBep20ChainPaymentDetail;
}

async function verifyBep20TxHashForOrder(input: {
  service: SupabaseClient;
  config: Bep20Config;
  order: OrderRow;
  txHash: string;
  allowRecovery: boolean;
  allowLateApproval?: boolean;
  reviewAttemptId?: string | null;
}): Promise<Bep20VerifyResponse> {
  const { service, config, order, txHash, allowRecovery, allowLateApproval = false, reviewAttemptId = null } = input;
  const session = (await getReusableChainSession(service, order.id)) ?? (await getLatestChainSession(service, order.id));
  if (!session) throw new Bep20PaymentError("CHAIN_SESSION_NOT_FOUND", "链上支付单不存在，请重新打开支付页面。", 404);
  if (session.status === "paid") {
    return {
      ...toBep20SessionResponse(order.order_no, session, config),
      txHash,
      confirmationCount: 0,
      confirmedAmount: session.confirmed_amount ? String(session.confirmed_amount) : null,
      message: "该链上支付单已经处理完成。",
    };
  }
  if (session.manual_review_decision === "rejected") {
    throw new Bep20PaymentError("CHAIN_SESSION_REJECTED", "该链上支付已被管理员拒绝，不能重新提交交易。", 409);
  }
  if (!allowRecovery && USER_RECOVERY_BLOCKED_STATUSES.includes(session.status as never)) {
    return {
      ...toBep20SessionResponse(order.order_no, session, config),
      txHash,
      confirmationCount: 0,
      confirmedAmount: session.confirmed_amount ? String(session.confirmed_amount) : null,
      message: "该状态需要管理员重新核验。",
    };
  }

  const receipt = await loadReceipt(config, txHash);
  if (!receipt) {
    const expired = new Date(session.expires_at).getTime() <= Date.now();
    const updated = await updateNonFinalChainSession(service, session.id, {
      status: expired ? "expired" : "submitted",
      submitted_tx_hash: txHash,
      last_checked_at: new Date().toISOString(),
      failure_reason: expired ? "支付单已过期且暂未查询到链上交易。" : "暂未在 BSC 上查询到该交易。",
    });
    return {
      ...toBep20SessionResponse(order.order_no, updated, config),
      txHash,
      confirmationCount: 0,
      confirmedAmount: null,
      message: expired ? "支付单已过期，未查询到链上交易。" : "暂未查询到该交易，请稍后重试。",
    };
  }

  if (receipt.status && receipt.status !== "0x1") {
    const retryable = await updateNonFinalChainSession(service, session.id, {
      status: "submitted",
      submitted_tx_hash: txHash,
      last_checked_at: new Date().toISOString(),
      failure_reason: "链上交易执行失败。",
    });
    return {
      ...toBep20SessionResponse(order.order_no, retryable, config),
      txHash,
      confirmationCount: 0,
      confirmedAmount: null,
      message: "该交易执行失败，可重新提交其他 TxHash。",
    };
  }

  const transfer = await findUsdtTransfer(config, receipt, txHash);
  if (!transfer) {
    const retryable = await updateNonFinalChainSession(service, session.id, {
      status: "submitted",
      submitted_tx_hash: txHash,
      last_checked_at: new Date().toISOString(),
      failure_reason: "未找到转入本站收款地址的 USDT-BEP20 Transfer 日志。",
    });
    return {
      ...toBep20SessionResponse(order.order_no, retryable, config),
      txHash,
      confirmationCount: 0,
      confirmedAmount: null,
      message: "未找到正确的 USDT-BEP20 转账记录，可重新提交其他 TxHash。",
    };
  }

  const expectedRaw = BigInt(String(session.expected_raw_amount).split(".")[0]);
  const status = decideBep20TransferStatus({
    rawAmount: transfer.rawAmount.toString(),
    expectedRawAmount: expectedRaw.toString(),
    confirmations: transfer.confirmations,
    requiredConfirmations: config.requiredConfirmations,
    transferTimestamp: transfer.blockTimestamp,
    sessionExpiresAt: session.expires_at,
    exchangeRateExpiresAt: session.exchange_rate_expires_at,
  });
  const claim = await claimChainTransaction(service, {
    sessionId: session.id,
    orderId: order.id,
    transfer,
    status,
  });
  if (claim === "claimed_by_other_order") {
    throw new Bep20PaymentError("TX_HASH_USED", "该链上交易已被其他订单使用，不能重复提交。", 409);
  }

  const effectiveStatus = status === "manual_review" && allowLateApproval ? "verified" : status;
  const patch: Record<string, unknown> = {
    status: effectiveStatus,
    submitted_tx_hash: txHash,
    confirmed_amount: transfer.normalizedAmount,
    confirmed_raw_amount: transfer.rawAmount.toString(),
    last_checked_at: new Date().toISOString(),
    failure_reason: status === "underpaid" ? "链上到账金额不足。" : null,
    manual_review_reason: status === "manual_review" ? "链上到账金额或时间需要人工审核。" : null,
    manual_review_decision: status === "manual_review" ? "pending" : null,
  };
  let updated: ChainSessionRow;

  if (effectiveStatus === "verified" && !session.payment_session_id) {
    throw new Bep20PaymentError(
      "BEP20_PAYMENT_SESSION_LINK_MISSING",
      "链上支付已核验，但支付会话关联缺失，请管理员先修复支付记录关联。",
      503
    );
  }

  if (effectiveStatus === "verified" && session.payment_session_id) {
    const completion = await preparePaymentCompletion(service, {
      sessionId: session.id,
      txHash,
      confirmedAmount: transfer.normalizedAmount,
      confirmedRawAmount: transfer.rawAmount.toString(),
      allowRecovery,
      reviewAttemptId,
    });
    if (completion.result === "acquired" && completion.attemptId) {
      const completionInput = createBep20CompletionInput(decimalString(session.expected_amount), txHash, transfer.logIndex);
      try {
        await completePayment(
          {
            paymentSessionId: session.payment_session_id,
            providerTransactionId: completionInput.providerTransactionId,
            amount: completionInput.amount,
            currency: completionInput.currency,
            paidAt: new Date().toISOString(),
            source: "callback",
          },
          service
        );
      } catch (error) {
        await finishPaymentCompletion(service, session.id, completion.attemptId, "payment_failed", getBep20ErrorMessage(error), reviewAttemptId);
        throw new Bep20PaymentError("BEP20_PAYMENT_COMPLETION_FAILED", "链上交易已核验，但订单支付完成失败，可由管理员安全重试。", 503);
      }
      updated = await finishPaymentCompletion(service, session.id, completion.attemptId, "paid", null, reviewAttemptId);
      await updateClaimedTransactionStatus(service, config.chainId, txHash, order.id, "paid");
    } else {
      updated = await getChainSessionById(service, session.id);
    }
  } else {
    updated = await updateNonFinalChainSession(service, session.id, patch);
  }

  return {
    ...toBep20SessionResponse(order.order_no, updated, config),
    txHash,
    confirmationCount: transfer.confirmations,
    confirmedAmount: transfer.normalizedAmount,
    message: statusMessage(updated.status || effectiveStatus),
  };
}

const chainSessionSelect =
  "id,order_id,payment_session_id,payment_id,payment_method,network,chain_id,asset,token_contract,token_decimals,order_currency,order_amount,payment_currency,exchange_rate,exchange_rate_source,exchange_rate_fetched_at,exchange_rate_expires_at,expected_amount,expected_raw_amount,pricing_status,receive_address,status,expires_at,submitted_tx_hash,confirmed_amount,confirmed_raw_amount,confirmed_at,last_checked_at,failure_reason,manual_review_reason,manual_review_decision,manual_review_decided_at,manual_review_decided_by,manual_review_decision_reason,completion_attempt_id,completion_started_at,completion_error,created_at,updated_at";

function requiredServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Bep20PaymentError("SERVICE_ROLE_NOT_CONFIGURED", "服务端支付密钥未配置，无法处理链上支付。", 503);
  return service;
}

function readBep20Config(): Bep20Config {
  const status = getBep20ConfigStatus();
  if (Object.values(status.checks).some((check) => check.status !== "configured")) {
    throw new Bep20PaymentError("BEP20_CONFIG_INVALID", "USDT-BEP20 服务端配置缺失或格式错误。", 503);
  }
  const rpcUrl = String(process.env.BSC_RPC_URL ?? "").trim();
  const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
  const tokenContract = normalizeAddress(process.env.BSC_USDT_CONTRACT);
  const receiveAddress = normalizeAddress(process.env.BSC_RECEIVE_ADDRESS);
  const tokenDecimals = Number(process.env.BSC_USDT_DECIMALS ?? 18);
  const requiredConfirmations = Math.max(1, Number(process.env.BSC_REQUIRED_CONFIRMATIONS ?? 12));
  const expireMinutes = Math.max(5, Number(process.env.BSC_PAYMENT_EXPIRE_MINUTES ?? 30));
  const pricingMode = String(process.env.USDT_PRICING_MODE ?? "manual_fixed_rate").trim() as PricingMode;
  const fixedRate = String(process.env.CNY_USDT_FIXED_RATE ?? "").trim() || null;
  const rateTtlSeconds = Math.max(60, Number(process.env.CNY_USDT_RATE_TTL_SECONDS ?? 300));
  const amountScale = Math.min(18, Math.max(2, Number(process.env.USDT_AMOUNT_SCALE ?? 6)));

  if (!rpcUrl) throw new Bep20PaymentError("BSC_RPC_NOT_CONFIGURED", "BSC RPC 尚未配置。", 503);
  if (chainId !== 56) throw new Bep20PaymentError("BSC_CHAIN_ID_INVALID", "BSC Chain ID 配置不正确。", 503);
  if (!tokenContract) throw new Bep20PaymentError("BSC_USDT_CONTRACT_INVALID", "USDT-BEP20 合约地址未配置或格式错误。", 503);
  if (!receiveAddress) throw new Bep20PaymentError("BSC_RECEIVE_ADDRESS_INVALID", "USDT-BEP20 收款地址未配置或格式错误。", 503);
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) {
    throw new Bep20PaymentError("BSC_USDT_DECIMALS_INVALID", "USDT-BEP20 精度配置不正确。", 503);
  }
  if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 1) {
    throw new Bep20PaymentError("BSC_REQUIRED_CONFIRMATIONS_INVALID", "BSC 确认数配置不正确。", 503);
  }
  if (!Number.isInteger(expireMinutes) || expireMinutes < 5) {
    throw new Bep20PaymentError("BSC_PAYMENT_EXPIRE_MINUTES_INVALID", "BEP20 支付过期时间配置不正确。", 503);
  }
  if (!Number.isInteger(rateTtlSeconds) || rateTtlSeconds < 60) {
    throw new Bep20PaymentError("CNY_USDT_RATE_TTL_INVALID", "CNY/USDT 汇率有效期配置不正确。", 503);
  }
  if (!Number.isInteger(amountScale) || amountScale < 2 || amountScale > 18) {
    throw new Bep20PaymentError("USDT_AMOUNT_SCALE_INVALID", "USDT 金额精度配置不正确。", 503);
  }
  if (!SUPPORTED_PRICING_MODES.includes(pricingMode)) {
    throw new Bep20PaymentError("USDT_PRICING_MODE_INVALID", "USDT 定价模式配置不正确。", 503);
  }
  if (pricingMode === "manual_fixed_rate" && (!fixedRate || decimalToScaled(fixedRate, 18) <= BigInt(0))) {
    throw new Bep20PaymentError("CNY_USDT_FIXED_RATE_INVALID", "CNY/USDT 固定汇率未配置或小于等于 0。", 503);
  }
  if (pricingMode === "provider_rate") {
    throw new Bep20PaymentError("USDT_RATE_PROVIDER_NOT_CONFIGURED", "实时汇率 Provider 尚未接入，不能创建链上支付单。", 503);
  }

  return { rpcUrl, chainId, tokenContract, tokenDecimals, receiveAddress, requiredConfirmations, expireMinutes, pricingMode, fixedRate, rateTtlSeconds, amountScale };
}

async function assertConfiguredTokenDecimals(config: Bep20Config) {
  const rpcFingerprint = createHash("sha256").update(config.rpcUrl).digest("hex").slice(0, 16);
  const cacheKey = `${config.chainId}:${config.tokenContract}:${config.tokenDecimals}:${rpcFingerprint}`;
  const cached = tokenDecimalsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.valid) {
      throw new Bep20PaymentError("BSC_USDT_DECIMALS_MISMATCH", "USDT-BEP20 合约精度与服务端配置不一致。", 503);
    }
    return;
  }

  const valid = await runSharedDecimalsCheck(cacheKey, async () => {
    try {
      const result = await checkTokenDecimalsWithRpc(
        (method: string, params: unknown[]) => rpc(config, method, params),
        config.tokenContract,
        config.tokenDecimals
      );
      tokenDecimalsCache.set(cacheKey, { valid: result, expiresAt: Date.now() + (result ? 5 * 60_000 : 30_000) });
      return result;
    } catch {
      tokenDecimalsCache.set(cacheKey, { valid: false, expiresAt: Date.now() + 30_000 });
      throw new Bep20PaymentError("BSC_USDT_DECIMALS_CHECK_FAILED", "无法核验 USDT-BEP20 合约精度。", 503);
    }
  });
  if (!valid) {
    throw new Bep20PaymentError("BSC_USDT_DECIMALS_MISMATCH", "USDT-BEP20 合约精度与服务端配置不一致。", 503);
  }
}

function createPricingSnapshot(order: OrderRow, config: Bep20Config): PricingSnapshot {
  const orderCurrency = String(order.currency || "CNY").trim().toUpperCase();
  const orderAmount = normalizeDecimal(order.total_amount, 18);
  if (decimalToScaled(orderAmount, 18) <= BigInt(0)) {
    throw new Bep20PaymentError("ORDER_AMOUNT_INVALID", "订单金额必须大于 0。", 400);
  }
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + config.rateTtlSeconds * 1000);

  if (orderCurrency === "USDT") {
    const expectedAmount = normalizeDecimal(orderAmount, config.amountScale, "ceil");
    const expectedRawAmount = decimalToRawAmount(expectedAmount, config.tokenDecimals);
    if (expectedRawAmount <= BigInt(0)) throw new Bep20PaymentError("USDT_AMOUNT_TOO_SMALL", "USDT 应付金额过小，无法创建链上支付单。", 400);
    return {
      orderCurrency,
      orderAmount,
      paymentCurrency: "USDT",
      exchangeRate: "1",
      exchangeRateSource: "order_currency_usdt",
      exchangeRateFetchedAt: fetchedAt.toISOString(),
      exchangeRateExpiresAt: expiresAt.toISOString(),
      expectedAmount,
      expectedRawAmount,
      pricingStatus: "frozen",
    };
  }

  if (orderCurrency !== "CNY") {
    throw new Bep20PaymentError("ORDER_CURRENCY_UNSUPPORTED", "当前订单币种暂不支持 USDT-BEP20 定价。", 400);
  }

  if (config.pricingMode !== "manual_fixed_rate" || !config.fixedRate) {
    throw new Bep20PaymentError("USDT_RATE_NOT_AVAILABLE", "USDT 汇率不可用，不能创建链上支付单。", 503);
  }

  const rate = normalizeDecimal(config.fixedRate, 18);
  const rateUnits = decimalToScaled(rate, 18);
  if (rateUnits <= BigInt(0)) throw new Bep20PaymentError("CNY_USDT_FIXED_RATE_INVALID", "CNY/USDT 固定汇率必须大于 0。", 503);
  const orderUnits = decimalToScaled(orderAmount, 18);
  const expectedUnits = ceilDiv(orderUnits * pow10(config.amountScale), rateUnits);
  if (expectedUnits <= BigInt(0)) throw new Bep20PaymentError("USDT_AMOUNT_TOO_SMALL", "USDT 应付金额过小，无法创建链上支付单。", 400);
  const expectedAmount = scaledToDecimal(expectedUnits, config.amountScale);
  const expectedRawAmount = decimalToRawAmount(expectedAmount, config.tokenDecimals);
  return {
    orderCurrency,
    orderAmount,
    paymentCurrency: "USDT",
    exchangeRate: rate,
    exchangeRateSource: "manual_fixed_rate",
    exchangeRateFetchedAt: fetchedAt.toISOString(),
    exchangeRateExpiresAt: expiresAt.toISOString(),
    expectedAmount,
    expectedRawAmount,
    pricingStatus: "frozen",
  };
}

function normalizeAddress(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(text) ? text : "";
}

function normalizeTxHash(value: unknown) {
  try {
    return normalizeBep20TxHash(value);
  } catch {
    throw new Bep20PaymentError("TX_HASH_INVALID", "请输入合法的 0x 开头 32 字节交易哈希。", 400);
  }
}

async function loadOwnedOrder(service: SupabaseClient, orderNo: string, userId: string): Promise<OrderRow> {
  const { data, error } = await service
    .from("orders")
    .select("id,order_no,user_id,status,payment_status,payment_method,total_amount,currency")
    .eq("order_no", orderNo.trim())
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) throw new Bep20PaymentError("ORDER_NOT_FOUND", "订单不存在或无权访问。", 404);
  return data as OrderRow;
}

function ensureOrderAllowsBep20(order: OrderRow) {
  if (order.payment_method !== "usdt_bep20") throw new Bep20PaymentError("PAYMENT_METHOD_INVALID", "该订单不是 USDT-BEP20 支付订单。", 400);
  if (order.payment_status === "paid" || order.status === "paid") throw new Bep20PaymentError("ORDER_ALREADY_PAID", "订单已支付，不能重复创建链上支付单。", 409);
  if (["cancelled", "closed", "expired", "refunded", "failed"].includes(order.status)) {
    throw new Bep20PaymentError("ORDER_STATUS_INVALID", "当前订单状态不允许链上支付。", 400);
  }
}

async function getReusableChainSession(service: SupabaseClient, orderId: string) {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("order_id", orderId)
    .eq("payment_method", "usdt_bep20")
    .in("status", [...ACTIVE_CHAIN_SESSION_STATUSES])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChainSessionRow | null) ?? null;
}

async function getLatestChainSession(service: SupabaseClient, orderId: string) {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("order_id", orderId)
    .eq("payment_method", "usdt_bep20")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChainSessionRow | null) ?? null;
}

type PaymentSessionRef = {
  id: string;
  sessionNo: string;
};

async function ensurePaymentSession(
  service: SupabaseClient,
  order: OrderRow,
  config: Bep20Config,
  pricing: PricingSnapshot,
  expiresAt: string
): Promise<PaymentSessionRef> {
  const { data: existing, error: existingError } = await service
    .from("payment_sessions")
    .select("id,session_no")
    .eq("business_type", "order")
    .eq("business_id", order.id)
    .eq("channel_code", "usdt_bep20")
    .in("status", ["pending", "processing"])
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id && existing.session_no) {
    return { id: String(existing.id), sessionNo: String(existing.session_no) };
  }

  const sessionNo = `BEP20${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const payload = {
    session_no: sessionNo,
    business_type: "order",
    business_id: order.id,
    business_no: order.order_no,
    user_id: order.user_id,
    channel_code: "usdt_bep20",
    provider: "bsc_rpc",
    currency: "USDT",
    network: "BEP20",
    requested_amount: pricing.expectedAmount,
    fee_amount: 0,
    payable_amount: pricing.expectedAmount,
    status: "pending",
    payment_type: "address",
    wallet_address: config.receiveAddress,
    expires_at: expiresAt,
    metadata: {
      chainId: config.chainId,
      asset: "USDT",
      tokenContract: config.tokenContract,
      orderCurrency: pricing.orderCurrency,
      orderAmount: pricing.orderAmount,
      exchangeRate: pricing.exchangeRate,
      exchangeRateSource: pricing.exchangeRateSource,
      exchangeRateFetchedAt: pricing.exchangeRateFetchedAt,
      exchangeRateExpiresAt: pricing.exchangeRateExpiresAt,
    },
  };
  const { data, error } = await service
    .from("payment_sessions")
    .insert(payload)
    .select("id,session_no")
    .single();
  if (!error && data?.id && data.session_no) {
    return { id: String(data.id), sessionNo: String(data.session_no) };
  }
  if (!isUniqueViolation(error)) throw error;

  const { data: raced, error: racedError } = await service
    .from("payment_sessions")
    .select("id,session_no")
    .eq("business_type", "order")
    .eq("business_id", order.id)
    .eq("channel_code", "usdt_bep20")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (racedError) throw racedError;
  if (!raced?.id || !raced.session_no) throw error;
  return { id: String(raced.id), sessionNo: String(raced.session_no) };
}

async function ensureOrderPaymentRecord(
  service: SupabaseClient,
  order: OrderRow,
  paymentSession: PaymentSessionRef,
  pricing: PricingSnapshot
): Promise<string> {
  const paymentNo = `AUTO-${paymentSession.sessionNo}`;
  const { data: existing, error: existingError } = await service
    .from("order_payments")
    .select("id,order_id,status")
    .eq("payment_no", paymentNo)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (String(existing.order_id) !== order.id) {
      throw new Bep20PaymentError(
        "BEP20_ORDER_PAYMENT_CONFLICT",
        "支付记录已被其他订单占用。",
        409
      );
    }
    if (String(existing.status) !== "paid") {
      const { error: updateError } = await service
        .from("order_payments")
        .update({
          payment_session_id: paymentSession.id,
          payment_method: "usdt_bep20",
          channel: "usdt_bep20",
          network: "BEP20",
          payable_amount: pricing.expectedAmount,
          payable_currency: pricing.paymentCurrency,
        })
        .eq("id", existing.id)
        .eq("order_id", order.id);
      if (updateError) throw updateError;
    }
    return String(existing.id);
  }

  const payload = {
    payment_no: paymentNo,
    payment_session_id: paymentSession.id,
    order_id: order.id,
    user_id: order.user_id,
    payment_method: "usdt_bep20",
    amount: pricing.orderAmount,
    currency: pricing.orderCurrency,
    status: "pending",
    business_type: "order",
    channel: "usdt_bep20",
    network: "BEP20",
    business_amount: pricing.orderAmount,
    fee_amount: 0,
    payable_amount: pricing.expectedAmount,
    payable_currency: pricing.paymentCurrency,
    received_amount: 0,
    order_amount: pricing.orderAmount,
    order_currency: pricing.orderCurrency,
  };
  const { data, error } = await service
    .from("order_payments")
    .insert(payload)
    .select("id")
    .single();
  if (!error && data?.id) return String(data.id);
  if (!isUniqueViolation(error)) throw error;

  const { data: raced, error: racedError } = await service
    .from("order_payments")
    .select("id,order_id")
    .eq("payment_no", paymentNo)
    .maybeSingle();
  if (racedError) throw racedError;
  if (!raced?.id || String(raced.order_id) !== order.id) {
    throw new Bep20PaymentError(
      "BEP20_ORDER_PAYMENT_CONFLICT",
      "支付记录并发创建冲突。",
      409
    );
  }
  return String(raced.id);
}

async function updateNonFinalChainSession(service: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const mutableStatuses = [
    "waiting_payment", "submitted", "confirming", "verified", "payment_failed",
    "underpaid", "expired", "manual_review", "failed",
  ];
  const { data, error } = await service
    .from("chain_payment_sessions")
    .update(patch)
    .eq("id", id)
    .in("status", mutableStatuses)
    .or("manual_review_decision.is.null,manual_review_decision.neq.rejected")
    .select(chainSessionSelect)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as ChainSessionRow;
  return getChainSessionById(service, id);
}

async function rpc(config: Bep20Config, method: string, params: unknown[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new Bep20PaymentError("BSC_RPC_TIMEOUT", "BSC RPC 请求失败或超时，请稍后重试。", 502);
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => null)) as { result?: unknown; error?: { message?: string } } | null;
  if (!response.ok || payload?.error) throw new Bep20PaymentError("BSC_RPC_ERROR", "BSC RPC 查询失败，请稍后重试。", 502);
  return payload?.result ?? null;
}

async function loadReceipt(config: Bep20Config, txHash: string) {
  const chainIdHex = await rpc(config, "eth_chainId", []);
  if (Number.parseInt(String(chainIdHex), 16) !== config.chainId) {
    throw new Bep20PaymentError("BSC_CHAIN_ID_MISMATCH", "BSC RPC Chain ID 与配置不一致。", 502);
  }
  return (await rpc(config, "eth_getTransactionReceipt", [txHash])) as TransactionReceipt | null;
}

async function findUsdtTransfer(config: Bep20Config, receipt: TransactionReceipt, txHash: string): Promise<ParsedTransfer | null> {
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const blockNumber = receipt.blockNumber ? BigInt(receipt.blockNumber) : BigInt(0);
  if (!receipt.blockNumber || blockNumber <= BigInt(0)) {
    throw new Bep20PaymentError("BSC_BLOCK_NUMBER_INVALID", "链上交易缺少有效区块号。", 502);
  }
  const block = (await rpc(config, "eth_getBlockByNumber", [receipt.blockNumber, false])) as { timestamp?: string } | null;
  if (!block?.timestamp || !/^0x[0-9a-f]+$/i.test(block.timestamp)) {
    throw new Bep20PaymentError("BSC_BLOCK_TIMESTAMP_INVALID", "无法读取链上交易区块时间。", 502);
  }
  const blockTimestamp = new Date(Number(BigInt(block.timestamp) * BigInt(1000))).toISOString();
  const currentBlockHex = await rpc(config, "eth_blockNumber", []);
  const currentBlock = currentBlockHex ? BigInt(String(currentBlockHex)) : blockNumber;
  const confirmations = blockNumber > BigInt(0) && currentBlock >= blockNumber ? Number(currentBlock - blockNumber + BigInt(1)) : 0;

  for (const log of logs) {
    const topics = log.topics ?? [];
    const token = normalizeAddress(log.address);
    if (token !== config.tokenContract) continue;
    if (String(topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    const toAddress = topicToAddress(topics[2]);
    if (toAddress !== config.receiveAddress) continue;
    const fromAddress = topicToAddress(topics[1]);
    const rawAmount = BigInt(log.data ?? "0x0");
    const logIndex = Number.parseInt(String(log.logIndex ?? "0x0"), 16);
    return {
      txHash,
      logIndex,
      blockNumber,
      blockHash: log.blockHash ?? receipt.blockHash ?? null,
      tokenContract: token,
      fromAddress,
      toAddress,
      rawAmount,
      normalizedAmount: rawToDecimal(rawAmount, config.tokenDecimals),
      confirmations,
      blockTimestamp,
    };
  }
  return null;
}

function topicToAddress(topic: unknown) {
  const text = String(topic ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) return "";
  return `0x${text.slice(-40)}`;
}

async function claimChainTransaction(
  service: SupabaseClient,
  input: { sessionId: string; orderId: string; transfer: ParsedTransfer; status: string }
) {
  const { data, error } = await service.rpc("claim_bep20_chain_transaction", {
    p_session_id: input.sessionId,
    p_order_id: input.orderId,
    p_chain_id: 56,
    p_tx_hash: input.transfer.txHash,
    p_log_index: input.transfer.logIndex,
    p_block_number: input.transfer.blockNumber.toString(),
    p_block_hash: input.transfer.blockHash,
    p_block_timestamp: input.transfer.blockTimestamp,
    p_token_contract: input.transfer.tokenContract,
    p_from_address: input.transfer.fromAddress,
    p_to_address: input.transfer.toAddress,
    p_raw_amount: input.transfer.rawAmount.toString(),
    p_normalized_amount: input.transfer.normalizedAmount,
    p_confirmation_count: input.transfer.confirmations,
    p_status: input.status,
  });
  if (error) throw error;
  const result = String((data as { result?: unknown } | null)?.result ?? "");
  if (!["claimed", "already_claimed_by_same_order", "claimed_by_other_order"].includes(result)) {
    throw new Bep20PaymentError("BEP20_CLAIM_RESULT_INVALID", "链上交易占用结果无效。", 500);
  }
  return result;
}

async function preparePaymentCompletion(service: SupabaseClient, input: {
  sessionId: string;
  txHash: string;
  confirmedAmount: string;
  confirmedRawAmount: string;
  allowRecovery: boolean;
  reviewAttemptId?: string | null;
}) {
  const { data, error } = await service.rpc("prepare_bep20_payment_completion", {
    p_session_id: input.sessionId,
    p_tx_hash: input.txHash,
    p_confirmed_amount: input.confirmedAmount,
    p_confirmed_raw_amount: input.confirmedRawAmount,
    p_allow_stale_retry: input.allowRecovery,
    p_review_attempt_id: input.reviewAttemptId ?? null,
  });
  if (error) throw error;
  const row = (data ?? {}) as { result?: unknown; attempt_id?: unknown };
  return {
    result: String(row.result ?? ""),
    attemptId: typeof row.attempt_id === "string" ? row.attempt_id : null,
  };
}

async function decideManualReview(
  service: SupabaseClient,
  sessionId: string,
  adminId: string,
  decision: "approved" | "rejected",
  reason: string
) {
  const { data, error } = await service.rpc("decide_bep20_manual_review", {
    p_session_id: sessionId,
    p_operator_user_id: adminId,
    p_decision: decision,
    p_reason: String(reason ?? "").trim(),
  });
  if (error) throw error;
  const row = (data ?? {}) as { result?: unknown; session?: unknown };
  return {
    result: String(row.result ?? ""),
    session: row.session ? (row.session as ChainSessionRow) : null,
  };
}

async function finishPaymentCompletion(
  service: SupabaseClient,
  sessionId: string,
  attemptId: string,
  status: "paid" | "payment_failed",
  errorMessage: string | null,
  reviewAttemptId?: string | null
) {
  const { data, error } = await service.rpc("finish_bep20_payment_completion", {
    p_session_id: sessionId,
    p_attempt_id: attemptId,
    p_status: status,
    p_error_message: errorMessage,
    p_review_attempt_id: reviewAttemptId ?? null,
  });
  if (error) throw error;
  const result = String((data as { result?: unknown } | null)?.result ?? "");
  if (result === "stale_attempt") throw new Bep20PaymentError("BEP20_COMPLETION_ATTEMPT_STALE", "链上支付完成尝试已失效。", 409);
  const row = (data as { session?: unknown } | null)?.session;
  if (!row) throw new Bep20PaymentError("BEP20_COMPLETION_RESULT_INVALID", "链上支付完成结果无效。", 500);
  return row as ChainSessionRow;
}

async function updateClaimedTransactionStatus(service: SupabaseClient, chainId: number, txHash: string, orderId: string, status: string) {
  const { error } = await service
    .from("chain_transactions")
    .update({ status })
    .eq("chain_id", chainId)
    .eq("tx_hash", txHash)
    .eq("order_id", orderId);
  if (error) throw error;
}

async function getChainSessionById(service: SupabaseClient, sessionId: string) {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  return data as ChainSessionRow;
}

function toBep20SessionResponse(orderNo: string, session: ChainSessionRow, config: Bep20Config): Bep20SessionResponse {
  return {
    orderNo,
    network: "BNB Smart Chain (BEP20)",
    chainId: Number(session.chain_id ?? config.chainId),
    asset: "USDT",
    orderCurrency: String(session.order_currency || "CNY"),
    orderAmount: decimalString(session.order_amount ?? "0"),
    paymentCurrency: "USDT",
    exchangeRate: decimalString(session.exchange_rate ?? "1"),
    exchangeRateSource: String(session.exchange_rate_source || "unknown"),
    exchangeRateFetchedAt: session.exchange_rate_fetched_at ?? null,
    exchangeRateExpiresAt: session.exchange_rate_expires_at ?? null,
    expectedAmount: decimalString(session.expected_amount),
    receiveAddress: String(session.receive_address),
    expiresAt: String(session.expires_at),
    status: String(session.status),
    submittedTxHash: session.submitted_tx_hash ?? null,
    requiredConfirmations: config.requiredConfirmations,
    tokenContract: String(session.token_contract),
    pricingStatus: String(session.pricing_status || "frozen"),
  };
}

export function decimalToRawAmount(value: string, decimals: number) {
  const [integerPart, fractionPart = ""] = normalizeDecimal(value, decimals).split(".");
  const normalizedFraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(integerPart || "0") * pow10(decimals) + BigInt(normalizedFraction || "0");
}

export function rawToDecimal(raw: bigint, decimals: number) {
  const base = pow10(decimals);
  const integer = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

export function decimalToScaled(value: string, scale: number) {
  const [integerPart, fractionPart = ""] = decimalString(value).split(".");
  const normalizedFraction = (fractionPart + "0".repeat(scale)).slice(0, scale);
  return BigInt(integerPart || "0") * pow10(scale) + BigInt(normalizedFraction || "0");
}

export function scaledToDecimal(value: bigint, scale: number) {
  const base = pow10(scale);
  const integer = value / base;
  const fraction = (value % base).toString().padStart(scale, "0").replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

function normalizeDecimal(value: unknown, scale: number, rounding: "truncate" | "ceil" = "truncate") {
  const text = decimalString(value);
  const [integerPart, fractionPart = ""] = text.split(".");
  if (fractionPart.length <= scale) return fractionPart ? `${integerPart}.${fractionPart.replace(/0+$/, "")}`.replace(/\.$/, "") : integerPart;
  const truncated = fractionPart.slice(0, scale);
  const hasRemainder = /[1-9]/.test(fractionPart.slice(scale));
  let units = BigInt(integerPart || "0") * pow10(scale) + BigInt(truncated || "0");
  if (rounding === "ceil" && hasRemainder) units += BigInt(1);
  return scaledToDecimal(units, scale);
}

function pow10(decimals: number) {
  let value = BigInt(1);
  for (let index = 0; index < decimals; index += 1) value *= BigInt(10);
  return value;
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - BigInt(1)) / denominator;
}

function decimalString(value: unknown) {
  const text = String(value ?? "0").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return "0";
  const [integerPart, fractionPart] = text.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "") || "0";
  if (!fractionPart) return integer;
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "23505";
}

function getBscExplorerTxUrl(txHash: string) {
  const base = String(process.env.BSC_EXPLORER_BASE_URL ?? "https://bscscan.com/tx").trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(base)) return null;
  return `${base}/${txHash}`;
}

function statusMessage(status: string) {
  if (status === "paid") return "链上支付已确认到账。";
  if (status === "verified") return "链上交易已核验，正在完成订单支付。";
  if (status === "completing") return "订单支付正在处理中，请勿重复提交。";
  if (status === "payment_failed") return "链上交易已核验，但订单支付完成失败，等待管理员重试。";
  if (status === "confirming") return "交易已找到，等待区块确认数达到要求。";
  if (status === "underpaid") return "链上到账金额不足，已记录为异常。";
  if (status === "manual_review") return "链上到账需要人工审核。";
  if (status === "failed") return "链上交易校验失败。";
  return "TxHash 已提交。";
}

export function getBep20ErrorMessage(error: unknown) {
  if (error instanceof Bep20PaymentError) return error.message;
  return "支付校验暂时失败，请稍后重试。";
}
