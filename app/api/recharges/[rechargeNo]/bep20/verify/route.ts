import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  Bep20PaymentError,
  inspectAccountRechargeBep20Transfer,
} from "@/lib/payments/bep20-chain-service";
import { compareRechargeDecimals } from "@/lib/payments/recharge-rate.mjs";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { rechargeNo: string } }) {
  const requestId = randomUUID();
  if (!hasSupabaseServerConfig()) return safeFailure("充值核验服务不可用", "RECHARGE_VERIFY_UNAVAILABLE", requestId, 503);
  const supabase = getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return safeFailure("请先登录", "RECHARGE_AUTH_REQUIRED", requestId, 401);
  const sizeError = checkRequestSize(request, 4096);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("recharge_create", getUserRateLimitKey(authData.user.id, `recharge_bep20:${params.rechargeNo}`));
  if (!rateLimit.allowed) return rateLimit.response!;
  const body = await request.json().catch(() => null) as { txHash?: unknown } | null;
  if (!body || typeof body.txHash !== "string") return safeFailure("交易哈希格式无效", "RECHARGE_TX_HASH_INVALID", requestId, 400);
  const service = getSupabaseServiceRoleClient();
  if (!service) return safeFailure("充值核验服务不可用", "RECHARGE_VERIFY_UNAVAILABLE", requestId, 503);

  try {
    const { data: recharge, error } = await service.from("account_recharges")
      .select("id,recharge_no,user_id,status,channel,channel_code,currency,settlement_currency,payment_address,payment_token_contract,requested_cny_amount,expected_usdt_amount,locked_settlement_rate,expires_at")
      .eq("recharge_no", params.rechargeNo)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!recharge) return safeFailure("充值记录不存在", "RECHARGE_NOT_FOUND", requestId, 404);
    if (recharge.channel !== "usdt_bep20" || recharge.channel_code !== "usdt_bep20"
      || recharge.currency !== "CNY" || recharge.settlement_currency !== "USDT") {
      return safeFailure("该充值记录不支持 BEP20 核验", "RECHARGE_VERIFY_NOT_SUPPORTED", requestId, 400);
    }

    const evidence = await inspectAccountRechargeBep20Transfer(body.txHash);
    if (String(recharge.payment_address ?? "").toLowerCase() !== evidence.toAddress
      || String(recharge.payment_token_contract ?? "").toLowerCase() !== evidence.tokenContract) {
      return safeFailure("链上收款信息与充值单不一致", "RECHARGE_CHAIN_EVIDENCE_MISMATCH", requestId, 409);
    }
    const expectedUsdtAmount = String(recharge.expected_usdt_amount ?? "");
    const requestedCnyAmount = String(recharge.requested_cny_amount ?? "");
    if (
      !expectedUsdtAmount
      || !requestedCnyAmount
      || compareRechargeDecimals(evidence.actualReceivedUsdt, expectedUsdtAmount) !== 0
    ) {
      return safeFailure(
        "链上实际到账金额与本充值单精确应付金额不一致，已停止自动处理，请联系客服人工核对",
        "RECHARGE_AMOUNT_MISMATCH",
        requestId,
        409,
      );
    }

    const blockTime = Date.parse(evidence.blockTimestamp);
    const expiresAt = Date.parse(String(recharge.expires_at ?? ""));
    if (!Number.isFinite(blockTime) || !Number.isFinite(expiresAt) || blockTime > expiresAt) {
      return safeFailure(
        "该笔链上付款超出充值单有效期，已停止自动处理，请联系客服人工核对",
        "RECHARGE_PAYMENT_EXPIRED",
        requestId,
        409,
      );
    }
    const creditedCnyAmount = requestedCnyAmount;

    const { data, error: claimError } = await service.rpc("claim_account_recharge_bep20_transfer", {
      p_recharge_id: recharge.id,
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
    if (claimError) throw claimError;
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    return NextResponse.json({
      result: result.result === "already_verified" ? "already_verified" : "verified",
      status: "submitted",
      actualReceivedUsdt: evidence.actualReceivedUsdt,
      creditedCnyAmount,
      lockedSettlementRate: String(recharge.locked_settlement_rate),
      confirmationCount: evidence.confirmationCount,
      requestId,
    });
  } catch (error) {
    const status = error instanceof Bep20PaymentError ? error.status : 503;
    const code = error instanceof Bep20PaymentError ? error.code : "RECHARGE_VERIFY_FAILED";
    console.error("[AccountRechargeBep20Verify]", { requestId, code, status });
    return safeFailure(
      error instanceof Bep20PaymentError ? error.message : "充值核验失败，请按诊断编号联系客服",
      code,
      requestId,
      status,
    );
  }
}

function safeFailure(error: string, code: string, requestId: string, status: number) {
  return NextResponse.json({ error, code, requestId }, { status });
}
