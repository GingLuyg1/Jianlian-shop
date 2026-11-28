import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverDigitalOrder, getDeliveryErrorMessage } from "@/lib/delivery/delivery-service";
import {
  createBep20CompletionInput,
  decideBep20TransferStatus,
  shouldPrefillBep20TxHash,
} from "@/lib/payments/bep20-chain-logic.mjs";
import { completePayment } from "@/lib/payments/complete-payment-service";
import { createPaymentExpiryWindow } from "@/lib/payments/payment-expiry.mjs";
import { compareRechargeDecimals } from "@/lib/payments/recharge-rate.mjs";
import {
  deriveOrderUsdtRateFromMarket,
  loadLatestRechargeDailyRate,
  type RechargeDailyRateRow,
} from "@/lib/payments/recharge-rate-service";
import {
  decimalToRawTokenAmount,
  isValidTronAddress,
  matchTronGridTrc20Candidates,
  normalizeTronTxHash,
  TRON_MAINNET_CHAIN_ID,
  TRON_REQUIRED_CONFIRMATIONS,
  TRON_USDT_CONTRACT,
  TRON_USDT_DECIMALS,
  verifyTrc20TransferReceipt,
  type Trc20VerifiedEvidence,
} from "@/lib/payments/trc20-chain-logic.mjs";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const DEFAULT_TRON_RPC_URL = "https://api.trongrid.io";
const TRON_RPC_TIMEOUT_MS = 10_000;
const TRON_MAX_RESPONSE_BYTES = 512 * 1024;
const AUTO_SCAN_COOLDOWN_MS = 4_000;
const AUTO_SCAN_GRACE_AFTER_EXPIRY_MS = 5 * 60_000;
const ORDER_AMOUNT_SCALE = 4;

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

const USER_RECOVERY_BLOCKED_STATUSES = [
  "underpaid",
  "manual_review",
  "payment_failed",
  "completing",
] as const;

const chainSessionSelect =
  "id,order_id,payment_session_id,payment_id,payment_method,network,chain_id,asset,token_contract,token_decimals,order_currency,order_amount,payment_currency,exchange_rate,exchange_rate_source,exchange_rate_fetched_at,exchange_rate_expires_at,expected_amount,expected_raw_amount,pricing_status,receive_address,status,expires_at,submitted_tx_hash,confirmed_amount,confirmed_raw_amount,confirmed_at,last_checked_at,failure_reason,manual_review_reason,manual_review_decision,manual_review_decided_at,manual_review_decided_by,manual_review_decision_reason,completion_attempt_id,completion_started_at,completion_error,created_at,updated_at";

const autoScanLastRun = new Map<string, number>();
const autoScanInFlight = new Map<string, Promise<boolean>>();

export class Trc20PaymentError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "Trc20PaymentError";
    this.code = code;
    this.status = status;
  }
}

export type Trc20Config = {
  rpcUrl: string;
  apiKey: string | null;
  chainId: number;
  tokenContract: string;
  tokenDecimals: number;
  receiveAddress: string;
  requiredConfirmations: number;
  fixedRate: string | null;
  rateTtlSeconds: number;
};

type OrderRow = {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  payment_expires_at: string | null;
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

export type Trc20SessionResponse = {
  chainSessionId: string | null;
  orderNo: string;
  network: string;
  chainId: number;
  asset: string;
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
  prefillSubmittedTxHash: boolean;
  paymentAction:
    | "continue_active_payment"
    | "renew_payment_session"
    | "view_status"
    | "rejected"
    | "paid"
    | "closed";
  canRenewPaymentSession: boolean;
  requiredConfirmations: number;
  confirmationCount?: number;
  confirmedAmount?: string | null;
  tokenContract: string;
  pricingStatus: string;
  overpaymentCredit: null;
  message?: string;
};

export type Trc20VerifyResponse = Trc20SessionResponse & {
  txHash: string;
  confirmationCount: number;
  confirmedAmount: string | null;
  message: string;
};

export function getTrc20ConfigStatus() {
  const rpcUrl = String(process.env.TRON_RPC_URL || DEFAULT_TRON_RPC_URL).trim().replace(/\/+$/, "");
  const receiveAddress = String(process.env.TRON_RECEIVE_ADDRESS ?? "").trim();
  const tokenContract = String(process.env.TRON_USDT_CONTRACT || TRON_USDT_CONTRACT).trim();
  const requiredConfirmations = Math.max(1, Number(process.env.TRON_REQUIRED_CONFIRMATIONS ?? TRON_REQUIRED_CONFIRMATIONS));
  const hasApiKey = Boolean(String(process.env.TRON_GRID_API_KEY ?? "").trim());

  return {
    rpcConfigured: /^https?:\/\/.+/.test(rpcUrl),
    receiveAddressValid: isValidTronAddress(receiveAddress),
    tokenContractValid: isValidTronAddress(tokenContract),
    requiredConfirmations: Number.isInteger(requiredConfirmations) ? requiredConfirmations : TRON_REQUIRED_CONFIRMATIONS,
    apiKeyPresent: hasApiKey,
  };
}

export function getTrc20ErrorMessage(error: unknown) {
  if (error instanceof Trc20PaymentError) return error.message;
  return "TRC20 链上支付服务暂时不可用，请稍后重试。";
}

function readTrc20Config(overrideRecipient?: string | null, overrideContract?: string | null): Trc20Config {
  const rpcUrl = String(process.env.TRON_RPC_URL || DEFAULT_TRON_RPC_URL).trim().replace(/\/+$/, "");
  const apiKey = String(process.env.TRON_GRID_API_KEY ?? "").trim() || null;
  const receiveAddress = String(overrideRecipient || process.env.TRON_RECEIVE_ADDRESS || "").trim();
  const tokenContract = String(overrideContract || process.env.TRON_USDT_CONTRACT || TRON_USDT_CONTRACT).trim();
  const tokenDecimals = Number(process.env.TRON_USDT_DECIMALS ?? TRON_USDT_DECIMALS);
  const requiredConfirmations = Math.max(1, Number(process.env.TRON_REQUIRED_CONFIRMATIONS ?? TRON_REQUIRED_CONFIRMATIONS));
  const fixedRate = String(process.env.CNY_USDT_FIXED_RATE ?? "").trim() || null;
  const rateTtlSeconds = Math.max(60, Number(process.env.CNY_USDT_RATE_TTL_SECONDS ?? 300));

  if (!/^https?:\/\/.+/.test(rpcUrl)) {
    throw new Trc20PaymentError("TRON_RPC_NOT_CONFIGURED", "TRON RPC 节点未配置或格式错误。", 503);
  }
  if (!isValidTronAddress(receiveAddress)) {
    throw new Trc20PaymentError("TRON_RECEIVE_ADDRESS_INVALID", "USDT-TRC20 收款地址未配置或校验失败。", 503);
  }
  if (!isValidTronAddress(tokenContract)) {
    throw new Trc20PaymentError("TRON_USDT_CONTRACT_INVALID", "USDT-TRC20 合约地址配置无效。", 503);
  }
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new Trc20PaymentError("TRON_USDT_DECIMALS_INVALID", "USDT-TRC20 精度配置无效。", 503);
  }

  return {
    rpcUrl,
    apiKey,
    chainId: TRON_MAINNET_CHAIN_ID,
    tokenContract,
    tokenDecimals,
    receiveAddress,
    requiredConfirmations: Number.isInteger(requiredConfirmations) ? requiredConfirmations : TRON_REQUIRED_CONFIRMATIONS,
    fixedRate,
    rateTtlSeconds: Number.isInteger(rateTtlSeconds) ? rateTtlSeconds : 300,
  };
}

