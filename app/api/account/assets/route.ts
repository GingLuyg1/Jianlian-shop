import { NextResponse } from "next/server";

import { normalizeOrderStatus } from "@/lib/orders/order-status";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const paidRechargeStatuses = new Set(["paid", "succeeded"]);
const spendOrderStatuses = new Set(["paid", "processing", "delivered", "completed"]);
const unfinishedOrderStatuses = new Set(["pending_payment", "paid", "processing", "delivered"]);

export async function GET() {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 });
  }

  const supabase = getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "请先登录后再查看账户资产" }, { status: 401 });
  }

  const user = authData.user;
  const diagnostics: Record<string, string | boolean | null> = {
    profileError: null,
    orderError: null,
    rechargeError: null,
    balanceTransactionError: null,
    balanceTransactionsReady: true,
  };

  const [profileResult, orderResult, rechargeResult, balanceResult] = await Promise.all([
    loadProfile(supabase, user.id, user.email ?? null, user.created_at ?? null),
    loadOrders(supabase, user.id),
    loadRecharges(supabase, user.id),
    loadBalanceTransactions(supabase, user.id),
  ]);

  if (profileResult.error) diagnostics.profileError = profileResult.error;
  if (orderResult.error) diagnostics.orderError = orderResult.error;
  if (rechargeResult.error) diagnostics.rechargeError = rechargeResult.error;
  if (balanceResult.error) diagnostics.balanceTransactionError = balanceResult.error;
  diagnostics.balanceTransactionsReady = balanceResult.ready;

  const orders = orderResult.orders;
  const recharges = rechargeResult.recharges;
  const orderNoById = new Map(orders.map((order) => [order.id, order.orderNo]));
  const balanceTransactions = balanceResult.transactions.map((transaction) => ({
    ...transaction,
    orderNo: transaction.orderId ? orderNoById.get(transaction.orderId) ?? null : null,
  }));

  const transactionSpend = balanceTransactions
    .filter((item) => item.direction === "debit" && item.status === "completed")
    .reduce((sum, item) => sum + item.amount, 0);
  const orderSpend = orders
    .filter((order) => spendOrderStatuses.has(normalizeOrderStatus(order.status)))
    .reduce((sum, order) => sum + order.totalAmount, 0);
  const totalRecharge = recharges
    .filter((record) => paidRechargeStatuses.has(record.status))
    .reduce((sum, record) => sum + (record.creditedAmount || record.requestedAmount), 0);

  return NextResponse.json({
    profile: profileResult.profile,
    orders,
    recentRecharges: recharges.slice(0, 5),
    recentBalanceTransactions: balanceTransactions.slice(0, 5),
    summary: {
      availableBalance: Math.max(0, profileResult.profile.balance),
      frozenBalance: null,
      totalRecharge,
      totalSpend: balanceResult.ready ? transactionSpend : orderSpend,
      orderCount: orders.length,
      unfinishedOrderCount: orders.filter((order) =>
        unfinishedOrderStatuses.has(normalizeOrderStatus(order.status))
      ).length,
    },
    diagnostics,
  });
}

async function loadProfile(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
  fallbackEmail: string | null,
  fallbackCreatedAt: string | null
) {
  const fallback = {
    email: fallbackEmail,
    displayName: null,
    role: "user",
    createdAt: fallbackCreatedAt,
    balance: 0,
  };

  const { data, error } = await supabase
    .from("profiles")
    .select("email,display_name,role,created_at,balance")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingColumn(error)) {
      const retry = await supabase
        .from("profiles")
        .select("email,display_name,role,created_at")
        .eq("id", userId)
        .maybeSingle();
      if (!retry.error) {
        return {
          profile: normalizeProfile(retry.data as Record<string, unknown> | null, fallback),
          error: "余额字段尚未初始化，请执行余额兼容 migration。",
        };
      }
    }
    return { profile: fallback, error: getErrorMessage(error, "账户资料加载失败") };
  }

  return { profile: normalizeProfile(data as Record<string, unknown> | null, fallback), error: null };
}

