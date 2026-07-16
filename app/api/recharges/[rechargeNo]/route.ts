import { NextResponse } from "next/server";

import { getPaymentErrorMessage, isPaymentSchemaUnavailable, normalizeRechargeRow } from "@/lib/payments/recharge-utils";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const rechargeDetailSelect =
  "recharge_no,channel,channel_code,channel_name,currency,network,amount,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,status,created_at,paid_at";

type RouteContext = {
  params: {
    rechargeNo: string;
  };
};

export async function GET(_request: Request, { params }: RouteContext) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Recharge service is unavailable.", code: "RECHARGE_DETAIL_READ_FAILED" },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: "Please sign in before viewing recharge records.", code: "RECHARGE_AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  const rechargeNo = params.rechargeNo.trim();
  if (!rechargeNo) {
    return NextResponse.json(
      { error: "Recharge record not found.", code: "RECHARGE_NOT_FOUND" },
      { status: 404 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("account_recharges")
      .select(rechargeDetailSelect)
      .eq("recharge_no", rechargeNo)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Recharge record not found.", code: "RECHARGE_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: normalizeRechargeRow(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[Recharge detail]", getPaymentErrorMessage(error, "Recharge detail read failed"));
    return NextResponse.json(
      {
        error: isPaymentSchemaUnavailable(error)
          ? "Recharge database is not initialized. Please apply the payment management migration."
          : "Recharge record loading failed. Please try again later.",
        code: "RECHARGE_DETAIL_READ_FAILED",
      },
      { status: isPaymentSchemaUnavailable(error) ? 503 : 500 }
    );
  }
}