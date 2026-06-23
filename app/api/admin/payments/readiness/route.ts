import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { COMPLETE_PAYMENT_SERVICE_IMPLEMENTED } from "@/lib/payments/complete-payment-service";
import { UNIFIED_CALLBACK_IMPLEMENTED } from "@/lib/payments/payment-callback-service";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { PAYMENT_SESSION_REUSE_IMPLEMENTED } from "@/lib/payments/payment-session-service";
import { PROVIDER_INTERFACE_COMPLETE } from "@/lib/payments/providers";
import { RECONCILIATION_USES_COMPLETE_PAYMENT } from "@/lib/payments/reconciliation-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type ProbeResult = { ok: boolean; error?: string };

const tableFields: Record<string, string> = {
  payment_sessions:
    "id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,currency,network,requested_amount,fee_amount,payable_amount,status,payment_type,provider_order_no,provider_transaction_id,expires_at,paid_at,closed_at,created_at,updated_at",
  orders: "id,order_no,user_id,status,payment_status,total_amount,currency,paid_at",
  order_payments: "id,payment_no,order_id,user_id,status,provider_trade_no,paid_at",
  account_recharges:
    "id,recharge_no,user_id,channel_code,currency,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,status,provider_trade_no,paid_at",
  payment_channels:
    "id,channel,code,enabled,display_name,currency,network,minimum_amount,fee_rate,provider,configured",
  payment_callback_logs:
    "id,channel,payment_no,business_type,business_id,provider_trade_no,signature_result,process_result,payload_summary,received_at",
  balance_transactions:
    "id,transaction_no,user_id,business_type,business_id,direction,amount,balance_before,balance_after,currency,status,created_at",
  payment_reconciliations:
    "id,reconciliation_no,payment_session_id,business_type,business_id,result,recovery_status,created_at",
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

  const coreDatabase = await probeCoreDatabase(service);
  const channelChecks = await probeChannels(client);
  const serviceRoleConfigured = Boolean(service);
  const providerConfigured = channelChecks.channels.some(
    (channel: { enabled?: boolean; configured?: boolean }) =>
      channel.enabled === true && channel.configured === true
  );
  const codeChecks = {
    activeSessionReuse: PAYMENT_SESSION_REUSE_IMPLEMENTED,
    providerInterface: PROVIDER_INTERFACE_COMPLETE,
    unifiedCallbackRoute: UNIFIED_CALLBACK_IMPLEMENTED,
    completePaymentService: COMPLETE_PAYMENT_SERVICE_IMPLEMENTED,
    reconciliationRecoveryUsesCompletePayment: RECONCILIATION_USES_COMPLETE_PAYMENT,
    callbackRoutes: ["/api/payments/callback", "/api/payments/callback/[channel]"],
  };

  const requiredTableNames = [
    "payment_sessions",
    "orders",
    "order_payments",
    "account_recharges",
    "payment_channels",
    "payment_callback_logs",
    "balance_transactions",
    "payment_reconciliations",
    "profiles",
  ];
  const missingTables = requiredTableNames.filter((table) => !tableChecks[table]?.ok);
  const databaseCoreReady =
    coreDatabase.ok &&
    coreDatabase.checks.activeSessionUniqueIndex &&
    coreDatabase.checks.reservePaymentSessionRpc &&
    coreDatabase.checks.completeRechargeRpc &&
    coreDatabase.checks.completeOrderRpc &&
    coreDatabase.checks.completePaymentSessionRpc;
  const codeReady = Object.entries(codeChecks)
    .filter(([key]) => key !== "callbackRoutes")
    .every(([, value]) => value === true);

  const blockingReasons = [
    missingTables.length > 0 ? `缺少或字段不完整的表：${missingTables.join("、")}` : null,
    !serviceRoleConfigured ? "SUPABASE_SERVICE_ROLE_KEY 未配置" : null,
    !databaseCoreReady ? "支付核心 linkage migration 尚未完整执行" : null,
    !codeReady ? "支付核心代码链路未完整接通" : null,
  ].filter(Boolean);
  const partialReasons = [
    !providerConfigured ? "尚未配置并启用真实支付 Provider" : null,
  ].filter(Boolean);
  const status = blockingReasons.length > 0 ? "blocked" : partialReasons.length > 0 ? "partial" : "ready";

  return NextResponse.json({
    status,
    codeChecks,
    tableChecks,
    coreDatabase,
    channelChecks,
    providerConfigured,
    serviceRoleConfigured,
    blockingReasons,
    partialReasons,
    note:
      status === "partial"
        ? "核心支付链路已接通，可以开始接入真实 Provider；完成沙箱回调验证前不能标记 ready。"
        : status === "ready"
          ? "代码、数据库和 Provider 配置均已就绪，仍需完成真实渠道沙箱验收。"
          : "请先处理阻塞项，再开始接入真实 Provider。",
  });
}

async function probeTable(client: any, table: string, fields: string): Promise<ProbeResult> {
  try {
    const { error } = await client.from(table).select(fields).limit(1);
    return error ? { ok: false, error: getSafeErrorMessage(error, `${table} 检查失败`) } : { ok: true };
  } catch (error) {
    return { ok: false, error: getSafeErrorMessage(error, `${table} 检查失败`) };
  }
}

async function probeCoreDatabase(service: ReturnType<typeof getSupabaseServiceRoleClient>) {
  const defaults = {
    activeSessionUniqueIndex: false,
    reservePaymentSessionRpc: false,
    completeRechargeRpc: false,
    completeOrderRpc: false,
    completePaymentSessionRpc: false,
    callbackLogsTable: false,
    reconciliationTable: false,
  };
  if (!service) return { ok: false, checks: defaults, error: "服务端支付密钥未配置" };
  try {
    const { data, error } = await service.rpc("payment_core_readiness_probe");
    if (error) return { ok: false, checks: defaults, error: "支付核心 readiness RPC 尚未初始化" };
    return {
      ok: true,
      checks: { ...defaults, ...(data && typeof data === "object" ? data : {}) },
    };
  } catch (error) {
    return {
      ok: false,
      checks: defaults,
      error: getSafeErrorMessage(error, "支付核心数据库检查失败"),
    };
  }
}

async function probeChannels(client: any) {
  const { data, error } = await client
    .from("payment_channels")
    .select("code,channel,enabled,configured,provider,currency,network")
    .in("code", ["alipay", "wechat", "binance_pay", "usdt_trc20", "usdt_bep20"]);
  if (error) {
    return {
      ok: false,
      error: getSafeErrorMessage(error, "支付渠道配置读取失败"),
      channels: [] as Array<Record<string, unknown>>,
    };
  }
  return {
    ok: true,
    channels: (data ?? []).map((channel: any) => ({
      code: channel.code ?? channel.channel,
      enabled: channel.enabled === true,
      configured: channel.configured === true,
      provider: channel.provider ?? null,
      currency: channel.currency ?? null,
      network: channel.network ?? null,
    })),
  };
}