function buildTronHeaders(config: Trc20Config, includeJsonContentType: boolean) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (config.apiKey) {
    headers["TRON-PRO-API-KEY"] = config.apiKey;
  }
  return headers;
}

async function tronPostJson(config: Trc20Config, endpoint: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRON_RPC_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.rpcUrl}${endpoint}`, {
      method: "POST",
      headers: buildTronHeaders(config, true),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Trc20PaymentError(
        "TRON_RPC_HTTP_ERROR",
        `波场节点响应异常（HTTP ${response.status}），请稍后重试。`,
        503
      );
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > TRON_MAX_RESPONSE_BYTES) {
      throw new Trc20PaymentError("TRON_RPC_RESPONSE_TOO_LARGE", "波场节点返回数据超限。", 503);
    }
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof Trc20PaymentError) throw error;
    throw new Trc20PaymentError("TRON_RPC_UNAVAILABLE", "无法连接 TRON 节点核验交易，请稍后重试。", 503);
  } finally {
    clearTimeout(timer);
  }
}

async function tronGetJson(config: Trc20Config, pathAndQuery: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRON_RPC_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.rpcUrl}${pathAndQuery}`, {
      method: "GET",
      headers: buildTronHeaders(config, false),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Trc20PaymentError(
        "TRON_GRID_HTTP_ERROR",
        `TronGrid 查询异常（HTTP ${response.status}），请稍后重试。`,
        503
      );
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > TRON_MAX_RESPONSE_BYTES) {
      throw new Trc20PaymentError("TRON_GRID_RESPONSE_TOO_LARGE", "TronGrid 返回数据超限。", 503);
    }
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof Trc20PaymentError) throw error;
    throw new Trc20PaymentError("TRON_GRID_UNAVAILABLE", "无法连接 TronGrid 扫描链上入账，请稍后重试。", 503);
  } finally {
    clearTimeout(timer);
  }
}

export async function findMatchingTrc20IncomingTxHashes(input: {
  receiveAddress: string;
  tokenContract?: string | null;
  expectedRawAmount: bigint | string;
  minTimestampMs: number;
  maxTimestampMs: number;
  excludedTxHashes?: Set<string>;
}): Promise<string[]> {
  const config = readTrc20Config(input.receiveAddress, input.tokenContract);
  const minTs = Math.max(0, Math.floor(input.minTimestampMs));
  const query = new URLSearchParams({
    contract_address: config.tokenContract,
    only_confirmed: "true",
    only_to: "true",
    limit: "50",
    min_timestamp: String(minTs),
  });
  const payload = await tronGetJson(
    config,
    `/v1/accounts/${encodeURIComponent(config.receiveAddress)}/transactions/trc20?${query.toString()}`
  );
  return matchTronGridTrc20Candidates({
    transfers: payload.data,
    expectedRecipient: config.receiveAddress,
    expectedContract: config.tokenContract,
    expectedRawAmount: input.expectedRawAmount,
    minTimestampMs: input.minTimestampMs,
    maxTimestampMs: input.maxTimestampMs,
    excludedTxHashes: input.excludedTxHashes,
  });
}

async function fetchTronReceiptBundle(config: Trc20Config, normalizedTxHash: string) {
  const [tx, txInfo, nowBlock] = await Promise.all([
    tronPostJson(config, "/wallet/gettransactionbyid", { value: normalizedTxHash }),
    tronPostJson(config, "/wallet/gettransactioninfobyid", { value: normalizedTxHash }),
    tronPostJson(config, "/wallet/getnowblock", {}),
  ]);
  const nowBlockHeader = (nowBlock.block_header as { raw_data?: { number?: unknown } } | undefined)?.raw_data;
  const nowBlockNumber = Number(nowBlockHeader?.number ?? 0);
  return { tx, txInfo, nowBlockNumber };
}

export async function inspectAccountRechargeTrc20Transfer(
  txHash: string,
  options?: { expectedRecipient?: string | null; expectedContract?: string | null }
): Promise<Trc20VerifiedEvidence> {
  const normalized = normalizeTronTxHash(txHash);
  if (!normalized) {
    throw new Trc20PaymentError(
      "TRC20_TX_HASH_INVALID",
      "请输入合法的 64 位十六进制 TRON 交易哈希（不含 0x 前缀）。",
      400
    );
  }

  const config = readTrc20Config(options?.expectedRecipient, options?.expectedContract);
  const { tx, txInfo, nowBlockNumber } = await fetchTronReceiptBundle(config, normalized);

  const verified = verifyTrc20TransferReceipt({
    txHash: normalized,
    tx,
    txInfo,
    nowBlockNumber,
    expectedContract: config.tokenContract,
    expectedRecipient: config.receiveAddress,
    decimals: config.tokenDecimals,
    requiredConfirmations: config.requiredConfirmations,
  });

  if (!verified.ok) {
    const status = verified.code === "TRC20_CONFIRMATIONS_INSUFFICIENT" || verified.code === "TRC20_TX_PENDING" ? 409 : 400;
    throw new Trc20PaymentError(verified.code, verified.message, status);
  }

  return verified.evidence;
}

function runThrottledAutoScan(key: string, work: () => Promise<boolean>): Promise<boolean> {
  const active = autoScanInFlight.get(key);
  if (active) return active;

  const last = autoScanLastRun.get(key) ?? 0;
  if (Date.now() - last < AUTO_SCAN_COOLDOWN_MS) {
    return Promise.resolve(false);
  }
  autoScanLastRun.set(key, Date.now());
  if (autoScanLastRun.size > 500) {
    const cutoff = Date.now() - 60_000;
    autoScanLastRun.forEach((ts, k) => {
      if (ts < cutoff) autoScanLastRun.delete(k);
    });
  }

  const promise = work()
    .catch((err) => {
      console.warn("[TRC20 AutoScan]", {
        key,
        message: err instanceof Error ? err.message : "auto-scan failed",
      });
      return false;
    })
    .finally(() => {
      if (autoScanInFlight.get(key) === promise) {
        autoScanInFlight.delete(key);
      }
    });
  autoScanInFlight.set(key, promise);
  return promise;
}

async function loadUsedTronTxHashes(service: SupabaseClient, candidates: string[]): Promise<Set<string>> {
  if (!candidates.length) return new Set();
  const { data } = await service
    .from("bep20_transaction_usage_registry")
    .select("tx_hash")
    .eq("chain_id", TRON_MAINNET_CHAIN_ID)
    .in("tx_hash", candidates);
  return new Set((data ?? []).map((row) => String((row as { tx_hash?: unknown }).tx_hash ?? "").toLowerCase()));
}

/**
 * Plan A: Zero-friction automatic on-chain scan for pending USDT-TRC20 account recharges.
 * Safe, non-fatal, throttled per recharge, and strictly verifies the full TRON receipt +
 * 19 confirmations + exact V3 4-decimal fingerprint + window before claiming & crediting.
 */
