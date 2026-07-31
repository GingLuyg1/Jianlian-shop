import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { isPaymentSchemaMissing } from "@/lib/payments/admin-payment-queries";
import {
  PAYMENT_CHANNELS,
  maskSensitiveValue,
  type PaymentChannelConfig,
} from "@/lib/payments/admin-payment-types";
import {
  expectedProviderForChannel,
  buildLegacyPaymentChannelCompatibilitySync,
  getCanonicalPaymentChannelCode,
  getLegacyPaymentChannelCompatibility,
  getPaymentChannelPairValidationError,
  getPaymentChannelPatchRuntimeError,
  getPaymentChannelValidationError,
  hasMatchingPaymentChannelVersion,
  isPaymentChannelConditionalUpdateConflict,
  parseSinglePaymentChannelPatchPayload,
  PAYMENT_CHANNEL_CONFLICT_STATUS,
  paymentReviewMode,
  resolvePaymentChannelFinancialValues,
  resolvePaymentChannelState,
} from "@/lib/payments/manual-channel-readiness.mjs";
import type {
  PaymentChannelCode,
  PaymentProviderCode,
} from "@/lib/payments/channel-types";

export const dynamic = "force-dynamic";

type ChannelPatch = {
  action?: "sync_compatibility";
  channel: PaymentChannelCode;
  code?: PaymentChannelCode;
  enabled?: boolean;
  configured?: boolean;
  display_name?: string;
  min_amount?: number | string;
  minimum_amount?: number | string;
  fee_rate?: number | string;
  currency?: string;
  network?: string | null;
  sort_order?: number | string;
  provider_name?: PaymentProviderCode | null;
  provider?: PaymentProviderCode;
  review_mode?: "provider" | "manual";
  maximum_amount?: number | string;
  payment_address?: string | null;
  token_contract?: string | null;
  payment_instructions?: string | null;
  api_url?: string | null;
  merchant_id?: string | null;
  app_id?: string | null;
  callback_url?: string | null;
  timeout_minutes?: number | string;
  secret_key?: string | null;
  signing_key?: string | null;
  updated_at?: string | null;
};

class ChannelValidationError extends Error {}
class ChannelConflictError extends Error {}

const channelSelect =
  "id,channel,code,enabled,configured,display_name,min_amount,minimum_amount,fee_rate,currency,network,sort_order,provider_name,provider,public_config,api_url,merchant_id,app_id,callback_url,timeout_minutes,secret_key_masked,signing_key_masked,updated_at";

const channelIds = new Set<PaymentChannelCode>(
  PAYMENT_CHANNELS.map((item) => item.id),
);

