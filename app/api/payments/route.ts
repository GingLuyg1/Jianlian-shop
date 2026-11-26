import { NextResponse } from "next/server";

import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";
import { getPaymentErrorMessage, getManualPaymentMethod } from "@/lib/payments/payment-status";
import { normalizePaymentRecord, normalizePaymentRows, paymentSelect } from "@/lib/payments/payment-queries";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

function isSafeProofUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 1000) return false;
  if (trimmed.startsWith("/")) return !trimmed.startsWith("//");
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isSchemaMissing(message: string) {
  return /order_payments|submit_order_payment|schema cache|PGRST205|42P01/i.test(message);
}

export async function GET(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderNo = searchParams.get("order_no") || searchParams.get("orderNo");

  try {
    const selectStr = orderNo ? paymentSelect.replace("orders(", "orders!inner(") : paymentSelect;
    let query = supabase
      .from("order_payments")
      .select(selectStr)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (orderNo) {
      query = query.eq("orders.order_no", orderNo);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ payments: normalizePaymentRows(data) });
  } catch (error) {
    const message = getPaymentErrorMessage(error, "支付记录读取失败");
    return NextResponse.json(
      { error: isSchemaMissing(message) ? "支付记录表尚未初始化，请先执行 order_payments migration。" : message },
      { status: isSchemaMissing(message) ? 503 : 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
  }

  const sizeError = checkRequestSize(request, 16 * 1024);
  if (sizeError) return sizeError;

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const rateLimit = checkRateLimit("payment_session_create", getUserRateLimitKey(user.id, "manual_payment_submit"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    await assertUserBusinessAllowed(supabase, user.id, "create_payment");
  } catch (guardError) {
    if (isAccountRestrictionError(guardError)) {
      return NextResponse.json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
    }
    throw guardError;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        orderNo?: string;
        paymentMethod?: string;
        transactionReference?: string;
        proofUrls?: string[];
        userNote?: string;
      }
    | null;

  const orderNo = body?.orderNo?.trim();
  const paymentMethod = body?.paymentMethod?.trim();
  const methodConfig = getManualPaymentMethod(paymentMethod);

  if (!orderNo) {
    return NextResponse.json({ error: "缺少订单编号" }, { status: 400 });
  }

  if (!paymentMethod || !methodConfig || !methodConfig.enabled) {
    return NextResponse.json({ error: "当前支付方式暂不可用" }, { status: 400 });
  }

  const rawProofUrls = body?.proofUrls;
  const proofUrls = Array.isArray(rawProofUrls)
    ? rawProofUrls.filter((url): url is string => typeof url === "string" && isSafeProofUrl(url)).slice(0, 3)
    : [];

  if (proofUrls.length === 0 && !body?.transactionReference?.trim()) {
    return NextResponse.json({ error: "请上传支付凭证或填写交易参考号" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.rpc("submit_order_payment", {
      p_order_no: orderNo,
      p_payment_method: paymentMethod,
      p_transaction_reference: body?.transactionReference?.trim() || null,
      p_proof_urls: proofUrls,
      p_user_note: body?.userNote?.trim() || null,
    });

    if (error) throw error;

    return NextResponse.json({ payment: normalizePaymentRecord(data as Record<string, unknown>) });
  } catch (error) {
    const message = getPaymentErrorMessage(error, "支付凭证提交失败");
    return NextResponse.json(
      { error: isSchemaMissing(message) ? "支付记录表尚未初始化，请先执行 order_payments migration。" : message },
      { status: isSchemaMissing(message) ? 503 : 400 }
    );
  }
}