export async function tryAutoVerifyAccountRechargeTrc20(
  service: SupabaseClient,
  recharge: {
    id?: string | null;
    recharge_no?: string | null;
    status?: string | null;
    channel?: string | null;
    channel_code?: string | null;
    currency?: string | null;
    settlement_currency?: string | null;
    payment_address?: string | null;
    payment_token_contract?: string | null;
    expected_usdt_amount?: string | number | null;
    created_at?: string | null;
    expires_at?: string | null;
  }
): Promise<boolean> {
  const channelCode = String(recharge.channel_code ?? recharge.channel ?? "");
  const status = String(recharge.status ?? "");
  if (channelCode !== "usdt_trc20" || !["pending", "waiting_payment"].includes(status)) {
    return false;
  }
  const rechargeId = String(recharge.id ?? "").trim();
  const rechargeNo = String(recharge.recharge_no ?? "").trim();
  const receiveAddress = String(recharge.payment_address ?? "").trim();
  const tokenContract = String(recharge.payment_token_contract ?? TRON_USDT_CONTRACT).trim();
  const expectedUsdtAmount = String(recharge.expected_usdt_amount ?? "").trim();
  const createdAtMs = Date.parse(String(recharge.created_at ?? ""));
  const expiresAtMs = Date.parse(String(recharge.expires_at ?? ""));

  if (
    !rechargeId
    || !rechargeNo
    || !isValidTronAddress(receiveAddress)
    || !isValidTronAddress(tokenContract)
    || !expectedUsdtAmount
    || !Number.isFinite(createdAtMs)
    || !Number.isFinite(expiresAtMs)
    || Date.now() > expiresAtMs + AUTO_SCAN_GRACE_AFTER_EXPIRY_MS
  ) {
    return false;
  }

  const expectedRaw = decimalToRawTokenAmount(expectedUsdtAmount, TRON_USDT_DECIMALS);
  if (!expectedRaw) return false;

  return runThrottledAutoScan(`recharge:${rechargeNo}`, async () => {
    const minTimestampMs = createdAtMs - 2 * 60_000;
    const candidates = await findMatchingTrc20IncomingTxHashes({
      receiveAddress,
      tokenContract,
      expectedRawAmount: expectedRaw,
      minTimestampMs,
      maxTimestampMs: expiresAtMs,
    });
    if (!candidates.length) return false;

    const used = await loadUsedTronTxHashes(service, candidates);
    for (const candidateHash of candidates) {
      if (used.has(candidateHash)) continue;
      let evidence: Trc20VerifiedEvidence;
      try {
        evidence = await inspectAccountRechargeTrc20Transfer(candidateHash, {
          expectedRecipient: receiveAddress,
          expectedContract: tokenContract,
        });
      } catch {
        continue;
      }

      if (evidence.toAddress !== receiveAddress || evidence.tokenContract !== tokenContract) continue;
      if (compareRechargeDecimals(evidence.actualReceivedUsdt, expectedUsdtAmount) !== 0) continue;

      const blockTimeMs = Date.parse(evidence.blockTimestamp);
      if (!Number.isFinite(blockTimeMs) || blockTimeMs < minTimestampMs || blockTimeMs > expiresAtMs) continue;

      const { error: claimError } = await service.rpc("claim_account_recharge_trc20_transfer", {
        p_recharge_id: rechargeId,
        p_chain_id: evidence.chainId,
        p_tx_hash: evidence.txHash,
        p_log_index: evidence.logIndex,
        p_block_number: evidence.blockNumber,
        p_block_hash: evidence.blockHash,
        p_block_timestamp: evidence.blockTimestamp,
        p_token_contract: evidence.tokenContract,
        p_from_address: evidence.fromAddress,
        p_to_address: evidence.toAddress,
        p_raw_amount: evidence.rawAmount,
        p_actual_received_usdt: evidence.actualReceivedUsdt,
        p_confirmation_count: evidence.confirmationCount,
      });
      if (claimError) continue;

      const { error: completeError } = await service.rpc("complete_account_recharge_usdt_cny_v1", {
        p_recharge_id: rechargeId,
        p_provider_transaction_id: evidence.txHash,
      });
      if (completeError) throw completeError;
      return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Plan B: Direct Product Order Checkout USDT-TRC20 Closed Loop + Auto-Scan
// ---------------------------------------------------------------------------

export async function createTrc20PaymentSession(orderNo: string, userId: string): Promise<Trc20SessionResponse> {
  const service = requiredServiceClient();
  const order = await loadOwnedOrder(service, orderNo, userId);
  ensureOrderAllowsTrc20(order);

  const { data: channel, error: channelError } = await service
    .from("payment_channels")
    .select("enabled,configured,public_config")
    .or("code.eq.usdt_trc20,channel.eq.usdt_trc20")
    .maybeSingle();
  if (channelError || channel?.enabled !== true || channel?.configured !== true) {
    throw new Trc20PaymentError("CHANNEL_UNAVAILABLE", "USDT-TRC20 支付渠道当前不可用。", 503);
  }

  const publicConfig = (channel.public_config && typeof channel.public_config === "object"
    ? channel.public_config
    : {}) as Record<string, unknown>;
  const channelAddress = typeof publicConfig.payment_address === "string" ? publicConfig.payment_address.trim() : null;
  const channelContract = typeof publicConfig.token_contract === "string" ? publicConfig.token_contract.trim() : null;
  const config = readTrc20Config(
    process.env.TRON_RECEIVE_ADDRESS || channelAddress,
    process.env.TRON_USDT_CONTRACT || channelContract
  );

  const existing = await getReusableTrc20Session(service, order.id);
  if (existing) return toTrc20SessionResponse(order.order_no, existing, config, order);

  const dailyRate = await loadLatestRechargeDailyRate(service).catch(() => null);
  const basePricing = createBaseTrc20PricingSnapshot(order, config, dailyRate);
  const expiresAt = createPaymentExpiryWindow().expiresAt;

  // Reserve a unique 4-decimal amount so concurrent orders on the same receive address never collide.
  const reservedRawAmounts = await loadReservedTrc20RawAmounts(service, config.receiveAddress);
  const stepRaw = pow10(Math.max(0, config.tokenDecimals - ORDER_AMOUNT_SCALE));

  let pricing = pickUniqueTrc20Pricing(basePricing, reservedRawAmounts, config.tokenDecimals, stepRaw, 0);
  const paymentSession = await ensureTrc20PaymentSessionRecord(service, order, config, pricing, expiresAt);
  const orderPaymentId = await ensureTrc20OrderPaymentRecord(service, order, paymentSession, pricing);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (attempt > 0) {
      reservedRawAmounts.add(pricing.expectedRawAmount);
      pricing = pickUniqueTrc20Pricing(basePricing, reservedRawAmounts, config.tokenDecimals, stepRaw, attempt);
      await syncTrc20PaymentSessionAmount(service, paymentSession.id, orderPaymentId, order.id, pricing);
    }

    const payload = {
      order_id: order.id,
      payment_session_id: paymentSession.id,
      payment_id: orderPaymentId,
      payment_method: "usdt_trc20",
      network: "TRC20",
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

    if (!error && data) {
      return toTrc20SessionResponse(order.order_no, data as ChainSessionRow, config, order);
    }
    if (!isUniqueViolation(error)) throw error;

    // Check if another request concurrently created an active session for this same order.
    const raced = await getReusableTrc20Session(service, order.id);
    if (raced) return toTrc20SessionResponse(order.order_no, raced, config, order);
    // Otherwise it was an amount-uniqueness collision with another order; loop and pick the next slot.
  }

  throw new Trc20PaymentError("TRC20_AMOUNT_SLOT_EXHAUSTED", "当前支付金额通道繁忙，请稍后重试。", 503);
}

export async function getTrc20PaymentSession(orderNo: string, userId: string): Promise<Trc20SessionResponse> {
  const service = requiredServiceClient();
  const order = await loadOwnedOrder(service, orderNo, userId);
  let session = await getLatestTrc20Session(service, order.id);
  const config = readTrc20Config(session?.receive_address, session?.token_contract);

  if (!session) {
    return toTrc20SessionResponse(order.order_no, null, config, order);
  }

  // Trigger throttled auto-scan when payment is still pending / confirming.
  if (
    order.payment_status !== "paid"
    && ["waiting_payment", "submitted", "confirming"].includes(session.status)
    && Date.now() <= Date.parse(session.expires_at) + AUTO_SCAN_GRACE_AFTER_EXPIRY_MS
  ) {
    const changed = await tryAutoVerifyOrderTrc20Session(service, config, order, session);
    if (changed) {
      session = (await getLatestTrc20Session(service, order.id)) ?? session;
    }
  }

  const latestConfirmationCount = ["submitted", "confirming"].includes(session.status) && session.submitted_tx_hash
    ? await loadLatestTransactionConfirmations(service, session.id, session.submitted_tx_hash)
    : undefined;

  return {
    ...toTrc20SessionResponse(order.order_no, session, config, order),
    ...(latestConfirmationCount !== undefined ? { confirmationCount: latestConfirmationCount } : {}),
  };
}

export async function verifyTrc20TxHash(input: {
  orderNo: string;
  txHash: string;
  userId: string;
}): Promise<Trc20VerifyResponse> {
  const service = requiredServiceClient();
  const order = await loadOwnedOrder(service, input.orderNo, input.userId);
  assertUserOrderAcceptsTxHash(order);
  ensureOrderAllowsTrc20(order);

  const normalizedTxHash = normalizeTronTxHash(input.txHash);
  if (!normalizedTxHash) {
    throw new Trc20PaymentError(
      "TRC20_TX_HASH_INVALID",
      "请输入合法的 64 位十六进制 TRON 交易哈希（不含 0x 前缀）。",
      400
    );
  }

  const session = (await getReusableTrc20Session(service, order.id)) ?? (await getLatestTrc20Session(service, order.id));
  if (!session) {
    throw new Trc20PaymentError("CHAIN_SESSION_NOT_FOUND", "TRC20 支付单不存在，请重新打开支付页面。", 404);
  }
  const config = readTrc20Config(session.receive_address, session.token_contract);
  return verifyTrc20TxHashForOrder({ service, config, order, session, txHash: normalizedTxHash });
}

async function tryAutoVerifyOrderTrc20Session(
  service: SupabaseClient,
  config: Trc20Config,
  order: OrderRow,
  session: ChainSessionRow
): Promise<boolean> {
  return runThrottledAutoScan(`order:${session.id}`, async () => {
    const existingHash = normalizeTronTxHash(session.submitted_tx_hash ?? "");
    if (existingHash && ["submitted", "confirming"].includes(session.status)) {
      await verifyTrc20TxHashForOrder({
        service,
        config,
        order,
        session,
        txHash: existingHash,
        isAutoScan: true,
      });
      return true;
    }

    if (session.status !== "waiting_payment") return false;
    const createdAtMs = Date.parse(String(session.created_at ?? ""));
    const expiresAtMs = Date.parse(String(session.expires_at ?? ""));
    if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) return false;

    const expectedRaw = BigInt(String(session.expected_raw_amount).split(".")[0]);
    const minTimestampMs = createdAtMs - 2 * 60_000;
    const candidates = await findMatchingTrc20IncomingTxHashes({
      receiveAddress: session.receive_address,
      tokenContract: session.token_contract,
      expectedRawAmount: expectedRaw,
      minTimestampMs,
      maxTimestampMs: expiresAtMs,
    });
    if (!candidates.length) return false;

    const used = await loadUsedTronTxHashes(service, candidates);
    for (const candidateHash of candidates) {
      if (used.has(candidateHash)) continue;
      try {
        await verifyTrc20TxHashForOrder({
          service,
          config,
          order,
          session,
          txHash: candidateHash,
          isAutoScan: true,
        });
        return true;
      } catch (err) {
        if (err instanceof Trc20PaymentError && err.code === "TX_HASH_USED") {
          continue;
        }
        throw err;
      }
    }
    return false;
  });
}

async function verifyTrc20TxHashForOrder(input: {
  service: SupabaseClient;
  config: Trc20Config;
  order: OrderRow;
  session: ChainSessionRow;
  txHash: string;
  isAutoScan?: boolean;
}): Promise<Trc20VerifyResponse> {
  const { service, config, order, session, txHash, isAutoScan = false } = input;
  if (session.order_id !== order.id || session.payment_method !== "usdt_trc20") {
    throw new Trc20PaymentError("CHAIN_SESSION_NOT_FOUND", "链上支付单不存在或无权访问。", 404);
  }
  if (session.status === "paid") {
    return {
      ...toTrc20SessionResponse(order.order_no, session, config, order),
      txHash: session.submitted_tx_hash ?? txHash,
      confirmationCount: config.requiredConfirmations,
      confirmedAmount: session.confirmed_amount ? decimalString(session.confirmed_amount) : null,
      message: "该链上支付单已经处理完成。",
    };
  }
  if (session.manual_review_decision === "rejected") {
    throw new Trc20PaymentError("CHAIN_SESSION_REJECTED", "该链上支付已被管理员拒绝，不能重新提交交易。", 409);
  }
  if (USER_RECOVERY_BLOCKED_STATUSES.includes(session.status as never)) {
    return {
      ...toTrc20SessionResponse(order.order_no, session, config, order),
      txHash,
      confirmationCount: 0,
      confirmedAmount: session.confirmed_amount ? decimalString(session.confirmed_amount) : null,
      message: "该状态需要管理员重新核验。",
    };
  }

  const paymentSessionExpiresAt = isAutoScan
    ? await loadPaymentSessionExpiresAt(service, session.payment_session_id)
    : await assertUserSessionAcceptsTxHash(service, session, txHash);

  const { tx, txInfo, nowBlockNumber } = await fetchTronReceiptBundle(config, txHash);

  const verified = verifyTrc20TransferReceipt({
    txHash,
    tx,
    txInfo,
    nowBlockNumber,
    expectedContract: session.token_contract,
    expectedRecipient: session.receive_address,
    decimals: Number(session.token_decimals || TRON_USDT_DECIMALS),
    requiredConfirmations: config.requiredConfirmations,
    allowInsufficientConfirmations: true,
  });

  if (!verified.ok) {
    if (isAutoScan) {
      return {
        ...toTrc20SessionResponse(order.order_no, session, config, order),
        txHash,
        confirmationCount: 0,
        confirmedAmount: null,
        message: verified.message,
      };
    }
    const expired = Date.parse(session.expires_at) <= Date.now();
    const retryable = await updateNonFinalChainSession(service, session.id, {
      status: expired ? "expired" : "submitted",
      submitted_tx_hash: txHash,
      last_checked_at: new Date().toISOString(),
      failure_reason: verified.message,
    });
    return {
      ...toTrc20SessionResponse(order.order_no, retryable, config, order),
      txHash,
      confirmationCount: 0,
      confirmedAmount: null,
      message: verified.message,
    };
  }

  const evidence = verified.evidence;
  const expectedRaw = BigInt(String(session.expected_raw_amount).split(".")[0]);
  const transferStatus = decideBep20TransferStatus({
    rawAmount: evidence.rawAmount,
    expectedRawAmount: expectedRaw.toString(),
    confirmations: evidence.confirmationCount,
    requiredConfirmations: config.requiredConfirmations,
    transferTimestamp: evidence.blockTimestamp,
    orderPaymentExpiresAt: order.payment_expires_at,
    paymentSessionExpiresAt,
    sessionExpiresAt: session.expires_at,
  });

  // For TRC20 orders, overpayment routes cleanly to manual_review so funds are never mis-settled.
  const effectiveStatus = session.status === "expired"
    ? "manual_review"
    : transferStatus === "overpaid"
      ? "manual_review"
      : transferStatus;

  const claimResult = await claimTrc20ChainTransaction(service, {
    sessionId: session.id,
    orderId: order.id,
    evidence,
    status: effectiveStatus,
  });
  if (claimResult === "claimed_by_other_order") {
    throw new Trc20PaymentError("TX_HASH_USED", "该 TRON 链上交易已被其他订单或充值使用，不能重复提交。", 409);
  }

  const verificationTime = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: effectiveStatus,
    submitted_tx_hash: txHash,
    confirmed_amount: evidence.actualReceivedUsdt,
    confirmed_raw_amount: evidence.rawAmount,
    last_checked_at: verificationTime,
    failure_reason: effectiveStatus === "underpaid" ? "链上到账金额不足。" : null,
    manual_review_reason: effectiveStatus === "manual_review"
      ? transferStatus === "overpaid"
        ? "TRC20 链上实付金额高于订单应付金额，已转入人工核验处理。"
        : "订单支付时间异常，已转入人工核验处理。"
      : null,
    manual_review_decision: effectiveStatus === "manual_review" ? "pending" : null,
  };
  if (effectiveStatus === "underpaid") {
    patch.confirmed_at = session.confirmed_at ?? verificationTime;
  }

  let updated: ChainSessionRow = session;

  if (effectiveStatus === "verified") {
    if (!session.payment_session_id) {
      throw new Trc20PaymentError(
        "TRC20_PAYMENT_SESSION_LINK_MISSING",
        "链上支付已核验，但支付会话关联缺失，请联系客服处理。",
        503
      );
    }
    const completion = await preparePaymentCompletion(service, {
      sessionId: session.id,
      txHash,
      confirmedAmount: evidence.actualReceivedUsdt,
      confirmedRawAmount: evidence.rawAmount,
    });
    if (completion.result === "acquired" && completion.attemptId) {
      const completionInput = createBep20CompletionInput(
        decimalString(session.expected_amount),
        txHash,
        evidence.logIndex
      );
      let completionFinished = false;
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
        if (await isPaymentSessionPaid(service, session.payment_session_id)) {
          updated = await finishPaymentCompletion(service, session.id, completion.attemptId, "paid", null);
          completionFinished = true;
          await updateClaimedTrc20TransactionStatus(service, txHash, order.id, "paid");
          try {
            await deliverDigitalOrder(service, order.id, "callback");
          } catch (deliveryError) {
            const deliveryMessage = getDeliveryErrorMessage(deliveryError, "自动发货失败，等待安全重试");
            await service.from("payment_sessions").update({ last_error: deliveryMessage }).eq("id", session.payment_session_id);
          }
        } else {
          await finishPaymentCompletion(service, session.id, completion.attemptId, "payment_failed", getTrc20ErrorMessage(error));
          throw new Trc20PaymentError("TRC20_PAYMENT_COMPLETION_FAILED", "链上交易已核验，但订单支付完成失败，请联系客服。", 503);
        }
      }
      if (!completionFinished) {
        updated = await finishPaymentCompletion(service, session.id, completion.attemptId, "paid", null);
        await updateClaimedTrc20TransactionStatus(service, txHash, order.id, "paid");
      }
    } else {
      updated = await getChainSessionById(service, session.id);
    }
  } else {
    updated = await updateNonFinalChainSession(service, session.id, patch);
  }

  return {
    ...toTrc20SessionResponse(order.order_no, updated, config, order),
    txHash,
    confirmationCount: evidence.confirmationCount,
    confirmedAmount: evidence.actualReceivedUsdt,
    message: statusMessage(updated.status || effectiveStatus, evidence.confirmationCount, config.requiredConfirmations),
  };
}

function requiredServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Trc20PaymentError("SERVICE_ROLE_NOT_CONFIGURED", "服务端支付密钥未配置，无法处理链上支付。", 503);
  return service;
}