function isChannelCode(value: unknown): value is PaymentChannelCode {
  return channelIds.has(String(value) as PaymentChannelCode);
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicConfigOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function defaultProvider(channel: PaymentChannelCode): PaymentProviderCode {
  if (channel === "alipay" || channel === "wechat") return "generic_api";
  if (channel === "binance_pay") return "binance";
  return "crypto_address";
}

function normalizeProvider(
  value: unknown,
  channel: PaymentChannelCode,
): PaymentProviderCode {
  if (
    value === "generic_api"
    || value === "binance"
    || value === "crypto_address"
  ) {
    return value;
  }

  return defaultProvider(channel);
}

function normalizeConfig(
  row: Record<string, unknown>,
): PaymentChannelConfig | null {
  const channel = getCanonicalPaymentChannelCode(row);
  if (!isChannelCode(channel)) return null;
  const compatibility = getLegacyPaymentChannelCompatibility(row);
  if (getPaymentChannelPairValidationError({
    channel: row.channel,
    code: row.code,
    provider: compatibility?.provider ?? row.provider,
    provider_name: compatibility?.provider ?? row.provider_name,
    min_amount: row.min_amount,
    minimum_amount: row.minimum_amount,
  })) return null;
  const publicConfig = publicConfigOf(row.public_config);
  const reviewMode = paymentReviewMode(publicConfig);

  const minimumAmount = finiteNumber(
    row.minimum_amount ?? row.min_amount,
    0,
  );

  const provider = compatibility
    ? compatibility.provider as PaymentProviderCode
    : normalizeProvider(
        row.provider ?? row.provider_name,
        channel,
      );

  const secretLast4 =
    typeof row.secret_key_masked === "string"
      ? row.secret_key_masked.replace(/^\*+/, "")
      : null;

  return {
    id: String(row.id ?? channel),
    channel,
    code: channel,
    enabled: compatibility ? false : row.enabled === true,
    configured: compatibility ? false : row.configured === true,
    display_name: String(row.display_name ?? channel),
    min_amount: minimumAmount,
    minimum_amount: minimumAmount,
    fee_rate: finiteNumber(row.fee_rate),
    currency: row.currency === "USDT" ? "USDT" : "CNY",
    network: textOrNull(row.network),
    sort_order: Math.trunc(finiteNumber(row.sort_order, 100)),
    provider_name: provider,
    provider,
    review_mode: reviewMode,
    maximum_amount: finiteNumber(
      publicConfig.maximum_amount,
      row.currency === "USDT" ? 100000 : 1000000,
    ),
    payment_address: textOrNull(publicConfig.payment_address),
    token_contract: textOrNull(publicConfig.token_contract),
    payment_instructions: textOrNull(
      publicConfig.payment_instructions,
    ),
    api_url: textOrNull(row.api_url),
    merchant_id_masked: maskSensitiveValue(row.merchant_id),
    app_id_masked: maskSensitiveValue(row.app_id),
    callback_url: textOrNull(row.callback_url),
    timeout_minutes: Math.trunc(
      finiteNumber(row.timeout_minutes, 30),
    ),
    secret_status:
      row.secret_key_masked || row.signing_key_masked
        ? "已配置"
        : "未配置",
    secret_last4: secretLast4,
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : null,
    compatibility_issue:
      compatibility
        ? "legacy_provider_field_missing"
        : null,
    compatibility_needs_sync:
      compatibility?.compatibility_needs_sync ?? false,
    compatibility_read_only:
      compatibility?.compatibility_read_only ?? false,
  };
}

function normalizeConfigs(rows: Record<string, unknown>[]) {
  return rows
    .map(normalizeConfig)
    .filter(
      (item): item is PaymentChannelConfig => item !== null,
    );
}

function fallbackConfigs(): PaymentChannelConfig[] {
  return PAYMENT_CHANNELS.map((channel, index) => {
    const provider = defaultProvider(channel.id);
    const currency = channel.id.startsWith("usdt")
      || channel.id === "binance_pay"
      ? "USDT"
      : "CNY";

    return {
      id: channel.id,
      channel: channel.id,
      code: channel.id,
      enabled: false,
      configured: false,
      display_name: channel.label,
      min_amount: 0,
      minimum_amount: 0,
      fee_rate: 0,
      currency,
      network: channel.network || null,
      sort_order: (index + 1) * 10,
      provider_name: provider,
      provider,
      review_mode: "provider",
      maximum_amount: currency === "USDT" ? 100000 : 1000000,
      payment_address: null,
      token_contract: null,
      payment_instructions: null,
      api_url: null,
      merchant_id_masked: null,
      app_id_masked: null,
      callback_url: null,
      timeout_minutes: 30,
      secret_status: "未配置",
      secret_last4: null,
      updated_at: null,
    };
  });
}

function safeChannelSummary(row: Record<string, unknown>) {
  const publicConfig = publicConfigOf(row.public_config);

  return {
    channel: row.channel ?? row.code ?? null,
    enabled: row.enabled === true,
    configured: row.configured === true,
    display_name: row.display_name ?? null,
    min_amount: finiteNumber(
      row.minimum_amount ?? row.min_amount,
    ),
    fee_rate: finiteNumber(row.fee_rate),
    currency: row.currency ?? "CNY",
    network: row.network ?? null,
    sort_order: finiteNumber(row.sort_order),
    provider: row.provider ?? row.provider_name ?? null,
    review_mode: publicConfig.review_mode ?? null,
    maximum_amount: finiteNumber(publicConfig.maximum_amount),
    has_payment_address: Boolean(
      textOrNull(publicConfig.payment_address),
    ),
    has_token_contract: Boolean(
      textOrNull(publicConfig.token_contract),
    ),
    has_payment_instructions: Boolean(
      textOrNull(publicConfig.payment_instructions),
    ),
    has_api_url: Boolean(row.api_url),
    has_merchant_id: Boolean(row.merchant_id),
    has_app_id: Boolean(row.app_id),
    has_callback_url: Boolean(row.callback_url),
    timeout_minutes: finiteNumber(row.timeout_minutes, 30),
    has_secret_key: Boolean(row.secret_key_masked),
    has_signing_key: Boolean(row.signing_key_masked),
  };
}

function nextText(
  incoming: string | null | undefined,
  existing: unknown,
) {
  return incoming === undefined
    ? textOrNull(existing)
    : textOrNull(incoming);
}

function buildChannelRow(
  patch: ChannelPatch,
  current: Record<string, unknown>,
  adminId: string,
) {
  const pairError = getPaymentChannelPatchRuntimeError(patch);
  if (pairError) throw new ChannelValidationError(pairError);
  if (!getCanonicalPaymentChannelCode(current)) {
    throw new ChannelValidationError(
      "Stored payment channel identity is inconsistent.",
    );
  }

  const channel = patch.channel;
  const currentPublicConfig = publicConfigOf(
    current.public_config,
  );

  const currencyInput = patch.currency ?? current.currency;
  if (typeof currencyInput !== "string") {
    throw new ChannelValidationError(
      "Payment channel currency is invalid.",
    );
  }
  const currency = currencyInput;

  const financial = resolvePaymentChannelFinancialValues(
    patch,
    {
      min_amount: current.min_amount,
      minimum_amount: current.minimum_amount,
      maximum_amount: currentPublicConfig.maximum_amount,
      fee_rate: current.fee_rate,
      sort_order: current.sort_order,
      timeout_minutes: current.timeout_minutes,
    },
  );
  if (!financial.ok || !financial.values) {
    throw new ChannelValidationError(financial.error);
  }
  const {
    minimumAmount,
    maximumAmount,
    feeRate,
    sortOrder,
    timeoutMinutes,
  } = financial.values;

  const currentProvider = normalizeProvider(
    current.provider ?? current.provider_name,
    channel,
  );
  const currentPairError = getPaymentChannelPairValidationError({
    channel: current.channel,
    code: current.code,
    provider: current.provider,
    provider_name: current.provider_name,
    min_amount: current.min_amount,
    minimum_amount: current.minimum_amount,
  });
  if (currentPairError) {
    throw new ChannelValidationError(
      "Stored payment channel provider identity is inconsistent.",
    );
  }
  const rawProvider =
    patch.provider
      ?? patch.provider_name
      ?? current.provider
      ?? current.provider_name
      ?? expectedProviderForChannel(channel);
  if (
    rawProvider !== "generic_api"
    && rawProvider !== "binance"
    && rawProvider !== "crypto_address"
  ) {
    throw new ChannelValidationError(
      `${channel} has an unsupported provider`,
    );
  }
  const provider = rawProvider;

  const currentReviewMode = paymentReviewMode(
    currentPublicConfig,
  );
  const reviewMode =
    patch.review_mode
    ?? currentReviewMode;
  if (reviewMode !== "manual" && reviewMode !== "provider") {
    throw new ChannelValidationError(
      "Payment channel review mode is invalid.",
    );
  }

  const paymentAddress = nextText(
    patch.payment_address,
    currentPublicConfig.payment_address,
  );

  const tokenContract = nextText(
    patch.token_contract,
    currentPublicConfig.token_contract,
  );

  const paymentInstructions = nextText(
    patch.payment_instructions,
    currentPublicConfig.payment_instructions,
  );

  const requestedEnabled =
    patch.enabled === undefined
      ? current.enabled === true
      : patch.enabled === true;

  const nextNetwork = patch.network === undefined
    ? current.network ?? null
    : patch.network;
  const validationError =
    getPaymentChannelValidationError({
      channel,
      currency,
      provider,
      feeRate,
      minimumAmount,
      maximumAmount,
      network: nextNetwork,
      merchantId: patch.merchant_id,
      appId: patch.app_id,
    });

  if (validationError) {
    throw new ChannelValidationError(validationError);
  }
  const publicConfig = {
    ...currentPublicConfig,
    review_mode: reviewMode,
    payment_mode: reviewMode,
    maximum_amount: maximumAmount,
    payment_address: paymentAddress,
    token_contract: tokenContract,
    payment_instructions: paymentInstructions,
  };

  const state = resolvePaymentChannelState({
    channel,
    currentReviewMode,
    currentProvider,
    nextReviewMode: reviewMode,
    nextProvider: provider,
    requestedEnabled,
    paymentAddress,
    tokenContract,
    paymentInstructions,
    // Provider secrets are intentionally not read by this route. Until a
    // trusted runtime readiness source exists, provider mode stays disabled.
    providerTrustedConfigured: false,
  });

  const modeOrProviderChanged =
    currentReviewMode !== reviewMode
    || currentProvider !== provider;

  if (
    requestedEnabled
    && !state.configured
    && reviewMode === "manual"
    && !modeOrProviderChanged
  ) {
    throw new ChannelValidationError(
      `${channel} 配置不完整，不能启用。`,
    );
  }

  const row: Record<string, unknown> = {
    channel,
    code: channel,
    enabled: state.enabled,
    configured: state.configured,
    display_name:
      textOrNull(patch.display_name)
      ?? textOrNull(current.display_name)
      ?? channel,
    min_amount: minimumAmount,
    minimum_amount: minimumAmount,
    fee_rate: feeRate,
    currency,
    network: nextNetwork,
    sort_order: sortOrder,
    provider_name: provider,
    provider,
    public_config: publicConfig,
    api_url: nextText(patch.api_url, current.api_url),
    callback_url: nextText(
      patch.callback_url,
      current.callback_url,
    ),
    timeout_minutes: timeoutMinutes,
    updated_by: adminId,
  };

  if (patch.merchant_id !== undefined) {
    row.merchant_id = textOrNull(patch.merchant_id);
  }

  if (patch.app_id !== undefined) {
    row.app_id = textOrNull(patch.app_id);
  }

  if (patch.secret_key) {
    row.secret_key_masked = maskSensitiveValue(
      patch.secret_key,
    );
  }

  if (patch.signing_key) {
    row.signing_key_masked = maskSensitiveValue(
      patch.signing_key,
    );
  }

  return row;
}

export async function GET() {
  const admin = await getServerAdminContext();

  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message },
      { status: admin.status },
    );
  }

  try {
    const { data, error } = await admin.supabase
      .from("payment_channels")
      .select(channelSelect)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const rows = normalizeConfigs(
      (data ?? []) as Record<string, unknown>[],
    );

    if (rows.length !== (data ?? []).length) {
      return NextResponse.json({
        channels: fallbackConfigs(),
        dataSource: "read_error",
        readOnly: true,
        error: "支付渠道记录存在不一致，当前仅显示只读模板。",
      });
    }

    if (!rows.length) {
      return NextResponse.json({
        channels: fallbackConfigs(),
        dataSource: "fallback",
        readOnly: true,
        error:
          "数据库中没有可编辑的支付渠道记录，当前仅显示只读模板。",
      });
    }

    return NextResponse.json({
      channels: rows,
      dataSource: "loaded",
      readOnly: false,
    });
  } catch (error) {
    if (isPaymentSchemaMissing(error)) {
      return NextResponse.json({
        channels: fallbackConfigs(),
        dataSource: "needs_migration",
        readOnly: true,
        needsMigration: true,
        error:
          "支付渠道配置表尚未初始化，请先执行支付管理 migration。",
      });
    }

    return NextResponse.json(
      { error: "支付设置读取失败" },
      { status: 500 },
    );
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

    return NextResponse.json(
      { error: admin.message },
      { status: admin.status },
    );
  }

  const parsedBody = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const parsedPatch = parseSinglePaymentChannelPatchPayload(
    parsedBody?.channels,
  );
  if (!parsedPatch.ok) {
    return NextResponse.json(
      {
        error: parsedPatch.error,
        code: parsedPatch.code,
      },
      { status: 400 },
    );
  }
  const patch = parsedPatch.patch as ChannelPatch;
  const requestedChannelIds = [patch.channel];

  try {
    const patchRuntimeError =
      getPaymentChannelPatchRuntimeError(patch);
    if (patchRuntimeError) {
      throw new ChannelValidationError(
        patchRuntimeError,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, "action")
      && patch.action !== "sync_compatibility"
    ) {
      throw new ChannelValidationError(
        "Payment channel action is invalid.",
      );
    }
    const beforeResult = await admin.supabase
      .from("payment_channels")
      .select(channelSelect)
      .eq("channel", patch.channel)
      .maybeSingle();

    if (beforeResult.error) throw beforeResult.error;

    const current = beforeResult.data as Record<string, unknown> | null;
    if (
      !current
      || !Object.prototype.hasOwnProperty.call(patch, "updated_at")
      || !hasMatchingPaymentChannelVersion(
        patch.updated_at,
        current.updated_at,
      )
    ) {
      throw new ChannelConflictError(
        "支付渠道配置已发生变化，请刷新后重试。",
      );
    }

    const compatibilitySync =
      patch.action === "sync_compatibility"
        ? buildLegacyPaymentChannelCompatibilitySync(current)
        : null;
    if (
      patch.action === "sync_compatibility"
      && compatibilitySync === null
    ) {
      throw new ChannelValidationError(
        "Payment channel compatibility state cannot be synchronized.",
      );
    }
    if (
      patch.action !== "sync_compatibility"
      && getLegacyPaymentChannelCompatibility(current)
    ) {
      throw new ChannelValidationError(
        "Payment channel compatibility fields require a separately authorized synchronization.",
      );
    }

    const row = compatibilitySync
      ? {
          ...compatibilitySync,
          updated_by: admin.user.id,
        }
      : buildChannelRow(
          patch,
          current,
          admin.user.id,
        );

    const { data: updated, error } = await admin.supabase
      .from("payment_channels")
      .update(row)
      .eq("channel", patch.channel)
      .eq("updated_at", patch.updated_at as string)
      .select(channelSelect)
      .maybeSingle();

    if (error) throw error;
    if (isPaymentChannelConditionalUpdateConflict(updated)) {
      await admin.supabase
        .from("payment_channels")
        .select("channel,updated_at")
        .eq("channel", patch.channel)
        .maybeSingle();
      throw new ChannelConflictError(
        "支付渠道配置已发生变化，请刷新后重试。",
      );
    }

    await writeAdminAuditLog({
      request,
      admin: {
        id: admin.user.id,
        email: admin.user.email,
      },
      action: "update_payment_channel_config",
      module: "payments",
      targetType: "payment_channel",
      targetLabel: requestedChannelIds.join(", "),
      result: "success",
      beforeSummary: {
        channels: [safeChannelSummary(current)],
      },
      afterSummary: {
        channels: [safeChannelSummary(row)],
      },
    });

    return NextResponse.json({
      channels: normalizeConfigs(
        [updated as Record<string, unknown>],
      ),
      message: "支付设置已保存",
    });
  } catch (error) {
    const validationError =
      error instanceof ChannelValidationError;
    const conflictError =
      error instanceof ChannelConflictError;
    const schemaMissing = isPaymentSchemaMissing(error);

    const errorMessage = validationError || conflictError
      ? error.message
      : schemaMissing
        ? "支付渠道配置表尚未初始化"
        : "支付设置保存失败";

    await writeAdminAuditLog({
      request,
      admin: {
        id: admin.user.id,
        email: admin.user.email,
      },
      action: "update_payment_channel_config",
      module: "payments",
      targetType: "payment_channel",
      targetLabel: requestedChannelIds.join(", "),
      result: "failed",
        errorCode: conflictError
          ? "payment_channel_update_conflict"
          : validationError
          ? "invalid_channel_config"
        : schemaMissing
          ? "payment_schema_missing"
          : null,
      errorMessage,
    });

    return NextResponse.json(
      {
        error: validationError || conflictError
          ? error.message
          : schemaMissing
            ? "支付渠道配置表尚未初始化，请先执行支付管理 migration。"
            : "支付设置保存失败",
      },
      {
        status: conflictError
          ? PAYMENT_CHANNEL_CONFLICT_STATUS
          : validationError
          ? 400
          : schemaMissing
            ? 503
            : 500,
      },
    );
  }
}
