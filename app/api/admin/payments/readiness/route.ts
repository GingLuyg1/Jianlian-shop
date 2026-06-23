import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type ProbeResult = {
  ok: boolean;
  error?: string;
};

const tableFields: Record<string, string> = {
  payment_sessions:
    "id,session_no,business_type,business_id,user_id,channel_code,provider,currency,network,requested_amount,fee_amount,payable_amount,status,payment_type,payment_url,qr_code_url,wallet_address,provider_order_no,provider_transaction_id,expires_at,paid_at,closed_at,created_at,updated_at",
  account_recharges:
    "id,recharge_no,user_id,channel_code,currency,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,status,provider_trade_no,paid_at",
  payment_channels:
    "id,channel,code,enabled,display_name,currency,network,minimum_amount,fee_rate,provider,configured,public_config,provider_config",
  payment_callback_logs:
    "id,channel,payment_no,business_type,provider_trade_no,signature_result,process_result,payload_summary,received_at",
  balance_transactions:
    "id,transaction_no,user_id,business_type,business_id,direction,amount,balance_before,balance_after,currency,status,created_at",
  payment_reconciliations:
    "id,payment_id,reconciliation_no,check_result,created_at",
  profiles: "id,email,role,balance,created_at",
};

export async function GET() {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const service = getSupabaseServiceRoleClient();
  const client = service ?? admin.supabase;
  const tableChecks: Record<string, ProbeResult> = {};

  await Promise.all(
    Object.entries(tableFields).map(async ([table, fields]) => {
      tableChecks[table] = await probeTable(client, table, fields);
    })
  );

  const { data: channels, error: channelError } = await client
    .from("payment_channels")
    .select("code,channel,enabled,configured,provider,currency,network")
    .in("code", ["alipay", "wechat", "binance_pay", "usdt_trc20", "usdt_bep20"]);

  const channelChecks = channelError
    ? { ok: false, error: getSafeErrorMessage(channelError, "支付渠道配置读取失败"), channels: [] }
    : {
        ok: true,
        channels: (channels ?? []).map((channel) => ({
          code: channel.code ?? channel.channel,
          enabled: channel.enabled === true,
          configured: channel.configured === true,
          provider: channel.provider ?? null,
          currency: channel.currency ?? null,
          network: channel.network ?? null,
        })),
      };

  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE);
  const callbackSecretConfigured = Boolean(process.env.PAYMENT_CALLBACK_SECRET || process.env.INTERNAL_PAYMENT_RECONCILE_KEY);
  const providerConfigured = Array.isArray(channelChecks.channels)
    ? channelChecks.channels.some((channel) => channel.enabled && channel.configured)
    : false;

  const requiredTablesOk = [
    "payment_sessions",
    "account_recharges",
    "payment_channels",
    "payment_callback_logs",
    "balance_transactions",
    "profiles",
  ].every((table) => tableChecks[table]?.ok);

  const missingCritical = [
    !requiredTablesOk && "关键支付表或字段未完整初始化",
    !serviceRoleConfigured && "SUPABASE_SERVICE_ROLE_KEY 未配置，可信回调和入账不可用",
    !callbackSecretConfigured && "支付回调/内部对账密钥未配置",
    !providerConfigured && "尚未启用并配置真实支付 Provider",
  ].filter(Boolean);

  const status = missingCritical.length === 0 ? "ready" : requiredTablesOk && serviceRoleConfigured ? "partial" : "blocked";

  return NextResponse.json({
    status,
    tableChecks,
    channelChecks,
    providerConfigured,
    serviceRoleConfigured,
    callbackSecretConfigured,
    callbackEndpoint: "/api/payments/callback",
    rechargeRpc: {
      name: "complete_account_recharge",
      expected: true,
      note: "请执行 payment_provider_core migration 后再用 Supabase SQL Editor 确认函数存在。",
    },
    balanceLedger: tableChecks.balance_transactions,
    missingCritical,
  });
}

async function probeTable(client: any, table: string, fields: string): Promise<ProbeResult> {
  try {
    const { error } = await client.from(table).select(fields).limit(1);
    if (error) return { ok: false, error: getSafeErrorMessage(error, `${table} 检查失败`) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getSafeErrorMessage(error, `${table} 检查失败`) };
  }
}