async function loadOwnedOrder(service: SupabaseClient, orderNo: string, userId: string): Promise<OrderRow> {
  const { data, error } = await service
    .from("orders")
    .select("id,order_no,user_id,status,payment_status,payment_method,payment_expires_at,total_amount,currency")
    .eq("order_no", orderNo.trim())
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) {
    throw new Trc20PaymentError("ORDER_NOT_FOUND", "订单不存在或无权访问。", 404);
  }
  return data as OrderRow;
}

function ensureOrderAllowsTrc20(order: OrderRow) {
  if (order.payment_method !== "usdt_trc20") {
    throw new Trc20PaymentError("PAYMENT_METHOD_INVALID", "该订单不是 USDT-TRC20 支付订单。", 400);
  }
  if (order.payment_status === "paid" || order.status === "paid") {
    throw new Trc20PaymentError("ORDER_ALREADY_PAID", "订单已支付，不能重复创建链上支付单。", 409);
  }
  if (["cancelled", "closed", "refunded", "failed", "expired"].includes(order.status)) {
    throw new Trc20PaymentError("ORDER_STATUS_INVALID", "当前订单状态不允许链上支付。", 400);
  }
}

const USER_EXPIRED_PAYMENT_MESSAGE = "支付会话已过期。如您已完成链上转账，请联系客服并提供订单号和交易哈希。";

