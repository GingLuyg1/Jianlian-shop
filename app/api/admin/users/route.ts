import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import {
  ADMIN_USER_PROFILE_CORE_SELECT,
  ADMIN_USER_PROFILE_EXTENDED_SELECT,
  ADMIN_USER_PROFILE_LEGACY_SELECT,
  classifyAdminUserProfileSchemaError,
  parseAdminUserManagementCompatibility,
} from "@/lib/admin/user-management-compatibility.mjs";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 20;
const ACCOUNT_STATUSES = new Set(["active", "restricted", "suspended", "disabled"]);
const RISK_STATUSES = new Set(["normal", "watch", "high_risk", "blocked"]);
const ROLES = new Set(["user", "admin"]);
const SORTS = new Set(["newest", "oldest", "recent_activity", "balance_desc", "balance_asc"]);
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
  const search = sanitizeSearch(url.searchParams.get("search"));
  const requestedStatus = url.searchParams.get("status") ?? url.searchParams.get("accountStatus") ?? "all";
  const requestedRisk = url.searchParams.get("risk") ?? url.searchParams.get("riskStatus") ?? "all";
  const requestedRole = url.searchParams.get("role") ?? "all";
  const accountStatus = ACCOUNT_STATUSES.has(requestedStatus) ? requestedStatus : "all";
  const riskStatus = RISK_STATUSES.has(requestedRisk) ? requestedRisk : "all";
  const role = ROLES.has(requestedRole) ? requestedRole : "all";
  const registeredFrom = validDate(url.searchParams.get("registeredFrom"), false);
  const registeredTo = validDate(url.searchParams.get("registeredTo"), true);
  const requestedSort = url.searchParams.get("sort") ?? "newest";
  const sort = SORTS.has(requestedSort) ? requestedSort : "newest";

  try {
    const profileResult = await loadProfiles(supabase, {
      page,
      pageSize,
      search,
      accountStatus,
      riskStatus,
      role,
      registeredFrom,
      registeredTo,
      sort,
    });
    if (!profileResult.ok) {
      return json({ users: [], count: 0, page, pageSize, schemaReady: false, error: profileResult.error }, { status: 503 });
    }

    const compatibility = await loadUserManagementCompatibility(admin.supabase);
    const pageUsers = profileResult.rows.map(normalizeProfile);
    const ids = pageUsers.map((user) => user.id);
    const [orders, recharges, transactions] = await Promise.all([
      loadOrdersByUsers(supabase, ids),
      loadRechargesByUsers(supabase, ids),
      loadBalanceTransactionsByUsers(supabase, ids),
    ]);

    const usersWithStats = pageUsers.map((user) => applyStats(user, orders, recharges, transactions));

    return json({
      users: usersWithStats,
      count: profileResult.count,
      page,
      pageSize,
      filters: { accountStatus, riskStatus, role, sort },
      schemaReady: profileResult.schemaReady && compatibility.schemaReady,
      errors: compactErrors({
        userManagement: compatibility.error,
        orders: orders.error,
        recharges: recharges.error,
        balanceTransactions: transactions.error,
      }),
    });
  } catch (error) {
    console.error("[Admin Users] list failed", error);
    return json({ users: [], count: 0, page, pageSize, error: "用户列表加载失败，请稍后重试。" }, { status: 500 });
  }
}

type ProfileQuery = {
  page: number;
  pageSize: number;
  search: string;
  accountStatus: string;
  riskStatus: string;
  role: string;
  registeredFrom: string | null;
  registeredTo: string | null;
  sort: string;
};

async function loadProfiles(supabase: any, input: ProfileQuery) {
  const extended = await runProfileQuery(supabase, ADMIN_USER_PROFILE_EXTENDED_SELECT, input, true);
  if (!extended.error) return { ok: true as const, rows: extended.rows, count: extended.count, schemaReady: true };

  if (classifyAdminUserProfileSchemaError(extended.error) === "optional_identity_missing") {
    const core = await runProfileQuery(supabase, ADMIN_USER_PROFILE_CORE_SELECT, input, false);
    if (!core.error) return { ok: true as const, rows: core.rows, count: core.count, schemaReady: true };
    if (classifyAdminUserProfileSchemaError(core.error) !== "required_management_missing") {
      return { ok: false as const, rows: [], count: 0, schemaReady: false, error: "用户资料读取失败，请稍后重试。" };
    }
  } else if (classifyAdminUserProfileSchemaError(extended.error) !== "required_management_missing") {
    return { ok: false as const, rows: [], count: 0, schemaReady: false, error: "用户资料读取失败，请稍后重试。" };
  }

  const legacyInput = { ...input, accountStatus: "all", riskStatus: "all", sort: input.sort === "recent_activity" ? "newest" : input.sort };
  if (input.accountStatus !== "all" || input.riskStatus !== "all" || input.sort === "recent_activity") {
    return { ok: false as const, rows: [], count: 0, schemaReady: false, error: "当前数据库缺少所选筛选或排序需要的用户管理字段。" };
  }
  const legacy = await runProfileQuery(supabase, ADMIN_USER_PROFILE_LEGACY_SELECT, legacyInput, false);
  if (!legacy.error) return { ok: true as const, rows: legacy.rows, count: legacy.count, schemaReady: false };
  return { ok: false as const, rows: [], count: 0, schemaReady: false, error: "用户资料读取失败，请稍后重试。" };
}

async function runProfileQuery(supabase: any, select: string, input: ProfileQuery, includeNames: boolean) {
  let query = supabase.from("profiles").select(select, { count: "exact" });
  if (input.search) {
    const filters = [`email.ilike.%${input.search}%`];
    if (isUuid(input.search)) filters.unshift(`id.eq.${input.search}`);
    if (includeNames) filters.push(`display_name.ilike.%${input.search}%`, `full_name.ilike.%${input.search}%`, `nickname.ilike.%${input.search}%`, `name.ilike.%${input.search}%`);
    query = query.or(filters.join(","));
  }
  if (input.accountStatus !== "all") query = query.eq("account_status", input.accountStatus);
  if (input.riskStatus !== "all") query = query.eq("risk_status", input.riskStatus);
  if (input.role !== "all") query = query.eq("role", input.role);
  if (input.registeredFrom) query = query.gte("created_at", input.registeredFrom);
  if (input.registeredTo) query = query.lte("created_at", input.registeredTo);
  if (input.sort === "oldest") query = query.order("created_at", { ascending: true });
  else if (input.sort === "recent_activity") query = query.order("last_login_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  else if (input.sort === "balance_desc") query = query.order("balance", { ascending: false }).order("created_at", { ascending: false });
  else if (input.sort === "balance_asc") query = query.order("balance", { ascending: true }).order("created_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const from = (input.page - 1) * input.pageSize;
  const { data, error, count } = await query.range(from, from + input.pageSize - 1);
  return { rows: (data ?? []) as ProfileRow[], count: count ?? 0, error };
}

async function loadUserManagementCompatibility(supabase: any) {
  const { data, error } = await supabase.rpc("get_admin_user_management_compatibility");
  return parseAdminUserManagementCompatibility(data, error);
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

function sanitizeSearch(value: string | null) {
  return (value ?? "").trim().replace(/[^\p{L}\p{N}@._+\-\s]/gu, "").slice(0, 120);
}

function validDate(value: string | null, endOfDay: boolean) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
