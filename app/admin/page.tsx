"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  CreditCard,
  Database,
  Loader2,
  Package,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import {
  AdminMetricTrendCard,
  AdminMetricValueCard,
} from "@/components/admin/dashboard/AdminDashboardMetricCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DASHBOARD_PAYMENT_CALLBACKS_SELECT,
  DASHBOARD_PAYMENT_CHANNELS_SELECT,
  DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT,
  isDashboardPaymentCallbackException,
  isDashboardPaymentReconciliationException,
  normalizeDashboardPaymentCallback,
  normalizeDashboardPaymentChannel,
  normalizeDashboardPaymentReconciliation,
} from "@/lib/admin/dashboard-payment-schema.mjs";
import { getOrderStatusLabel, getPaymentStatusLabel } from "@/lib/orders/order-status";
import {
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";
import type { AdminProduct } from "@/lib/supabase/admin-catalog";
import { requiresRechargeAdminAttention } from "@/lib/recharges/admin-attention";
import { listProducts } from "@/lib/supabase/admin-catalog";

type MetricValue = number | string | null;

type MetricCard = {
  label: string;
  value: MetricValue;
  description: string;
  href?: string;
  tone?: "blue" | "green" | "orange" | "red" | "slate";
  change?: string | null;
  failed?: boolean;
};

type TrendMetricCard = MetricCard & {
  trend: Array<number | null>;
};

type DashboardOrder = {
  id: string;
  order_no: string;
  customer_email: string | null;
  total_amount: number;
  status: string;
  payment_status: string;
  delivery_type: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardRecharge = {
  id: string;
  recharge_no: string;
  user_email: string | null;
  amount: number;
  requested_amount?: number | null;
  credited_amount?: number | null;
  channel_name: string | null;
  channel_code: string | null;
  status: string;
  review_mode?: string | null;
  exception_type?: string | null;
  error_summary?: string | null;
  paid_at?: string | null;
  created_at: string;
};

type ChannelStat = {
  code: string;
  label: string;
  enabled: boolean | null;
  configured: boolean | null;
  initiated: number | null;
  successful: number | null;
  amount: number | null;
  exceptions: number | null;
  failed?: boolean;
};

type TrendPoint = {
  date: string;
  payAmount: number | null;
  rechargeAmount: number | null;
  orderCount: number | null;
  paidCount: number | null;
  visitors: number | null;
  views: number | null;
  newUsers: number | null;
};

type TodoItem = {
  label: string;
  value: number | null;
  href: string;
  failed?: boolean;
};

type ProductRank = {
  id: string;
  name: string;
  sales: number;
  amount: number;
  stock: number;
  status: string;
  updated_at: string | null;
};

type SystemStatus = {
  label: string;
  value: "正常" | "部分配置" | "未接入" | "异常";
  href?: string;
};

type DashboardData = {
  trendMetrics: TrendMetricCard[];
  statusMetrics: MetricCard[];
  channels: ChannelStat[];
  trend7: TrendPoint[];
  trend30: TrendPoint[];
  todos: TodoItem[];
  salesRank: ProductRank[];
  amountRank: ProductRank[];
  lowStock: AdminProduct[];
  soldOut: AdminProduct[];
  recentProducts: AdminProduct[];
  staleProducts: AdminProduct[];
  recentOrders: DashboardOrder[];
  recentRecharges: DashboardRecharge[];
  userOverview: Array<{ label: string; value: MetricValue; failed?: boolean }>;
  visitorStats: Array<{ label: string; visitors: MetricValue; views: MetricValue; failed?: boolean }>;
  systemStatuses: SystemStatus[];
};

const CHANNELS = [
  { code: "alipay", label: "支付宝" },
  { code: "wechat", label: "微信支付" },
  { code: "binance_pay", label: "币安支付" },
  { code: "usdt_trc20", label: "USDT-TRC20" },
  { code: "usdt_bep20", label: "USDT-BEP20" },
] as const;

const INITIALIZING = "待初始化";
const READ_FAILED = "读取失败";
const BUSINESS_TIME_ZONE = "Asia/Shanghai";

const NOT_CONNECTED = "未接入";
const FAILED = "加载失败";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatBusinessDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : formatDateKey(date);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `¥${Number(value).toFixed(2)}`;
}

function formatNumber(value: MetricValue) {
  if (value === null) return "—";
  if (typeof value === "number") return value.toLocaleString("zh-CN");
  return value;
}

function formatPercent(success: number | null, total: number | null) {
  if (success === null || total === null) return NOT_CONNECTED;
  if (total === 0) return "—";
  return `${((success / total) * 100).toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isMissingTable(error: unknown) {
  const message = String((error as { message?: string } | null | undefined)?.message ?? error ?? "");
  return /PGRST205|42P01|schema cache|Could not find the table|relation .* does not exist/i.test(message);
}

function aggregateByDate<T extends Record<string, unknown>>(
  rows: T[] | null,
  days: number,
  getDate: (row: T) => string | null | undefined,
  getValue: (row: T) => number,
) {
  if (!rows) return null;
  const today = startOfToday();
  const map = new Map<string, number>();
  for (let index = days - 1; index >= 0; index -= 1) {
    map.set(formatBusinessDateKey(addDays(today, -index)), 0);
  }

  rows.forEach((row) => {
    const rawDate = getDate(row);
    if (!rawDate) return;
    const key = formatBusinessDateKey(new Date(rawDate));
    if (!map.has(key)) return;
    map.set(key, (map.get(key) ?? 0) + getValue(row));
  });

  return map;
}

function sumRows<T>(rows: T[] | null, predicate: (row: T) => boolean, mapper: (row: T) => number) {
  if (!rows) return null;
  return rows.filter(predicate).reduce((sum, row) => sum + mapper(row), 0);
}

function countRows<T>(rows: T[] | null, predicate: (row: T) => boolean) {
  if (!rows) return null;
  return rows.filter(predicate).length;
}

function createEmptyTrend(days: number) {
  const today = startOfToday();
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - days + 1);
    return {
      date: formatBusinessDateKey(date),
      payAmount: null,
      rechargeAmount: null,
      orderCount: null,
      paidCount: null,
      visitors: null,
      views: null,
      newUsers: null,
    };
  });
}

function makeTrend(
  days: number,
  orders: DashboardOrder[] | null,
  recharges: DashboardRecharge[] | null,
  visits: Array<{ visit_date: string; visitor_key?: string | null; page_path?: string | null }> | null,
  users: Array<{ created_at?: string | null }> | null,
) {
  const base = createEmptyTrend(days);
  const paidOrders = orders ? orders.filter((order) => order.payment_status === "paid") : null;
  const paidRecharges = recharges ? recharges.filter((row) => row.status === "paid") : null;
  const orderAmount = aggregateByDate(paidOrders, days, (row) => row.paid_at as string | undefined, (row) => safeNumber(row.total_amount));
  const orderCount = aggregateByDate(orders, days, (row) => row.created_at, () => 1);
  const paidCount = aggregateByDate(paidOrders, days, (row) => row.paid_at as string | undefined, () => 1);
  const rechargeAmount = aggregateByDate(paidRecharges, days, (row) => row.paid_at ?? row.created_at, (row) => safeNumber(row.credited_amount ?? row.amount ?? row.requested_amount));
  const newUsers = aggregateByDate(users, days, (row) => row.created_at, () => 1);

  let visitorMap: Map<string, Set<string>> | null = null;
  let viewMap: Map<string, number> | null = null;
  if (visits) {
    visitorMap = new Map();
    viewMap = new Map();
    base.forEach((point) => {
      visitorMap?.set(point.date, new Set());
      viewMap?.set(point.date, 0);
    });
    visits.forEach((visit) => {
      const key = formatBusinessDateKey(new Date(visit.visit_date));
      if (!visitorMap?.has(key)) return;
      if (visit.visitor_key) visitorMap.get(key)?.add(visit.visitor_key);
      viewMap?.set(key, (viewMap.get(key) ?? 0) + 1);
    });
  }

  return base.map((point) => ({
    ...point,
    payAmount: orderAmount ? orderAmount.get(point.date) ?? 0 : null,
    rechargeAmount: rechargeAmount ? rechargeAmount.get(point.date) ?? 0 : null,
    orderCount: orderCount ? orderCount.get(point.date) ?? 0 : null,
    paidCount: paidCount ? paidCount.get(point.date) ?? 0 : null,
    visitors: visitorMap ? visitorMap.get(point.date)?.size ?? 0 : null,
    views: viewMap ? viewMap.get(point.date) ?? 0 : null,
    newUsers: newUsers ? newUsers.get(point.date) ?? 0 : null,
  }));
}

async function countQuery(
  table: string,
  filter?: (query: any) => any,
): Promise<{ count: number | null; failed: boolean; missing: boolean }> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) return { count: null, failed: true, missing: isMissingTable(error) };
  return { count: count ?? 0, failed: false, missing: false };
}

async function loadDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseBrowserClient();
  const today = startOfToday();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const thirtyDaysAgo = addDays(today, -29);
  const weekAgo = addDays(today, -6);

  const [
    ordersResult,
    rechargesResult,
    productsResult,
    usersResult,
    paymentSessionsResult,
    channelsResult,
    callbackResult,
    reconciliationResult,
    deliveriesResult,
    visitsResult,
    readinessResult,
    lowStockResult,
  ] = await Promise.allSettled([
    supabase
      .from("orders")
      .select("id,order_no,customer_email,total_amount,status,payment_status,delivery_type,paid_at,created_at,updated_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("account_recharges")
      .select("id,recharge_no,user_email,amount,requested_amount,credited_amount,channel_name,channel_code,status,review_mode,exception_type,error_summary,paid_at,created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    listProducts({ page: 1, pageSize: 500, sortBy: "updated_at" }),
    supabase.from("profiles").select("id,email,role,created_at", { count: "exact" }),
    supabase
      .from("payment_sessions")
      .select("id,channel_code,status,payable_amount,currency,provider_order_no,provider_transaction_id,created_at,paid_at,expires_at")
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase.from("payment_channels").select(DASHBOARD_PAYMENT_CHANNELS_SELECT),
    supabase
      .from("payment_callback_logs")
      .select(DASHBOARD_PAYMENT_CALLBACKS_SELECT)
      .gte("received_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("payment_reconciliations")
      .select(DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT)
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("order_deliveries")
      .select("id,delivery_status,delivery_type,failure_reason,created_at")
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("page_visit_events")
      .select("visit_date,visitor_key,page_path")
      .gte("visit_date", thirtyDaysAgo.toISOString())
      .lt("visit_date", tomorrow.toISOString())
      .not("page_path", "like", "/admin%"),
    fetch("/api/admin/payments/readiness", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("readiness unavailable");
      return response.json();
    }),
    listProducts({ page: 1, pageSize: 1, stockLevel: "low", sortBy: "updated_at" }),
  ]);

  const orders = ordersResult.status === "fulfilled" && !ordersResult.value.error
    ? ((ordersResult.value.data ?? []) as DashboardOrder[])
    : null;
  const recharges = rechargesResult.status === "fulfilled" && !rechargesResult.value.error
    ? ((rechargesResult.value.data ?? []) as DashboardRecharge[])
    : null;
  const products = productsResult.status === "fulfilled" ? productsResult.value.products : null;
  const lowStockCount = lowStockResult.status === "fulfilled" ? lowStockResult.value.count : null;
  const users = usersResult.status === "fulfilled" && !usersResult.value.error
    ? ((usersResult.value.data ?? []) as Array<{ id: string; role?: string | null; created_at?: string | null }>)
    : null;
  const sessions = paymentSessionsResult.status === "fulfilled" && !paymentSessionsResult.value.error
    ? ((paymentSessionsResult.value.data ?? []) as Array<Record<string, unknown>>)
    : null;
  const channels = channelsResult.status === "fulfilled" && !channelsResult.value.error
    ? ((channelsResult.value.data ?? []) as unknown as Array<Record<string, unknown>>).map(normalizeDashboardPaymentChannel)
    : null;
  const callbacks = callbackResult.status === "fulfilled" && !callbackResult.value.error
    ? ((callbackResult.value.data ?? []) as unknown as Array<Record<string, unknown>>).map(normalizeDashboardPaymentCallback)
    : null;
  const reconciliations = reconciliationResult.status === "fulfilled" && !reconciliationResult.value.error
    ? ((reconciliationResult.value.data ?? []) as unknown as Array<Record<string, unknown>>).map(normalizeDashboardPaymentReconciliation)
    : null;
  const deliveries = deliveriesResult.status === "fulfilled" && !deliveriesResult.value.error
    ? ((deliveriesResult.value.data ?? []) as Array<Record<string, unknown>>)
    : null;
  const visits = visitsResult.status === "fulfilled" && !visitsResult.value.error
    ? ((visitsResult.value.data ?? []) as Array<{ visit_date: string; visitor_key?: string | null; page_path?: string | null }>)
    : null;
  const visitsMissing =
    visitsResult.status === "fulfilled" &&
    Boolean(visitsResult.value.error) &&
    isMissingTable(visitsResult.value.error);
  const visitsFailed =
    visitsResult.status === "rejected" ||
    (visitsResult.status === "fulfilled" && Boolean(visitsResult.value.error) && !visitsMissing);
  const readiness = readinessResult.status === "fulfilled" ? readinessResult.value : null;

  const todayOrders = orders ? orders.filter((order) => new Date(order.created_at) >= today) : null;
  const yesterdayOrders = orders ? orders.filter((order) => new Date(order.created_at) >= yesterday && new Date(order.created_at) < today) : null;
  const todayRecharges = recharges ? recharges.filter((row) => new Date(row.created_at) >= today) : null;
  const yesterdayRecharges = recharges ? recharges.filter((row) => new Date(row.created_at) >= yesterday && new Date(row.created_at) < today) : null;
  const todayUsers = users ? users.filter((row) => row.created_at && new Date(row.created_at) >= today) : null;
  const yesterdayUsers = users ? users.filter((row) => row.created_at && new Date(row.created_at) >= yesterday && new Date(row.created_at) < today) : null;
  const weekUsers = users ? users.filter((row) => row.created_at && new Date(row.created_at) >= weekAgo) : null;

  const todayPayAmount = sumRows(todayOrders, (order) => order.payment_status === "paid", (order) => safeNumber(order.total_amount));
  const yesterdayPayAmount = sumRows(yesterdayOrders, (order) => order.payment_status === "paid", (order) => safeNumber(order.total_amount));
  const todayRechargeAmount = sumRows(todayRecharges, (row) => row.status === "paid", (row) => safeNumber(row.credited_amount ?? row.amount ?? row.requested_amount));
  const yesterdayRechargeAmount = sumRows(yesterdayRecharges, (row) => row.status === "paid", (row) => safeNumber(row.credited_amount ?? row.amount ?? row.requested_amount));
  const todayPaidOrders = countRows(todayOrders, (order) => order.payment_status === "paid");
  const yesterdayPaidOrders = countRows(yesterdayOrders, (order) => order.payment_status === "paid");

  const todayVisitKey = formatBusinessDateKey(today);
  const yesterdayVisitKey = formatBusinessDateKey(yesterday);
  const todayVisits = visits ? visits.filter((visit) => formatBusinessDateKey(visit.visit_date) === todayVisitKey) : null;
  const yesterdayVisits = visits ? visits.filter((visit) => formatBusinessDateKey(visit.visit_date) === yesterdayVisitKey) : null;
  const weekVisits = visits ? visits.filter((visit) => new Date(visit.visit_date) >= weekAgo) : null;
  const monthVisits = visits;
  const todayVisitorSet = todayVisits ? new Set(todayVisits.map((visit) => visit.visitor_key).filter(Boolean)) : null;
  const yesterdayVisitorSet = yesterdayVisits ? new Set(yesterdayVisits.map((visit) => visit.visitor_key).filter(Boolean)) : null;
  const weekVisitorSet = weekVisits ? new Set(weekVisits.map((visit) => visit.visitor_key).filter(Boolean)) : null;
  const monthVisitorSet = monthVisits ? new Set(monthVisits.map((visit) => visit.visitor_key).filter(Boolean)) : null;
  const visitorMetric = (value: number | null | undefined): MetricValue => {
    if (visitsMissing) return INITIALIZING;
    if (visitsFailed) return READ_FAILED;
    return value ?? 0;
  };

  const channelStats = CHANNELS.map((channel) => {
    const config = channels?.find((row) => row.code === channel.code);
    const rows = sessions?.filter((session) => session.channel_code === channel.code) ?? null;
    const exceptionRows = rows?.filter((session) => ["failed", "expired", "closed"].includes(String(session.status))) ?? null;
    return {
      code: channel.code,
      label: channel.label,
      enabled: config ? config.enabled : null,
      configured: config ? config.configured : null,
      initiated: rows ? rows.length : null,
      successful: rows ? rows.filter((row) => row.status === "paid").length : null,
      amount: rows ? rows.filter((row) => row.status === "paid").reduce((sum, row) => sum + safeNumber(row.payable_amount), 0) : null,
      exceptions: exceptionRows ? exceptionRows.length : null,
      failed: paymentSessionsResult.status === "rejected" || (paymentSessionsResult.status === "fulfilled" && Boolean(paymentSessionsResult.value.error)),
    };
  });

  const paidOrderIds = new Set((orders ?? []).filter((order) => order.payment_status === "paid").map((order) => order.id));
  const orderItemRowsResult = await supabase
    .from("order_items")
    .select("order_id,product_id,product_name,quantity,line_total,created_at")
    .gte("created_at", thirtyDaysAgo.toISOString());
  const orderItems = orderItemRowsResult.error
    ? null
    : ((orderItemRowsResult.data ?? []) as Array<{ order_id?: string | null; product_id?: string | null; product_name?: string | null; quantity?: number | null; line_total?: number | null }>)
        .filter((item) => item.order_id && paidOrderIds.has(item.order_id));
  const rankMap = new Map<string, ProductRank>();
  if (orderItems && products) {
    orderItems.forEach((item) => {
      const id = item.product_id ?? item.product_name ?? "";
      if (!id) return;
      const product = products.find((row) => row.id === item.product_id);
      const previous = rankMap.get(id) ?? {
        id,
        name: product?.name ?? item.product_name ?? "未知商品",
        sales: 0,
        amount: 0,
        stock: product?.stock ?? 0,
        status: product?.status ?? "—",
        updated_at: product?.updated_at ?? null,
      };
      previous.sales += safeNumber(item.quantity);
      previous.amount += safeNumber(item.line_total);
      rankMap.set(id, previous);
    });
  }
  const ranks = Array.from(rankMap.values());

  const systemStatuses: SystemStatus[] = [
    { label: "数据库连接", value: orders || products || users ? "正常" : "异常" },
    { label: "支付 Provider", value: readiness?.status === "ready" ? "正常" : readiness?.status === "partial" ? "部分配置" : "未接入", href: "/admin/payments" },
    { label: "支付回调接口", value: readiness?.checks?.callbackRoute?.ok ? "正常" : "部分配置", href: "/admin/payments" },
    { label: "充值入账 RPC", value: readiness?.checks?.rechargeRpc?.ok ? "正常" : "异常", href: "/admin/recharges" },
    { label: "订单支付 RPC", value: readiness?.checks?.orderPaymentService?.ok ? "正常" : "部分配置", href: "/admin/orders" },
    { label: "自动发货服务", value: deliveries === null ? "部分配置" : "正常", href: "/admin/inventory" },
    { label: "支付对账服务", value: readiness?.checks?.reconciliationUsesCompletePayment?.ok ? "正常" : "部分配置", href: "/admin/payments" },
    { label: "审计日志", value: "正常", href: "/admin/audit-logs" },
    { label: "最近部署版本", value: "部分配置" },
    { label: "最近更新时间", value: "正常" },
  ];

  const trend7 = makeTrend(7, orders, recharges, visits, users);
  const trend30 = makeTrend(30, orders, recharges, visits, users);

  return {
    trendMetrics: [
      {
        label: "今日支付金额",
        value: todayPayAmount === null ? FAILED : formatMoney(todayPayAmount),
        description: "已支付订单金额",
        href: "/admin/orders?paymentStatus=paid",
        tone: "green",
        change: todayPayAmount !== null && yesterdayPayAmount !== null ? `${formatMoney(yesterdayPayAmount)} 昨日` : "—",
        trend: trend7.map((point) => point.payAmount),
      },
      {
        label: "今日充值金额",
        value: todayRechargeAmount === null ? FAILED : formatMoney(todayRechargeAmount),
        description: "已到账充值金额",
        href: "/admin/recharges?status=paid",
        tone: "green",
        change: todayRechargeAmount !== null && yesterdayRechargeAmount !== null ? `${formatMoney(yesterdayRechargeAmount)} 昨日` : "—",
        trend: trend7.map((point) => point.rechargeAmount),
      },
      {
        label: "今日订单数",
        value: todayOrders === null ? FAILED : todayOrders.length,
        description: "今日创建订单",
        href: "/admin/orders",
        tone: "blue",
        change: yesterdayOrders ? `${yesterdayOrders.length} 昨日` : "—",
        trend: trend7.map((point) => point.orderCount),
      },
      {
        label: "今日支付成功率",
        value: formatPercent(todayPaidOrders, todayOrders?.length ?? null),
        description: "已支付 / 今日订单",
        href: "/admin/payments",
        tone: "blue",
        change: yesterdayOrders ? `${formatPercent(yesterdayPaidOrders, yesterdayOrders.length)} 昨日` : "—",
        trend: trend7.map((point) => point.orderCount === null || point.paidCount === null || point.orderCount === 0
          ? null
          : (point.paidCount / point.orderCount) * 100),
      },
      {
        label: "今日访客数",
        value: visitsMissing ? INITIALIZING : visitsFailed ? READ_FAILED : todayVisitorSet?.size ?? 0,
        description: `UV · ${BUSINESS_TIME_ZONE}`,
        tone: "slate",
        change: visits ? `昨日 ${yesterdayVisitorSet?.size ?? 0}` : visitsMissing ? "待执行访问统计 migration" : "读取失败",
        failed: visitsFailed,
        trend: trend7.map((point) => point.visitors),
      },
      {
        label: "今日访问量",
        value: visitsMissing ? INITIALIZING : visitsFailed ? READ_FAILED : todayVisits?.length ?? 0,
        description: `PV · ${BUSINESS_TIME_ZONE}`,
        tone: "slate",
        change: visits ? `昨日 ${yesterdayVisits?.length ?? 0}` : visitsMissing ? "待执行访问统计 migration" : "读取失败",
        failed: visitsFailed,
        trend: trend7.map((point) => point.views),
      },
      {
        label: "今日新增用户",
        value: todayUsers ? todayUsers.length : FAILED,
        description: "profiles 今日新增",
        href: "/admin/users",
        tone: "blue",
        change: yesterdayUsers ? `昨日 ${yesterdayUsers.length}` : "—",
        trend: trend7.map((point) => point.newUsers),
      },
    ],
    statusMetrics: [
      {
        label: "待处理订单",
        value: orders ? orders.filter((order) => ["paid", "processing"].includes(order.status)).length : FAILED,
        description: "已支付待处理",
        href: "/admin/orders?status=paid",
        tone: "orange",
        change: "—",
      },
      {
        label: "待人工交付",
        value: deliveries ? deliveries.filter((row) => row.delivery_status === "pending" && row.delivery_type !== "automatic").length : NOT_CONNECTED,
        description: "人工处理交付",
        href: "/admin/orders",
        tone: "orange",
        change: "—",
      },
      {
        label: "支付异常",
        value: sessions ? sessions.filter((row) => ["failed", "expired"].includes(String(row.status))).length : NOT_CONNECTED,
        description: "失败或过期会话",
        href: "/admin/payments?view=exceptions",
        tone: "red",
        change: "—",
      },
      {
        label: "低库存商品",
        value: products ? products.filter((product) => product.stock > 0 && product.stock <= 5).length : FAILED,
        description: "库存 1-5",
        href: "/admin/products",
        tone: "orange",
        change: "—",
      },
      {
        label: "商品总数",
        value: products ? products.length : FAILED,
        description: "products 总量",
        href: "/admin/products",
        tone: "slate",
        change: products ? `${products.filter((product) => product.status === "active").length} 已上架` : "—",
      },
    ],
    channels: channelStats,
    trend7,
    trend30,
    todos: [
      { label: "待处理订单", value: orders ? orders.filter((order) => ["paid", "processing"].includes(order.status)).length : null, href: "/admin/orders?attention=pending_orders" },
      { label: "待人工交付", value: deliveries ? deliveries.filter((row) => row.delivery_status === "pending" && row.delivery_type !== "automatic").length : null, href: "/admin/orders?attention=manual_delivery" },
      { label: "自动发货失败", value: deliveries ? deliveries.filter((row) => row.delivery_status === "failed" && row.delivery_type === "automatic").length : null, href: "/admin/orders?attention=auto_delivery_failed" },
      { label: "库存不足订单", value: deliveries ? deliveries.filter((row) => String(row.failure_reason ?? "").includes("库存")).length : null, href: "/admin/orders?attention=inventory_shortage" },
      { label: "支付回调失败", value: callbacks ? callbacks.filter(isDashboardPaymentCallbackException).length : null, href: "/admin/payments?view=callbacks&attention=failed" },
      { label: "对账异常", value: reconciliations ? reconciliations.filter(isDashboardPaymentReconciliationException).length : null, href: "/admin/payments?view=reconciliations&attention=failed" },
      { label: "待处理充值", value: recharges ? recharges.filter((row) => requiresRechargeAdminAttention(row as Record<string, unknown>)).length : null, href: "/admin/recharges?view=review" },
      { label: "低库存商品", value: lowStockCount, href: "/admin/products?stockLevel=low" },
    ],
    salesRank: ranks.sort((a, b) => b.sales - a.sales).slice(0, 8),
    amountRank: [...ranks].sort((a, b) => b.amount - a.amount).slice(0, 8),
    lowStock: products ? products.filter((product) => product.stock > 0 && product.stock <= 5).slice(0, 8) : [],
    soldOut: products ? products.filter((product) => product.status === "sold_out" || product.stock === 0).slice(0, 8) : [],
    recentProducts: products ? [...products].sort((a, b) => new Date(b.created_at ?? b.updated_at ?? 0).getTime() - new Date(a.created_at ?? a.updated_at ?? 0).getTime()).slice(0, 8) : [],
    staleProducts: products ? [...products].sort((a, b) => new Date(a.updated_at ?? a.created_at ?? 0).getTime() - new Date(b.updated_at ?? b.created_at ?? 0).getTime()).slice(0, 8) : [],
    recentOrders: orders?.slice(0, 8) ?? [],
    recentRecharges: recharges?.slice(0, 8) ?? [],
    userOverview: [
      { label: "总用户", value: users ? users.length : FAILED },
      { label: "今日新增", value: todayUsers ? todayUsers.length : FAILED },
      { label: "本周新增", value: weekUsers ? weekUsers.length : FAILED },
      { label: "有消费用户", value: orders ? new Set(orders.filter((order) => order.payment_status === "paid").map((order) => order.customer_email).filter(Boolean)).size : FAILED },
      { label: "零消费用户", value: users && orders ? Math.max(users.length - new Set(orders.filter((order) => order.payment_status === "paid").map((order) => order.customer_email).filter(Boolean)).size, 0) : FAILED },
      { label: "管理员数量", value: users ? users.filter((row) => row.role === "admin").length : FAILED },
    ],
    visitorStats: [
      { label: "今日", visitors: visitorMetric(todayVisitorSet?.size), views: visitorMetric(todayVisits?.length), failed: visitsFailed },
      { label: "本周", visitors: visitorMetric(weekVisitorSet?.size), views: visitorMetric(weekVisits?.length), failed: visitsFailed },
      { label: "本月", visitors: visitorMetric(monthVisitorSet?.size), views: visitorMetric(monthVisits?.length), failed: visitsFailed },
    ],
    systemStatuses,
  };
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trendRange, setTrendRange] = useState<"7" | "30">("7");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!hasSupabaseConfig()) {
      setError("Supabase 未配置，暂时无法读取控制台数据。");
      setLoading(false);
      return;
    }

    try {
      const nextData = await loadDashboardData();
      setData(nextData);
      setLastRefreshedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
    } catch (dashboardError) {
      console.error("[AdminDashboard] load failed", dashboardError);
      setError("控制台数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const trend = trendRange === "7" ? data?.trend7 ?? [] : data?.trend30 ?? [];

  return (
    <AdminPageShell
      variant="v2"
      title="经营数据驾驶舱"
      description="集中查看订单、支付、充值、商品、用户和系统状态。未接入的数据会明确标记，不使用模拟数据。"
      actions={
        <div className="flex items-center gap-2">
          <QuickLink href="/admin/products" label="新增商品" />
          <QuickLink href="/admin/inventory" label="导入库存" />
          <QuickLink href="/admin/categories" label="新增分类" />
          <Button variant="outline" size="sm" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            刷新
          </Button>
        </div>
      }
    >
      {error ? (
        <AdminErrorState description={error} onRetry={loadDashboard} />
      ) : (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pb-1">
          <section className="shrink-0" aria-labelledby="dashboard-core-metrics">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 id="dashboard-core-metrics" className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">核心经营指标</h2>
                <p className="text-xs text-[var(--admin-v2-text-muted)]">近 7 天真实数据走势；无可用序列时不绘制曲线。</p>
              </div>
              <span className="hidden text-xs text-[var(--admin-v2-text-muted)] sm:inline">对比昨日</span>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
              {loading && !data
                ? Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="h-[112px] animate-pulse rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface-muted)]" />
                ))
                : data?.trendMetrics.map((metric) => (
                  <AdminMetricTrendCard
                    key={metric.label}
                    label={metric.label}
                    value={formatNumber(metric.value)}
                    description={metric.description}
                    comparison={metric.change}
                    href={metric.href}
                    loading={loading}
                    trend={metric.trend}
                  />
                ))}
            </div>
          </section>

          <section className="shrink-0 overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)]" aria-labelledby="dashboard-status-metrics">
            <div className="flex items-center justify-between border-b border-[var(--admin-v2-border)] px-3 py-2 sm:px-4">
              <h2 id="dashboard-status-metrics" className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">运营状态</h2>
              <p className="hidden text-xs text-[var(--admin-v2-text-muted)] sm:block">待处理、异常与库存状态</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[var(--admin-v2-border)] md:grid-cols-3 xl:grid-cols-5">
              {loading && !data
                ? Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-[68px] animate-pulse bg-[var(--admin-v2-surface-muted)]" />
                ))
                : data?.statusMetrics.map((metric) => (
                  <AdminMetricValueCard
                    key={metric.label}
                    label={metric.label}
                    value={formatNumber(metric.value)}
                    description={metric.description}
                    comparison={metric.change === "—" ? null : metric.change}
                    href={metric.href}
                    loading={loading}
                    tone={metric.tone === "red" ? "danger" : metric.tone === "orange" ? "warning" : "neutral"}
                    compact
                  />
                ))}
            </div>
          </section>

          <div className="grid min-h-[320px] grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
            <Card className="flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 py-3">
                <div>
                  <CardTitle className="text-base">经营趋势</CardTitle>
                  <p className="text-xs text-slate-500">支付、充值、订单和访问的综合走势（各指标独立量程）</p>
                </div>
                <Tabs value={trendRange} onValueChange={(value) => setTrendRange(value as "7" | "30")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="7" className="h-7 px-3 text-xs">近 7 天</TabsTrigger>
                    <TabsTrigger value="30" className="h-7 px-3 text-xs">近 30 天</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-4 pb-4 pt-0">
                <TrendChart points={trend} loading={loading} />
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
              <CardHeader className="shrink-0 px-4 py-3">
                <CardTitle className="text-base">支付渠道表现</CardTitle>
                <p className="text-xs text-slate-500">按真实支付会话统计，不展示假渠道结果</p>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-2 overflow-auto px-4 pb-4 pt-0">
                {(data?.channels ?? CHANNELS.map((channel) => ({ ...channel, enabled: null, configured: null, initiated: null, successful: null, amount: null, exceptions: null }))).map((channel) => (
                  <ChannelRow key={channel.code} channel={channel} loading={loading} />
                ))}
              </CardContent>
            </Card>
          </div>

          <section className="shrink-0 overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--admin-v2-border)] px-4 py-2.5">
              <h2 className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">待办中心</h2>
              <p className="text-xs text-[var(--admin-v2-text-muted)]">数字为近 30 天快照；点击查看当前完整队列。</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[var(--admin-v2-border)] md:grid-cols-4 xl:grid-cols-8">
              {(data?.todos ?? []).map((todo) => (
                <TodoLink key={todo.label} item={todo} />
              ))}
              {!data && loading
                ? Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-14 animate-pulse bg-slate-100" />)
                : null}
            </div>
          </section>

          <div className="grid min-h-[300px] grid-cols-1 gap-3 xl:grid-cols-3">
            <ProductListCard title="销量排行" rows={data?.salesRank ?? []} type="sales" loading={loading} />
            <ProductListCard title="销售额排行" rows={data?.amountRank ?? []} type="amount" loading={loading} />
            <InventoryFocusCard
              lowStock={data?.lowStock ?? []}
              soldOut={data?.soldOut ?? []}
              recentProducts={data?.recentProducts ?? []}
              staleProducts={data?.staleProducts ?? []}
              loading={loading}
            />
          </div>

          <div className="grid min-h-[300px] grid-cols-1 gap-3 xl:grid-cols-3">
            <RecentOrdersCard rows={data?.recentOrders ?? []} loading={loading} />
            <RecentRechargesCard rows={data?.recentRecharges ?? []} loading={loading} />
            <UserOverviewCard rows={data?.userOverview ?? []} visitorRows={data?.visitorStats ?? []} loading={loading} />
          </div>

          <SystemStatusCard rows={data?.systemStatuses ?? []} lastRefreshedAt={lastRefreshedAt} loading={loading} />
        </div>
      )}
    </AdminPageShell>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function TrendChart({ points, loading }: { points: TrendPoint[]; loading: boolean }) {
  if (loading) return <div className="h-full min-h-[220px] animate-pulse rounded-[var(--admin-v2-surface-radius)] bg-[var(--admin-v2-surface-muted)]" />;
  if (points.length === 0) return <AdminEmptyState title="暂无趋势数据" description="有真实订单、充值或访问记录后会显示趋势。" />;

  const series = [
    { key: "payAmount", label: "支付金额", color: "#2563eb", values: points.map((point) => point.payAmount), format: formatMoney },
    { key: "rechargeAmount", label: "充值金额", color: "#0ea5e9", values: points.map((point) => point.rechargeAmount), format: formatMoney },
    { key: "orderCount", label: "订单数量", color: "#6366f1", values: points.map((point) => point.orderCount), format: (value: number | null) => value === null ? NOT_CONNECTED : `${value} 单` },
    { key: "views", label: "访问量", color: "#64748b", values: points.map((point) => point.views), format: (value: number | null) => value === null ? NOT_CONNECTED : `${value} PV` },
  ] as const;
  const chartWidth = 720;
  const chartHeight = 220;
  const padding = { top: 16, right: 12, bottom: 28, left: 12 };
  const chartSeries = series.map((item) => ({
    ...item,
    ...buildNormalizedLine(item.values, chartWidth, chartHeight, padding),
  }));
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="flex h-full min-h-[220px] min-w-0 flex-col">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-500">
        {series.map((item) => <Legend key={item.key} color={item.color} label={item.label} />)}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface-muted)] px-2 py-1">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full min-h-[200px] w-full" role="img" aria-label="支付、充值、订单与访问综合趋势折线图">
          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = padding.top + ratio * (chartHeight - padding.top - padding.bottom);
            return <path key={ratio} d={`M${padding.left} ${y} H${chartWidth - padding.right}`} stroke="#e2e8f0" strokeDasharray="3 4" strokeWidth="1" />;
          })}
          {chartSeries.flatMap((item) => item.paths.map((path, index) => (
            <path key={`${item.key}-${index}`} d={path} fill="none" stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          )))}
          {chartSeries.flatMap((item) => item.points.map((point, index) => point ? (
            <circle key={`${item.key}-${index}`} cx={point.x} cy={point.y} r="2.5" fill={item.color} stroke="white" strokeWidth="1.25">
              <title>{`${points[index].date} · ${item.label} ${item.format(item.values[index])}`}</title>
            </circle>
          ) : null))}
          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % labelStep !== 0) return null;
            const x = padding.left + (index / Math.max(points.length - 1, 1)) * (chartWidth - padding.left - padding.right);
            return <text key={point.date} x={x} y={chartHeight - 7} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="#94a3b8" fontSize="10">{point.date.slice(5)}</text>;
          })}
        </svg>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function buildNormalizedLine(
  values: Array<number | null>,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
) {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finiteValues.length === 0) return { paths: [] as string[], points: values.map(() => null) as Array<{ x: number; y: number } | null> };

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const range = max - min || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    return {
      x: padding.left + (index / Math.max(values.length - 1, 1)) * plotWidth,
      y: padding.top + (1 - (value - min) / range) * plotHeight,
    };
  });
  const paths: string[] = [];
  let currentPath = "";
  points.forEach((point) => {
    if (!point) {
      if (currentPath) paths.push(currentPath);
      currentPath = "";
      return;
    }
    currentPath += `${currentPath ? " L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  });
  if (currentPath) paths.push(currentPath);
  return { paths, points };
}

function ChannelRow({ channel, loading }: { channel: ChannelStat; loading: boolean }) {
  const statusText = channel.configured === null ? NOT_CONNECTED : channel.enabled ? "已启用" : channel.configured ? "已停用" : "未配置";
  const successRate = formatPercent(channel.successful, channel.initiated);
  return (
    <Link href={`/admin/payments?channel=${channel.code}`} className="block rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] p-3 transition-colors hover:border-blue-200 hover:bg-[var(--admin-v2-selected)]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{channel.label}</div>
          <div className="mt-0.5 text-xs text-slate-500">{loading ? "加载中" : statusText}</div>
        </div>
        <Badge variant={channel.enabled ? "default" : "secondary"}>{statusText}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
        <MiniStat label="发起" value={channel.initiated} />
        <MiniStat label="成功" value={channel.successful} />
        <MiniStat label="成功率" value={successRate} />
        <MiniStat label="金额" value={formatMoney(channel.amount)} />
        <MiniStat label="异常" value={channel.exceptions} danger />
      </div>
    </Link>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: MetricValue; danger?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
      <div className="truncate text-[10px] text-slate-500">{label}</div>
      <div className={`truncate text-xs font-semibold ${danger && Number(value) > 0 ? "text-red-600" : "text-slate-900"}`}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function TodoLink({ item }: { item: TodoItem }) {
  const urgent = Number(item.value ?? 0) > 0;
  return (
    <Link href={item.href} className={`min-h-14 cursor-pointer bg-white px-3 py-2 transition-colors hover:bg-[var(--admin-v2-selected)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-v2-primary)] ${urgent ? "text-[var(--admin-v2-danger-foreground)]" : "text-[var(--admin-v2-text-muted)]"}`}>
      <div className="truncate text-xs">{item.label}</div>
      <div className={`mt-0.5 text-lg font-semibold leading-6 ${urgent ? "text-[var(--admin-v2-danger-foreground)]" : "text-[var(--admin-v2-text-secondary)]"}`}>{item.value ?? NOT_CONNECTED}</div>
    </Link>
  );
}

function ProductListCard({ title, rows, type, loading }: { title: string; rows: ProductRank[]; type: "sales" | "amount"; loading: boolean }) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
      <CardHeader className="shrink-0 px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : rows.length === 0 ? (
          <AdminEmptyState title="暂无销量数据" description="订单明细产生后会显示真实排行。" className="min-h-[180px]" />
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <Link key={row.id} href={`/admin/products?search=${encodeURIComponent(row.name)}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{index + 1}. {row.name}</div>
                  <div className="text-xs text-slate-500">库存 {row.stock} · {row.status}</div>
                </div>
                <div className="shrink-0 text-right text-sm font-semibold text-slate-950">
                  {type === "sales" ? `${row.sales} 件` : formatMoney(row.amount)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryFocusCard({
  lowStock,
  soldOut,
  recentProducts,
  staleProducts,
  loading,
}: {
  lowStock: AdminProduct[];
  soldOut: AdminProduct[];
  recentProducts: AdminProduct[];
  staleProducts: AdminProduct[];
  loading: boolean;
}) {
  const groups = [
    { label: "低库存", rows: lowStock },
    { label: "售罄", rows: soldOut },
    { label: "最近新增", rows: recentProducts },
    { label: "长期未售", rows: staleProducts },
  ];
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
      <CardHeader className="shrink-0 px-4 py-3">
        <CardTitle className="text-base">商品经营</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {groups.map((group) => (
              <div key={group.label} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">{group.label}</div>
                  <Link href="/admin/products" className="text-xs text-orange-600">查看全部</Link>
                </div>
                {group.rows.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">暂无数据</div>
                ) : group.rows.slice(0, 3).map((product) => (
                  <Link key={product.id} href={`/admin/products?search=${encodeURIComponent(product.slug)}`} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="truncate text-slate-700">{product.name}</span>
                    <span className="shrink-0 text-slate-500">{product.stock}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOrdersCard({ rows, loading }: { rows: DashboardOrder[]; loading: boolean }) {
  return (
    <CompactTableCard
      title="最近订单"
      loading={loading}
      emptyTitle="暂无订单"
      headers={["订单号", "用户", "金额", "状态", "时间"]}
      rows={rows.map((order) => [
        order.order_no,
        order.customer_email ?? "—",
        formatMoney(order.total_amount),
        `${getPaymentStatusLabel(order.payment_status as any)} / ${getOrderStatusLabel(order.status as any)}`,
        formatDateTime(order.created_at),
      ])}
      href="/admin/orders"
    />
  );
}

function RecentRechargesCard({ rows, loading }: { rows: DashboardRecharge[]; loading: boolean }) {
  return (
    <CompactTableCard
      title="最近充值"
      loading={loading}
      emptyTitle="暂无充值"
      headers={["充值单号", "用户", "金额", "渠道", "状态", "时间"]}
      rows={rows.map((row) => [
        row.recharge_no,
        row.user_email ?? "—",
        formatMoney(row.amount),
        row.channel_name ?? row.channel_code ?? "—",
        row.status,
        formatDateTime(row.created_at),
      ])}
      href="/admin/recharges"
    />
  );
}

function CompactTableCard({
  title,
  loading,
  emptyTitle,
  headers,
  rows,
  href,
}: {
  title: string;
  loading: boolean;
  emptyTitle: string;
  headers: string[];
  rows: string[][];
  href: string;
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link href={href} className="inline-flex items-center text-xs text-orange-600">
          查看全部 <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : rows.length === 0 ? (
          <AdminEmptyState title={emptyTitle} description="有真实数据后会显示在这里。" className="min-h-[180px]" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header} className="h-8 whitespace-nowrap text-xs">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 8).map((row, index) => (
                <TableRow key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${title}-${index}-${cellIndex}`} className="max-w-[160px] truncate whitespace-nowrap py-2 text-xs">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function UserOverviewCard({
  rows,
  visitorRows,
  loading,
}: {
  rows: Array<{ label: string; value: MetricValue; failed?: boolean }>;
  visitorRows: Array<{ label: string; visitors: MetricValue; views: MetricValue; failed?: boolean }>;
  loading: boolean;
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
      <CardHeader className="shrink-0 px-4 py-3">
        <CardTitle className="text-base">用户与访问概览</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {rows.map((row) => (
                <div key={row.label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">{row.label}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{formatNumber(row.value)}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border">
              {visitorRows.map((row) => (
                <div key={row.label} className="grid grid-cols-3 gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                  <div className="font-medium text-slate-700">{row.label}</div>
                  <div>访客 {formatNumber(row.visitors)}</div>
                  <div>访问 {formatNumber(row.views)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SystemStatusCard({ rows, lastRefreshedAt, loading }: { rows: SystemStatus[]; lastRefreshedAt: string | null; loading: boolean }) {
  return (
    <Card className="shrink-0 overflow-hidden border-[var(--admin-v2-border)] shadow-none">
      <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
        <div>
          <CardTitle className="text-base">系统运行状态</CardTitle>
          <p className="text-xs text-slate-500">最近刷新：{lastRefreshedAt ?? "—"}</p>
        </div>
        <Database className="h-5 w-5 text-slate-400" />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 px-4 pb-4 pt-0 md:grid-cols-5">
        {loading ? Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        )) : rows.map((row) => (
          <StatusItem key={row.label} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}

function StatusItem({ row }: { row: SystemStatus }) {
  const tone = row.value === "正常" ? "text-green-600 bg-green-50" : row.value === "异常" ? "text-red-600 bg-red-50" : row.value === "部分配置" ? "text-orange-600 bg-orange-50" : "text-slate-500 bg-slate-100";
  const content = (
    <div className="rounded-xl border bg-white px-3 py-2">
      <div className="truncate text-xs text-slate-500">{row.label}</div>
      <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{row.value}</div>
    </div>
  );
  return row.href ? <Link href={row.href}>{content}</Link> : content;
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}
