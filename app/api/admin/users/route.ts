import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { getAuditErrorMessage } from "@/lib/admin/audit-log-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 20;
const paidRechargeStatuses = new Set(["paid", "succeeded"]);
const spendOrderStatuses = new Set(["paid", "processing", "delivered", "completed"]);
const debitBusinessTypes = new Set(["order_payment"]);

type ProfileRow = Record<string, unknown>;

type NormalizedUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  accountStatus: string;
  riskStatus: string;
  balance: number;
  totalRecharge: number;
  totalSpend: number;
  orderCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
  statusReason: string | null;
  riskReason: string | null;
};

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

async function requireSuperAdmin() {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin;
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;
  const serviceClient = getSupabaseServiceRoleClient();
  const supabase = serviceClient ?? admin.supabase;
  const url = new URL(request.url);
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const pageSize = Math.min(100, positiveInteger(url.searchParams.get("pageSize"), PAGE_SIZE_DEFAULT));
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const accountStatus = url.searchParams.get("accountStatus") ?? "all";
  const riskStatus = url.searchParams.get("riskStatus") ?? "all";
  const registeredFrom = url.searchParams.get("registeredFrom") ?? "";
  const registeredTo = url.searchParams.get("registeredTo") ?? "";

  try {
    const profileResult = await loadProfiles(supabase);
    if (!profileResult.ok) {
      return json({ users: [], count: 0, page, pageSize, schemaReady: false, error: profileResult.error }, { status: 503 });
    }

    let users = profileResult.rows.map(normalizeProfile);
    if (search) {
      users = users.filter((user) =>
        [user.email, user.displayName, user.id].some((value) => (value ?? "").toLowerCase().includes(search))
      );
    }
    if (accountStatus !== "all") users = users.filter((user) => user.accountStatus === accountStatus);
    if (riskStatus !== "all") users = users.filter((user) => user.riskStatus === riskStatus);
    if (registeredFrom) users = users.filter((user) => compareDate(user.createdAt, registeredFrom) >= 0);
    if (registeredTo) users = users.filter((user) => compareDate(user.createdAt, registeredTo) <= 0);

    const pageUsers = users.slice((page - 1) * pageSize, page * pageSize);
    const ids = pageUsers.map((user) => user.id);
    const [orders, recharges, transactions] = await Promise.all([
      loadOrdersByUsers(supabase, ids),
      loadRechargesByUsers(supabase, ids),
      loadBalanceTransactionsByUsers(supabase, ids),
    ]);

    const usersWithStats = pageUsers.map((user) => applyStats(user, orders, recharges, transactions));

    return json({
      users: usersWithStats,
      count: users.length,
      page,
      pageSize,
      schemaReady: profileResult.schemaReady,
      errors: compactErrors({ orders: orders.error, recharges: recharges.error, balanceTransactions: transactions.error }),
    });
  } catch (error) {
    console.error("[Admin Users] list failed", error);
    return json({ users: [], count: 0, page, pageSize, error: "用户列表加载失败，请稍后重试。" }, { status: 500 });
  }
}

async function loadProfiles(supabase: any) {
  const select = "id,email,display_name,full_name,nickname,name,role,balance,created_at,updated_at,last_login_at,account_status,risk_status,status_reason,risk_reason";
  const { data, error } = await supabase.from("profiles").select(select).order("created_at", { ascending: false }).limit(5000);
  if (!error) return { ok: true as const, rows: (data ?? []) as ProfileRow[], schemaReady: true };
  if (/account_status|risk_status|last_login_at|schema cache|42703/i.test(getAuditErrorMessage(error, ""))) {
    const retry = await supabase
      .from("profiles")
      .select("id,email,display_name,full_name,nickname,name,role,balance,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!retry.error) return { ok: true as const, rows: (retry.data ?? []) as ProfileRow[], schemaReady: false };
  }
  return { ok: false as const, rows: [], schemaReady: false, error: "用户管理字段尚未初始化，请先执行 admin_user_controls migration。" };
}

function normalizeProfile(row: ProfileRow): NormalizedUser {
  return {
    id: String(row.id ?? ""),
    email: textOrNull(row.email),
    displayName: textOrNull(row.display_name) ?? textOrNull(row.full_name) ?? textOrNull(row.nickname) ?? textOrNull(row.name),
    role: textOrNull(row.role) ?? "user",
    accountStatus: textOrNull(row.account_status) ?? "active",
    riskStatus: textOrNull(row.risk_status) ?? "normal",
    balance: finiteNumber(row.balance),
    totalRecharge: 0,
    totalSpend: 0,
    orderCount: 0,
    createdAt: textOrNull(row.created_at),
    updatedAt: textOrNull(row.updated_at),
    lastLoginAt: textOrNull(row.last_login_at),
    statusReason: textOrNull(row.status_reason),
    riskReason: textOrNull(row.risk_reason),
  };
}

async function loadOrdersByUsers(supabase: any, userIds: string[]) {
  if (userIds.length === 0) return { rows: [] as ProfileRow[], error: null as string | null };
  const { data, error } = await supabase.from("orders").select("id,user_id,total_amount,status,created_at").in("user_id", userIds);
  return { rows: (data ?? []) as ProfileRow[], error: error ? "订单统计读取失败" : null };
}

async function loadRechargesByUsers(supabase: any, userIds: string[]) {
  if (userIds.length === 0) return { rows: [] as ProfileRow[], error: null as string | null };
  const { data, error } = await supabase
    .from("account_recharges")
    .select("id,user_id,amount,requested_amount,credited_amount,status,created_at")
    .in("user_id", userIds);
  return { rows: (data ?? []) as ProfileRow[], error: error ? "充值统计读取失败" : null };
}

async function loadBalanceTransactionsByUsers(supabase: any, userIds: string[]) {
  if (userIds.length === 0) return { rows: [] as ProfileRow[], error: null as string | null };
  const { data, error } = await supabase
    .from("balance_transactions")
    .select("id,user_id,business_type,direction,amount,status,created_at")
    .in("user_id", userIds);
  return { rows: (data ?? []) as ProfileRow[], error: error ? "余额流水读取失败" : null };
}

function applyStats(user: NormalizedUser, orders: { rows: ProfileRow[] }, recharges: { rows: ProfileRow[] }, transactions: { rows: ProfileRow[] }) {
  const userOrders = orders.rows.filter((row) => row.user_id === user.id);
  const userRecharges = recharges.rows.filter((row) => row.user_id === user.id);
  const userTransactions = transactions.rows.filter((row) => row.user_id === user.id);
  const transactionSpend = userTransactions
    .filter((row) => row.direction === "debit" && row.status === "completed" && debitBusinessTypes.has(String(row.business_type ?? "")))
    .reduce((sum, row) => sum + finiteNumber(row.amount), 0);
  const orderSpend = userOrders
    .filter((row) => spendOrderStatuses.has(String(row.status ?? "")))
    .reduce((sum, row) => sum + finiteNumber(row.total_amount), 0);

  return {
    ...user,
    orderCount: userOrders.length,
    totalSpend: transactionSpend > 0 ? transactionSpend : orderSpend,
    totalRecharge: userRecharges
      .filter((row) => paidRechargeStatuses.has(String(row.status ?? "")))
      .reduce((sum, row) => sum + finiteNumber(row.credited_amount ?? row.requested_amount ?? row.amount), 0),
  };
}

function compactErrors(input: Record<string, string | null>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => Boolean(value)));
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compareDate(value: string | null, boundary: string) {
  if (!value) return -1;
  const left = new Date(value).getTime();
  const right = new Date(boundary).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return left - right;
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