function assertUserOrderAcceptsTxHash(order: OrderRow) {
  if (
    order.payment_status === "failed"
    || ["expired", "failed", "cancelled", "closed", "refunded"].includes(order.status)
  ) {
    throw new Trc20PaymentError("PAYMENT_SESSION_EXPIRED", USER_EXPIRED_PAYMENT_MESSAGE, 410);
  }
}

async function assertUserSessionAcceptsTxHash(service: SupabaseClient, session: ChainSessionRow, txHash: string) {
  if (["expired", "failed", "cancelled"].includes(session.status)) {
    throw new Trc20PaymentError("PAYMENT_SESSION_EXPIRED", USER_EXPIRED_PAYMENT_MESSAGE, 410);
  }
  const continuesSubmitted = ["submitted", "confirming"].includes(session.status)
    && String(session.submitted_tx_hash ?? "").trim().toLowerCase() === txHash;
  if (Date.parse(session.expires_at) <= Date.now() && !continuesSubmitted) {
    throw new Trc20PaymentError("PAYMENT_SESSION_EXPIRED", USER_EXPIRED_PAYMENT_MESSAGE, 410);
  }
  if (!session.payment_session_id) return null;
  const { data, error } = await service
    .from("payment_sessions")
    .select("status,expires_at")
    .eq("id", session.payment_session_id)
    .maybeSingle();
  if (error) throw error;
  const status = String(data?.status ?? "").trim();
  if (["expired", "failed", "cancelled", "closed"].includes(status) && !continuesSubmitted) {
    throw new Trc20PaymentError("PAYMENT_SESSION_EXPIRED", USER_EXPIRED_PAYMENT_MESSAGE, 410);
  }
  return typeof data?.expires_at === "string" ? data.expires_at : null;
}

