import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { isPaymentSchemaMissing } from "@/lib/payments/admin-payment-queries";
import {
  PAYMENT_CHANNELS,
  maskSensitiveValue,
  type PaymentChannelConfig,
} from "@/lib/payments/admin-payment-types";

export const dynamic = "force-dynamic";

type ChannelPatch = {
  channel: string;
  enabled?: boolean;
  display_name?: string;
  min_amount?: number;
  fee_rate?: number;
  currency?: string;
  network?: string | null;
  sort_order?: number;
  provider_name?: string | null;
  api_url?: string | null;
  merchant_id?: string | null;
  app_id?: string | null;
  callback_url?: string | null;
  timeout_minutes?: number;
  secret_key?: string | null;
  signing_key?: string | null;
};

const channelSelect =
  "id,channel,enabled,display_name,min_amount,fee_rate,currency,network,sort_order,provider_name,api_url,merchant_id,app_id,callback_url,timeout_minutes,secret_key_masked,signing_key_masked,updated_at";

function normalizeConfig(row: Record<string, unknown>): PaymentChannelConfig {
  const secretLast4 =
    typeof row.secret_key_masked === "string"
      ? row.secret_key_masked.replace(/^\*+/, "")
      : null;

  return {
    id: String(row.id ?? row.channel ?? ""),
    channel: String(row.channel ?? ""),
    enabled: Boolean(row.enabled),
    display_name: String(row.display_name ?? row.channel ?? ""),
    min_amount: Number(row.min_amount ?? 0),
    fee_rate: Number(row.fee_rate ?? 0),
    currency: String(row.currency ?? "CNY"),
    network: typeof row.network === "string" ? row.network : null,
    sort_order: Number(row.sort_order ?? 100),
    provider_name: typeof row.provider_name === "string" ? row.provider_name : null,
    api_url: typeof row.api_url === "string" ? row.api_url : null,
    merchant_id_masked: maskSensitiveValue(row.merchant_id),
    app_id_masked: maskSensitiveValue(row.app_id),
    callback_url: typeof row.callback_url === "string" ? row.callback_url : null,
    timeout_minutes: Number(row.timeout_minutes ?? 30),
    secret_status: row.secret_key_masked || row.signing_key_masked ? "已配置" : "未配置",
    secret_last4: secretLast4,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function safeChannelSummary(row: Record<string, unknown>) {
  return {
    channel: row.channel,
    enabled: Boolean(row.enabled),
    display_name: row.display_name ?? null,
    min_amount: Number(row.min_amount ?? 0),
    fee_rate: Number(row.fee_rate ?? 0),
    currency: row.currency ?? "CNY",
    network: row.network ?? null,
    sort_order: Number(row.sort_order ?? 0),
    provider_name: row.provider_name ?? null,
    has_api_url: Boolean(row.api_url),
    has_merchant_id: Boolean(row.merchant_id),
    has_app_id: Boolean(row.app_id),
    has_callback_url: Boolean(row.callback_url),
    timeout_minutes: Number(row.timeout_minutes ?? 30),
    has_secret_key: Boolean(row.secret_key_masked),
    has_signing_key: Boolean(row.signing_key_masked),
  };
}

function fallbackConfigs(): PaymentChannelConfig[] {
  return PAYMENT_CHANNELS.map((channel, index) => ({
    id: channel.id,
    channel: channel.id,
    enabled: false,
    display_name: channel.label,
    min_amount: 0,
    fee_rate: 0,
    currency: channel.id.startsWith("usdt") ? "USDT" : "CNY",
    network: channel.network || null,
    sort_order: (index + 1) * 10,
    provider_name: null,
    api_url: null,
    merchant_id_masked: null,
    app_id_masked: null,
    callback_url: null,
    timeout_minutes: 30,
    secret_status: "未配置",
    secret_last4: null,
    updated_at: null,
  }));
}

export async function GET() {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  try {
    const { data, error } = await admin.supabase
      .from("payment_channels")
      .select(channelSelect)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeConfig);
    return NextResponse.json({ channels: rows.length ? rows : fallbackConfigs() });
  } catch (error) {
    if (isPaymentSchemaMissing(error)) {
      return NextResponse.json({
        channels: fallbackConfigs(),
        needsMigration: true,
        error: "支付渠道配置表尚未初始化，请先执行支付管理 migration。",
      });
    }
    return NextResponse.json({ error: "支付设置读取失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "update_payment_channel_config",
      module: "payments",
      targetType: "payment_channel",
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const parsedBody = (await request.json().catch(() => null)) as { channels?: ChannelPatch[] } | null;
  const parsedChannels = parsedBody?.channels;
  const channelPatches = Array.isArray(parsedChannels) ? parsedChannels : null;

  if (!channelPatches) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_payment_channel_config",
      module: "payments",
      targetType: "payment_channel",
      result: "failed",
      errorCode: "invalid_body",
      errorMessage: "缺少支付渠道配置",
    });
    return NextResponse.json({ error: "缺少支付渠道配置" }, { status: 400 });
  }

  const channelIds = channelPatches.map((channel) => channel.channel).filter(Boolean);

  try {
    const beforeResult = channelIds.length
      ? await admin.supabase.from("payment_channels").select(channelSelect).in("channel", channelIds)
      : { data: [], error: null };

    const rows = channelPatches.map((channel, index) => {
      const base: Record<string, unknown> = {
        channel: channel.channel,
        enabled: Boolean(channel.enabled),
        display_name: channel.display_name || channel.channel,
        min_amount: Number(channel.min_amount ?? 0),
        fee_rate: Number(channel.fee_rate ?? 0),
        currency: channel.currency || "CNY",
        network: channel.network || null,
        sort_order: Number(channel.sort_order ?? (index + 1) * 10),
        provider_name: channel.provider_name || null,
        api_url: channel.api_url || null,
        merchant_id: channel.merchant_id || null,
        app_id: channel.app_id || null,
        callback_url: channel.callback_url || null,
        timeout_minutes: Number(channel.timeout_minutes ?? 30),
        updated_by: admin.user.id,
      };
      if (channel.secret_key) base.secret_key_masked = maskSensitiveValue(channel.secret_key);
      if (channel.signing_key) base.signing_key_masked = maskSensitiveValue(channel.signing_key);
      return base;
    });

    const { error } = await admin.supabase.from("payment_channels").upsert(rows, { onConflict: "channel" });
    if (error) throw error;

    const { data, error: readError } = await admin.supabase
      .from("payment_channels")
      .select(channelSelect)
      .order("sort_order", { ascending: true });
    if (readError) throw readError;

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_payment_channel_config",
      module: "payments",
      targetType: "payment_channel",
      targetLabel: channelIds.join(", "),
      result: "success",
      beforeSummary: {
        channels: ((beforeResult.data ?? []) as Record<string, unknown>[]).map(safeChannelSummary),
      },
      afterSummary: {
        channels: rows.map(safeChannelSummary),
      },
    });

    return NextResponse.json({
      channels: ((data ?? []) as Record<string, unknown>[]).map(normalizeConfig),
      message: "支付设置已保存",
    });
  } catch (error) {
    const schemaMissing = isPaymentSchemaMissing(error);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_payment_channel_config",
      module: "payments",
      targetType: "payment_channel",
      targetLabel: channelIds.join(", "),
      result: "failed",
      errorCode: schemaMissing ? "payment_schema_missing" : null,
      errorMessage: schemaMissing ? "支付渠道配置表尚未初始化" : "支付设置保存失败",
    });

    return NextResponse.json(
      {
        error: schemaMissing ? "支付渠道配置表尚未初始化，请先执行支付管理 migration。" : "支付设置保存失败",
      },
      { status: schemaMissing ? 503 : 500 },
    );
  }
}
