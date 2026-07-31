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
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
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
    return NextResponse.json({ channels });
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