async function loadPaymentSessionExpiresAt(service: SupabaseClient, paymentSessionId: string | null) {
  if (!paymentSessionId) return null;
  const { data, error } = await service
    .from("payment_sessions")
    .select("expires_at")
    .eq("id", paymentSessionId)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.expires_at === "string" ? data.expires_at : null;
}

async function getReusableTrc20Session(service: SupabaseClient, orderId: string) {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("order_id", orderId)
    .eq("payment_method", "usdt_trc20")
    .in("status", [...ACTIVE_CHAIN_SESSION_STATUSES])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChainSessionRow | null) ?? null;
}

async function getLatestTrc20Session(service: SupabaseClient, orderId: string) {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("order_id", orderId)
    .eq("payment_method", "usdt_trc20")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChainSessionRow | null) ?? null;
}

async function loadLatestTransactionConfirmations(service: SupabaseClient, sessionId: string, txHash: string) {
  const { data } = await service
    .from("chain_transactions")
    .select("confirmation_count")
    .eq("chain_payment_session_id", sessionId)
    .eq("tx_hash", txHash)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.confirmation_count === "number" ? data.confirmation_count : undefined;
}

function createBaseTrc20PricingSnapshot(
  order: OrderRow,
  config: Trc20Config,
  dailyRate?: RechargeDailyRateRow | null
): PricingSnapshot {
  const orderCurrency = String(order.currency || "CNY").trim().toUpperCase();
  const orderAmount = normalizeDecimal(order.total_amount, 18);
  if (decimalToScaled(orderAmount, 18) <= BigInt(0)) {
    throw new Trc20PaymentError("ORDER_AMOUNT_INVALID", "订单金额必须大于 0。", 400);
  }
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + config.rateTtlSeconds * 1000);

  if (orderCurrency === "USDT") {
    const expectedAmount = normalizeDecimal(orderAmount, ORDER_AMOUNT_SCALE, "ceil");
    const expectedRawAmount = decimalToRawTokenAmount(expectedAmount, config.tokenDecimals);
    if (!expectedRawAmount || expectedRawAmount <= BigInt(0)) {
      throw new Trc20PaymentError("USDT_AMOUNT_TOO_SMALL", "USDT 应付金额过小，无法创建链上支付单。", 400);
    }
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
    throw new Trc20PaymentError("ORDER_CURRENCY_UNSUPPORTED", "当前订单币种暂不支持 USDT-TRC20 定价。", 400);
  }

  const dynamicRate = dailyRate ? deriveOrderUsdtRateFromMarket(dailyRate.market_rate) : null;
  const resolvedRateRaw = dynamicRate ?? config.fixedRate;
  const resolvedRateSource = dynamicRate && dailyRate
    ? `daily_dynamic_rate:${dailyRate.effective_date}`
    : "manual_fixed_rate";

  if (!resolvedRateRaw) {
    throw new Trc20PaymentError("USDT_RATE_NOT_AVAILABLE", "USDT 汇率不可用，不能创建链上支付单。", 503);
  }

  const rate = normalizeDecimal(resolvedRateRaw, 18);
  const rateUnits = decimalToScaled(rate, 18);
  if (rateUnits <= BigInt(0)) {
    throw new Trc20PaymentError("CNY_USDT_FIXED_RATE_INVALID", "CNY/USDT 汇率必须大于 0。", 503);
  }
  const orderUnits = decimalToScaled(orderAmount, 18);
  const expectedUnits = ceilDiv(orderUnits * pow10(ORDER_AMOUNT_SCALE), rateUnits);
  if (expectedUnits <= BigInt(0)) {
    throw new Trc20PaymentError("USDT_AMOUNT_TOO_SMALL", "USDT 应付金额过小，无法创建链上支付单。", 400);
  }
  const expectedAmount = scaledToFixedDecimal(expectedUnits, ORDER_AMOUNT_SCALE);
  const expectedRawAmount = decimalToRawTokenAmount(expectedAmount, config.tokenDecimals);
  if (!expectedRawAmount) {
    throw new Trc20PaymentError("USDT_AMOUNT_TOO_SMALL", "USDT 应付金额换算失败。", 400);
  }
  return {
    orderCurrency,
    orderAmount,
    paymentCurrency: "USDT",
    exchangeRate: rate,
    exchangeRateSource: resolvedRateSource,
    exchangeRateFetchedAt: fetchedAt.toISOString(),
    exchangeRateExpiresAt: expiresAt.toISOString(),
    expectedAmount,
    expectedRawAmount,
    pricingStatus: "frozen",
  };
}

async function loadReservedTrc20RawAmounts(service: SupabaseClient, receiveAddress: string): Promise<Set<bigint>> {
  const reserved = new Set<bigint>();
  const nowIso = new Date().toISOString();
  const [sessionsRes, rechargesRes] = await Promise.all([
    service
      .from("chain_payment_sessions")
      .select("expected_raw_amount")
      .eq("payment_method", "usdt_trc20")
      .eq("receive_address", receiveAddress)
      .in("status", ["waiting_payment", "submitted", "confirming"]),
    service
      .from("account_recharge_amount_reservations")
      .select("expected_usdt_amount")
      .eq("payment_address", receiveAddress)
      .gt("quarantine_until", nowIso),
  ]);

  for (const row of sessionsRes.data ?? []) {
    const rawStr = String((row as { expected_raw_amount?: unknown }).expected_raw_amount ?? "").split(".")[0];
    if (/^\d+$/.test(rawStr)) reserved.add(BigInt(rawStr));
  }
  for (const row of rechargesRes.data ?? []) {
    const raw = decimalToRawTokenAmount(String((row as { expected_usdt_amount?: unknown }).expected_usdt_amount ?? ""), TRON_USDT_DECIMALS);
    if (raw) reserved.add(raw);
  }
  return reserved;
}

