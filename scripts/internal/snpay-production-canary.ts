import "server-only";

import { createPaymentSessionForInternalCanary, PaymentSessionError } from "@/lib/payments/payment-session-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const FIXED_AMOUNT = 1;
const CHANNELS = ["alipay", "wechat"] as const;
type CanaryChannel = (typeof CHANNELS)[number];

function fail(message: string): never {
  throw new Error(message);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const channel = args.find((arg) => !arg.startsWith("--"));
  if (!channel || !CHANNELS.includes(channel as CanaryChannel)) fail("CANARY_CHANNEL_INVALID");
  return { channel: channel as CanaryChannel, dryRun: args.includes("--dry-run") };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name}_MISSING`);
  return value;
}

function logicalKey(channel: CanaryChannel) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()).replaceAll("-", "");
  return `SNPAY-PROD-CANARY-${date}-${channel.toUpperCase()}`;
}

async function loadCanaryBusiness(channel: CanaryChannel) {
  const userId = requiredEnv("SNPAY_CANARY_USER_ID");
  const rechargeNo = requiredEnv(`SNPAY_CANARY_RECHARGE_NO_${channel.toUpperCase()}`);
  const service = getSupabaseServiceRoleClient();
  if (!service) fail("SERVICE_ROLE_NOT_CONFIGURED");
  const { data, error } = await service.from("account_recharges")
    .select("id,recharge_no,user_id,status,requested_amount,amount,payable_amount,fee_amount,currency,channel_code,provider")
    .eq("recharge_no", rechargeNo)
    .maybeSingle();
  if (error) throw error;
  if (!data || String(data.user_id) !== userId) fail("CANARY_ACTOR_OR_RECHARGE_NOT_FOUND");
  const amount = Number(data.requested_amount ?? data.amount);
  if (amount !== FIXED_AMOUNT || Number(data.payable_amount) !== FIXED_AMOUNT || Number(data.fee_amount ?? 0) !== 0) fail("CANARY_AMOUNT_NOT_FIXED_1_CNY");
  if (String(data.currency ?? "CNY") !== "CNY") fail("CANARY_CURRENCY_INVALID");
  if (!CHANNELS.includes(String(data.channel_code ?? "") as CanaryChannel)) fail("CANARY_RECHARGE_CHANNEL_INVALID");
  if (String(data.channel_code) !== channel) fail("CANARY_RECHARGE_CHANNEL_MISMATCH");
  if (String(data.provider ?? "") !== "snpay") fail("CANARY_PROVIDER_MISMATCH");
  if (!["pending", "waiting_payment", "processing"].includes(String(data.status))) fail("CANARY_RECHARGE_NOT_PAYABLE");
  return { userId, rechargeNo: String(data.recharge_no), service };
}

async function existingSession(service: ReturnType<typeof getSupabaseServiceRoleClient>, rechargeNo: string, channel: CanaryChannel, key: string) {
  if (!service) return null;
  const { data, error } = await service.from("payment_sessions")
    .select("session_no,status,provider_order_no,payment_url,qr_code_url,channel_code,business_no,metadata")
    .eq("business_type", "recharge").eq("business_no", rechargeNo).eq("channel_code", channel)
    .in("status", ["pending", "processing", "paid", "failed", "expired", "closed"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  const { channel, dryRun } = parseArgs();
  if (process.env.SNPAY_CANARY_EXECUTION !== "YES") fail("CANARY_EXECUTION_NOT_AUTHORIZED");
  if (process.env.SNPAY_API_BASE?.trim() !== "https://api.snpay.cn") fail("SNPAY_API_BASE_INVALID");
  if (dryRun) {
    const business = await loadCanaryBusiness(channel);
    const existing = await existingSession(business.service, business.rechargeNo, channel, logicalKey(channel));
    console.log(JSON.stringify({ ok: true, dryRun: true, channel, amount: FIXED_AMOUNT, logicalKey: logicalKey(channel), duplicate: Boolean(existing), existingStatus: existing?.status ?? null }));
    return;
  }
  const business = await loadCanaryBusiness(channel);
  const existing = await existingSession(business.service, business.rechargeNo, channel, logicalKey(channel));
  if (existing) {
    console.log(JSON.stringify({ ok: true, duplicate: true, channel, amount: FIXED_AMOUNT, logicalKey: logicalKey(channel), sessionNo: existing.session_no, status: existing.status, paymentUrl: existing.payment_url ?? null, qrCodeUrl: existing.qr_code_url ?? null }));
    return;
  }
  const session = await createPaymentSessionForInternalCanary({
    businessType: "recharge",
    businessNo: business.rechargeNo,
    channelCode: channel,
    userId: business.userId,
    clientIp: "127.0.0.1",
    clientDevice: "pc",
  });
  console.log(JSON.stringify({ ok: true, duplicate: false, channel, amount: FIXED_AMOUNT, logicalKey: logicalKey(channel), sessionNo: session.sessionNo, status: session.status, paymentUrl: session.paymentUrl ?? null, qrCodeUrl: session.qrCodeUrl ?? null, qrCodeValue: session.qrCodeValue ?? null }));
}

main().catch((error) => {
  const code = error instanceof PaymentSessionError ? error.code : "CANARY_FAILED";
  console.error(`${code}: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});

