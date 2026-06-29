import { NextResponse } from "next/server";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 });
  }

  const supabase = getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "请先登录后再查看余额流水" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = Math.min(100, positiveInteger(searchParams.get("pageSize"), 10));
  const type = searchParams.get("type") ?? "all";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
      .from("balance_transactions")
      .select("transaction_no,business_type,business_id,direction,amount,balance_before,balance_after,currency,status,remark,created_at", {
        count: "exact",
      })
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (type !== "all") query = query.eq("business_type", type);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        transactionNo: String(row.transaction_no ?? ""),
        businessType: String(row.business_type ?? "system"),
        businessId: String(row.business_id ?? ""),
        direction: row.direction === "debit" ? "debit" : "credit",
        amount: finiteNumber(row.amount),
        balanceBefore: numberOrNull(row.balance_before),
        balanceAfter: numberOrNull(row.balance_after),
        currency: String(row.currency ?? "CNY"),
        status: String(row.status ?? "completed"),
        remark: textOrNull(row.remark),
        createdAt: textOrNull(row.created_at),
      })),
      count: count ?? 0,
      page,
      pageSize,
      initialized: true,
    });
  } catch (error) {
    const schemaMissing = isSchemaUnavailable(error);
    return NextResponse.json(
      {
        data: [],
        count: 0,
        page,
        pageSize,
        initialized: false,
        error: schemaMissing
          ? "余额流水表尚未初始化，请管理员执行 balance_transactions migration。"
          : getErrorMessage(error, "余额流水加载失败，请稍后重试"),
      },
      { status: schemaMissing ? 503 : 500 }
    );
  }
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function isSchemaUnavailable(error: unknown) {
  const message = getErrorMessage(error, "");
  return /balance_transactions|schema cache|PGRST205|42P01|42703/i.test(message);
}