function pickUniqueTrc20Pricing(
  base: PricingSnapshot,
  reservedRaw: Set<bigint>,
  tokenDecimals: number,
  stepRaw: bigint,
  startOffset: number
): PricingSnapshot {
  for (let offset = startOffset; offset < startOffset + 500; offset += 1) {
    const candidateRaw = base.expectedRawAmount + BigInt(offset) * stepRaw;
    if (reservedRaw.has(candidateRaw)) continue;
    const expectedUnits = candidateRaw / stepRaw;
    return {
      ...base,
      expectedAmount: scaledToFixedDecimal(expectedUnits, ORDER_AMOUNT_SCALE),
      expectedRawAmount: candidateRaw,
    };
  }
  throw new Trc20PaymentError("TRC20_AMOUNT_SLOT_EXHAUSTED", "当前支付金额通道繁忙，请稍后重试。", 503);
}

type PaymentSessionRef = { id: string; sessionNo: string };

async function ensureTrc20PaymentSessionRecord(
  service: SupabaseClient,
  order: OrderRow,
  config: Trc20Config,
  pricing: PricingSnapshot,
  expiresAt: string
): Promise<PaymentSessionRef> {
  const { data: existing, error: existingError } = await service
    .from("payment_sessions")
    .select("id,session_no")
    .eq("business_type", "order")
    .eq("business_id", order.id)
    .eq("channel_code", "usdt_trc20")
    .in("status", ["pending", "processing"])
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id && existing.session_no) {
    await service
      .from("payment_sessions")
      .update({
        requested_amount: pricing.expectedAmount,
        payable_amount: pricing.expectedAmount,
        wallet_address: config.receiveAddress,
      })
      .eq("id", existing.id)
      .in("status", ["pending", "processing"]);
    return { id: String(existing.id), sessionNo: String(existing.session_no) };
  }

  const sessionNo = `TRC20${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const payload = {
    session_no: sessionNo,
    business_type: "order",
    business_id: order.id,
    business_no: order.order_no,
    user_id: order.user_id,
    channel_code: "usdt_trc20",
    provider: "tron_rpc",
    currency: "USDT",
    network: "TRC20",
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
    .eq("channel_code", "usdt_trc20")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (racedError) throw racedError;
  if (!raced?.id || !raced.session_no) throw error;
  return { id: String(raced.id), sessionNo: String(raced.session_no) };
}

async function ensureTrc20OrderPaymentRecord(
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
      throw new Trc20PaymentError("TRC20_ORDER_PAYMENT_CONFLICT", "支付记录已被其他订单占用。", 409);
    }
    if (String(existing.status) !== "paid") {
      const { error: updateError } = await service
        .from("order_payments")
        .update({
          payment_session_id: paymentSession.id,
          payment_method: "usdt_trc20",
          channel: "usdt_trc20",
          network: "TRC20",
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
    payment_method: "usdt_trc20",
    amount: pricing.orderAmount,
    currency: pricing.orderCurrency,
    status: "pending",
    business_type: "order",
    channel: "usdt_trc20",
    network: "TRC20",
    business_amount: pricing.orderAmount,
    fee_amount: 0,
    payable_amount: pricing.expectedAmount,
    payable_currency: pricing.paymentCurrency,
    received_amount: 0,
    order_amount: pricing.orderAmount,
    order_currency: pricing.orderCurrency,
  };
  const { data, error } = await service.from("order_payments").insert(payload).select("id").single();
  if (!error && data?.id) return String(data.id);
  if (!isUniqueViolation(error)) throw error;

  const { data: raced, error: racedError } = await service
    .from("order_payments")
    .select("id,order_id")
    .eq("payment_no", paymentNo)
    .maybeSingle();
  if (racedError) throw racedError;
  if (!raced?.id || String(raced.order_id) !== order.id) {
    throw new Trc20PaymentError("TRC20_ORDER_PAYMENT_CONFLICT", "支付记录并发创建冲突。", 409);
  }
  return String(raced.id);
}

async function syncTrc20PaymentSessionAmount(
  service: SupabaseClient,
  paymentSessionId: string,
  orderPaymentId: string,
  orderId: string,
  pricing: PricingSnapshot
) {
  await Promise.all([
    service
      .from("payment_sessions")
      .update({ requested_amount: pricing.expectedAmount, payable_amount: pricing.expectedAmount })
      .eq("id", paymentSessionId)
      .in("status", ["pending", "processing"]),
    service
      .from("order_payments")
      .update({ payable_amount: pricing.expectedAmount })
      .eq("id", orderPaymentId)
      .eq("order_id", orderId)
      .neq("status", "paid"),
  ]);
}

async function claimTrc20ChainTransaction(
  service: SupabaseClient,
  input: { sessionId: string; orderId: string; evidence: Trc20VerifiedEvidence; status: string }
) {
  const { data, error } = await service.rpc("claim_trc20_chain_transaction", {
    p_session_id: input.sessionId,
    p_order_id: input.orderId,
    p_chain_id: TRON_MAINNET_CHAIN_ID,
    p_tx_hash: input.evidence.txHash,
    p_log_index: input.evidence.logIndex,
    p_block_number: input.evidence.blockNumber,
    p_block_hash: input.evidence.blockHash,
    p_block_timestamp: input.evidence.blockTimestamp,
    p_token_contract: input.evidence.tokenContract,
    p_from_address: input.evidence.fromAddress,
    p_to_address: input.evidence.toAddress,
    p_raw_amount: input.evidence.rawAmount,
    p_normalized_amount: input.evidence.actualReceivedUsdt,
    p_confirmation_count: input.evidence.confirmationCount,
    p_status: input.status,
  });
  if (error) throw error;
  const result = String((data as { result?: unknown } | null)?.result ?? "");
  if (!["claimed", "already_claimed_by_same_order", "claimed_by_other_order"].includes(result)) {
    throw new Trc20PaymentError("TRC20_CLAIM_RESULT_INVALID", "链上交易占用结果无效。", 500);
  }
  return result;
}

async function preparePaymentCompletion(
  service: SupabaseClient,
  input: { sessionId: string; txHash: string; confirmedAmount: string; confirmedRawAmount: string }
) {
  const { data, error } = await service.rpc("prepare_bep20_payment_completion", {
    p_session_id: input.sessionId,
    p_tx_hash: input.txHash,
    p_confirmed_amount: input.confirmedAmount,
    p_confirmed_raw_amount: input.confirmedRawAmount,
    p_allow_stale_retry: false,
    p_review_attempt_id: null,
  });
  if (error) throw error;
  const row = (data ?? {}) as { result?: unknown; attempt_id?: unknown };
  return {
    result: String(row.result ?? ""),
    attemptId: typeof row.attempt_id === "string" ? row.attempt_id : null,
  };
}

async function finishPaymentCompletion(
  service: SupabaseClient,
  sessionId: string,
  attemptId: string,
  status: "paid" | "payment_failed",
  errorMessage: string | null
) {
  const { data, error } = await service.rpc("finish_bep20_payment_completion", {
    p_session_id: sessionId,
    p_attempt_id: attemptId,
    p_status: status,
    p_error_message: errorMessage,
    p_review_attempt_id: null,
  });
  if (error) throw error;
  const result = String((data as { result?: unknown } | null)?.result ?? "");
  if (result === "stale_attempt") {
    throw new Trc20PaymentError("TRC20_COMPLETION_ATTEMPT_STALE", "链上支付完成尝试已失效。", 409);
  }
  const row = (data as { session?: unknown } | null)?.session;
  if (!row) throw new Trc20PaymentError("TRC20_COMPLETION_RESULT_INVALID", "链上支付完成结果无效。", 500);
  return row as ChainSessionRow;
}

async function updateClaimedTrc20TransactionStatus(
  service: SupabaseClient,
  txHash: string,
  orderId: string,
  status: string
) {
  const { error } = await service
    .from("chain_transactions")
    .update({ status })
    .eq("chain_id", TRON_MAINNET_CHAIN_ID)
    .eq("tx_hash", txHash)
    .eq("order_id", orderId);
  if (error) throw error;
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

async function getChainSessionById(service: SupabaseClient, sessionId: string) {
  const { data, error } = await service
    .from("chain_payment_sessions")
    .select(chainSessionSelect)
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  return data as ChainSessionRow;
}

async function isPaymentSessionPaid(service: SupabaseClient, paymentSessionId: string) {
  const { data, error } = await service
    .from("payment_sessions")
    .select("status")
    .eq("id", paymentSessionId)
    .maybeSingle();
  if (error) return false;
  return data?.status === "paid";
}

function getUserPaymentAction(session: ChainSessionRow): Trc20SessionResponse["paymentAction"] {
  if (session.status === "paid") return "paid";
  if (session.manual_review_decision === "rejected") return "rejected";
  if (session.status === "expired") return "closed";
  if (["manual_review", "confirming", "verified", "completing", "payment_failed", "underpaid"].includes(session.status)) {
    return "view_status";
  }
  const expiresAt = Date.parse(String(session.expires_at ?? ""));
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "renew_payment_session";
  return "continue_active_payment";
}

function toTrc20SessionResponse(
  orderNo: string,
  session: ChainSessionRow | null,
  config: Trc20Config,
  order?: OrderRow
): Trc20SessionResponse {
  if (!session) {
    return {
      chainSessionId: null,
      orderNo,
      network: "TRON Network (TRC20)",
      chainId: config.chainId,
      asset: "USDT",
      orderCurrency: String(order?.currency || "CNY"),
      orderAmount: decimalString(order?.total_amount ?? "0"),
      paymentCurrency: "USDT",
      exchangeRate: "",
      exchangeRateSource: "not_frozen",
      exchangeRateFetchedAt: null,
      exchangeRateExpiresAt: null,
      expectedAmount: "",
      receiveAddress: "",
      expiresAt: "",
      status: "no_session",
      submittedTxHash: null,
      prefillSubmittedTxHash: false,
      paymentAction: "renew_payment_session",
      canRenewPaymentSession: Boolean(order && order.status === "pending_payment" && order.payment_status !== "paid"),
      requiredConfirmations: config.requiredConfirmations,
      tokenContract: config.tokenContract,
      pricingStatus: "not_frozen",
      overpaymentCredit: null,
    };
  }

  const paymentAction = getUserPaymentAction(session);
  return {
    chainSessionId: session.id,
    orderNo,
    network: "TRON Network (TRC20)",
    chainId: Number(session.chain_id ?? config.chainId),
    asset: "USDT",
    orderCurrency: String(session.order_currency || "CNY"),
    orderAmount: decimalString(session.order_amount ?? "0"),
    paymentCurrency: "USDT",
    exchangeRate: decimalString(session.exchange_rate ?? "1"),
    exchangeRateSource: String(session.exchange_rate_source || "unknown"),
    exchangeRateFetchedAt: session.exchange_rate_fetched_at ?? null,
    exchangeRateExpiresAt: session.exchange_rate_expires_at ?? null,
    expectedAmount: formatExpectedFourDecimals(session.expected_amount),
    receiveAddress: String(session.receive_address),
    expiresAt: String(session.expires_at),
    status: String(session.status),
    submittedTxHash: session.submitted_tx_hash ?? null,
    prefillSubmittedTxHash: shouldPrefillBep20TxHash({
      status: session.status,
      submittedTxHash: session.submitted_tx_hash,
      failureReason: session.failure_reason,
    }),
    paymentAction,
    canRenewPaymentSession: paymentAction === "renew_payment_session"
      && order?.status === "pending_payment"
      && order.payment_status !== "paid",
    requiredConfirmations: config.requiredConfirmations,
    confirmedAmount: session.confirmed_amount ? decimalString(session.confirmed_amount) : null,
    tokenContract: String(session.token_contract),
    pricingStatus: String(session.pricing_status || "frozen"),
    overpaymentCredit: null,
  };
}

function pow10(decimals: number) {
  let value = BigInt(1);
  for (let i = 0; i < decimals; i += 1) value *= BigInt(10);
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

function formatExpectedFourDecimals(value: unknown) {
  const text = decimalString(value);
  const [integerPart, fractionPart = ""] = text.split(".");
  if (fractionPart.length >= ORDER_AMOUNT_SCALE) {
    return `${integerPart}.${fractionPart}`;
  }
  return `${integerPart}.${fractionPart.padEnd(ORDER_AMOUNT_SCALE, "0")}`;
}

function decimalToScaled(value: string, scale: number) {
  const [integerPart, fractionPart = ""] = decimalString(value).split(".");
  const normalizedFraction = (fractionPart + "0".repeat(scale)).slice(0, scale);
  return BigInt(integerPart || "0") * pow10(scale) + BigInt(normalizedFraction || "0");
}

function scaledToDecimal(value: bigint, scale: number) {
  const base = pow10(scale);
  const integer = value / base;
  const fraction = (value % base).toString().padStart(scale, "0").replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

function scaledToFixedDecimal(value: bigint, scale: number) {
  const base = pow10(scale);
  const integer = value / base;
  const fraction = (value % base).toString().padStart(scale, "0");
  return `${integer}.${fraction}`;
}

function normalizeDecimal(value: unknown, scale: number, rounding: "truncate" | "ceil" = "truncate") {
  const text = decimalString(value);
  const [integerPart, fractionPart = ""] = text.split(".");
  if (fractionPart.length <= scale) {
    return fractionPart ? `${integerPart}.${fractionPart.replace(/0+$/, "")}`.replace(/\.$/, "") : integerPart;
  }
  const truncated = fractionPart.slice(0, scale);
  const hasRemainder = /[1-9]/.test(fractionPart.slice(scale));
  let units = BigInt(integerPart || "0") * pow10(scale) + BigInt(truncated || "0");
  if (rounding === "ceil" && hasRemainder) units += BigInt(1);
  return scaledToDecimal(units, scale);
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "23505";
}

function statusMessage(status: string, confirmations: number, required: number) {
  if (status === "paid") return "TRON 链上支付已确认到账。";
  if (status === "verified") return "链上交易已核验，正在完成订单支付与自动发货。";
  if (status === "completing") return "订单支付正在处理中，请勿重复提交。";
  if (status === "payment_failed") return "链上交易已核验，但订单支付完成失败，请联系客服处理。";
  if (status === "confirming") return `交易已上链，区块确认中（${confirmations} / ${required}），请稍候...`;
  if (status === "underpaid") return "链上到账金额不足，已记录为异常，请联系客服核对。";
  if (status === "manual_review") return "链上到账金额或时间异常，已转入人工核验。";
  if (status === "failed") return "链上交易校验失败。";
  return "TxHash 已提交，正在等待链上确认。";
}
