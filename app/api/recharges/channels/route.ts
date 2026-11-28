import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getSafePublicPaymentChannelError,
  getSafePublicPaymentChannelLog,
} from "@/lib/payments/manual-channel-readiness.mjs";

import {
  isPaymentSchemaUnavailable,
  normalizeChannelRow,
} from "@/lib/payments/recharge-utils";
import { getPaymentProviderCapabilities } from "@/lib/payments/providers";
import { providerSupportsChannel } from "@/lib/payments/provider-contracts.mjs";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Public, non-personal projection: a short in-process cache avoids a database
// round trip for every page that prefetches channels.
const CHANNEL_CACHE_TTL_MS = 15_000;
let channelCache: { body: { channels: unknown[] }; expiresAt: number } | null = null;

export async function GET() {
  const requestId = randomUUID();
  if (channelCache && Date.now() < channelCache.expiresAt) {
    return NextResponse.json(channelCache.body);
  }
  if (!hasSupabaseServerConfig()) {
    const publicError = getSafePublicPaymentChannelError(
      "service_unavailable",
    );
    console.error(
      "[Recharge channels]",
      getSafePublicPaymentChannelLog({
        code: publicError.code,
        requestId,
        status: 503,
      }),
    );
    return NextResponse.json(publicError, { status: 503 });
  }
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("payment_channels")
      .select("channel,code,enabled,configured,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,public_config,sort_order")
      .eq("enabled", true)
      .eq("configured", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const channels = ((data ?? []) as Record<string, unknown>[])
      .map(normalizeChannelRow)
      .filter(
        (
          channel,
        ): channel is NonNullable<typeof channel> =>
          Boolean(
            channel
            && channel.enabled
            && channel.status === "active",
          ),
      );
    const effectiveChannels = channels.filter((channel) => {
      if (channel.code === "usdt_bep20" || channel.code === "usdt_trc20") return true; // Chain watchers are not PaymentProvider adapters.
      const capability = getPaymentProviderCapabilities(channel.provider);
      return capability.supportsCreate && providerSupportsChannel(capability, channel.code, channel.currency);
    }).map((channel) => {
      const capability = getPaymentProviderCapabilities(channel.provider);
      const isUsdtChainChannel = channel.code === "usdt_bep20" || channel.code === "usdt_trc20";
      const normalizedMin = isUsdtChainChannel
        ? 0.01
        : Math.min(0.01, Math.max(channel.minimumAmount, capability.minimumAmount ?? 0));
      const normalizedMax = isUsdtChainChannel
        ? undefined
        : Math.max(1000000, Math.min(channel.maximumAmount ?? capability.maximumAmount ?? Number.POSITIVE_INFINITY, capability.maximumAmount ?? Number.POSITIVE_INFINITY));
      return {
        ...channel,
        minimum_amount: normalizedMin,
        minimumAmount: normalizedMin,
        maximumAmount: Number.isFinite(normalizedMax) ? normalizedMax : undefined,
        providerExternalFeeDisclosure: capability.providerExternalFeeDisclosure ?? undefined,
      };
    });
    const body = { channels: effectiveChannels };
    channelCache = { body, expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS };
    return NextResponse.json(body);
  } catch (error) {
    const schemaMissing = isPaymentSchemaUnavailable(error);
    const publicError = getSafePublicPaymentChannelError(
      schemaMissing
        ? "schema_unavailable"
        : "read_failed",
    );
    console.error(
      "[Recharge channels]",
      getSafePublicPaymentChannelLog({
        code: publicError.code,
        requestId,
        status: schemaMissing ? 503 : 500,
      }),
    );
    return NextResponse.json(
      publicError,
      { status: schemaMissing ? 503 : 500 }
    );
  }
}