async function loadOrders(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_no,status,payment_status,total_amount,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { orders: [], error: getErrorMessage(error, "订单数据加载失败") };

  return {
    orders: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ""),
      orderNo: String(row.order_no ?? ""),
      status: String(row.status ?? "pending_payment"),
      paymentStatus: String(row.payment_status ?? "unpaid"),
      totalAmount: finiteNumber(row.total_amount),
      createdAt: textOrNull(row.created_at),
    })),
    error: null,
  };
}

async function loadRecharges(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
  const { data, error } = await supabase
    .from("account_recharges")
    .select("recharge_no,channel_name,channel_code,currency,requested_amount,amount,credited_amount,status,created_at,paid_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { recharges: [], error: getErrorMessage(error, "充值记录加载失败") };

  return {
    recharges: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      rechargeNo: String(row.recharge_no ?? ""),
      channelName: String(row.channel_name ?? row.channel_code ?? "—"),
      currency: String(row.currency ?? "CNY"),
      requestedAmount: finiteNumber(row.requested_amount ?? row.amount),
      creditedAmount: finiteNumber(row.credited_amount),
      status: String(row.status ?? "pending"),
      createdAt: textOrNull(row.created_at),
      paidAt: textOrNull(row.paid_at),
    })),
    error: null,
  };
}

async function loadBalanceTransactions(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
  const { data, error } = await supabase
    .from("balance_transactions")
    .select("transaction_no,business_type,business_id,direction,amount,balance_before,balance_after,currency,status,remark,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return {
      ready: false,
      transactions: [],
      error: isSchemaUnavailable(error)
        ? "余额流水表尚未初始化，请执行 balance_transactions migration。"
        : getErrorMessage(error, "余额流水加载失败"),
    };
  }

  return {
    ready: true,
    transactions: ((data ?? []) as Record<string, unknown>[]).map(normalizeBalanceTransaction),
    error: null,
  };
}

function normalizeProfile(row: Record<string, unknown> | null, fallback: { email: string | null; displayName: null; role: string; createdAt: string | null; balance: number }) {
  return {
    email: textOrNull(row?.email) ?? fallback.email,
    displayName: textOrNull(row?.display_name),
    role: textOrNull(row?.role) ?? fallback.role,
    createdAt: textOrNull(row?.created_at) ?? fallback.createdAt,
    balance: Math.max(0, finiteNumber(row?.balance)),
  };
}

function normalizeBalanceTransaction(row: Record<string, unknown>) {
  const direction = row.direction === "debit" ? "debit" : "credit";
  const metadata = row.metadata && typeof row.metadata === "object"
    ? row.metadata as Record<string, unknown>
    : {};
  const txHash = textOrNull(metadata.tx_hash);
  return {
    transactionNo: String(row.transaction_no ?? ""),
    businessType: String(row.business_type ?? "system"),
    businessId: String(row.business_id ?? ""),
    direction,
    amount: finiteNumber(row.amount),
    balanceBefore: numberOrNull(row.balance_before),
    balanceAfter: numberOrNull(row.balance_after),
    currency: String(row.currency ?? "CNY"),
    status: String(row.status ?? "completed"),
    remark: textOrNull(row.remark),
    subtype: textOrNull(metadata.subtype),
    orderId: textOrNull(metadata.order_id),
    receivedUsdt: textOrNull(metadata.received_usdt),
    expectedUsdt: textOrNull(metadata.expected_usdt),
    shortfallUsdt: textOrNull(metadata.shortfall_usdt),
    exchangeRate: textOrNull(metadata.exchange_rate),
    txHashSummary: txHash && txHash.length > 22
      ? `${txHash.slice(0, 12)}...${txHash.slice(-8)}`
      : txHash,
    createdAt: textOrNull(row.created_at),
  };
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

function isMissingColumn(error: unknown) {
  const message = getErrorMessage(error, "");
  return /42703|column|schema cache/i.test(message);
}

function isSchemaUnavailable(error: unknown) {
  const message = getErrorMessage(error, "");
  return /balance_transactions|schema cache|PGRST205|42P01|42703/i.test(message);
}
