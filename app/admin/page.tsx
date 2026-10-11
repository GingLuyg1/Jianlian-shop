"use client";
import { statusLabel } from '@/lib/admin/display-labels';

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { AdminMetricTrendCard } from "@/components/admin/dashboard/AdminDashboardMetricCards";
import DashboardProductData from "@/components/admin/dashboard/DashboardProductData";
import { DashboardDateRangeFilter, dashboardPreset } from "@/components/admin/dashboard/DashboardDateRangeFilter";
import { chartNumber, formatDashboardMoney, type DashboardAnalytics } from "@/lib/admin/dashboard-analytics-ui";
import { clearDashboardAnalyticsCache, useDashboardAnalytics } from "@/lib/admin/use-dashboard-analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";
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
  amountText?: string;
  rawReceipts?: Array<{ currency: string; amount: string; initiated: number; successful: number; exceptions: number }>;
  exceptions: number | null;
  failed?: boolean;
};

function buildAnalyticsChannelRows(analytics: DashboardAnalytics | null, snapshot: ChannelStat[]): ChannelStat[] {
  if (!analytics) return [];
  const codes = new Set<string>([
    ...CHANNELS.map((channel) => channel.code),
    ...analytics.channels.map((channel) => channel.channel),
    ...analytics.channelRevenueCny.map((channel) => channel.channel),
  ]);
  return Array.from(codes).map((code) => {
    const rows = analytics.channels.filter((row) => row.channel === code);
    const config = snapshot.find((row) => row.code === code);
    const revenue = analytics.channelRevenueCny.find((row) => row.channel === code);
    return {
      code,
      label: CHANNELS.find((row) => row.code === code)?.label ?? code,
      enabled: config?.enabled ?? null,
      configured: config?.configured ?? null,
      initiated: rows.reduce((sum, row) => sum + row.initiated, 0),
      successful: rows.reduce((sum, row) => sum + row.successful, 0),
      exceptions: rows.reduce((sum, row) => sum + row.exceptions, 0),
      amount: null,
      amountText: formatDashboardMoney(revenue?.amountCny ?? "0.00"),
      rawReceipts: rows.map((row) => ({
        currency: row.currency,
        amount: row.receivedAmount,
        initiated: row.initiated,
        successful: row.successful,
        exceptions: row.exceptions,
      })),
    };
  });
}

type TrendPoint = {
  date: string;
  payAmount: number | null;
  payAmountText?: string;
  rechargeAmount: number | null;
  rechargeAmountText?: string;
  orderCount: number | null;
  paidCount: number | null;
  visitors: number | null;
  views: number | null;
  newUsers: number | null;
};

type TrendMetricKey = "payAmount" | "rechargeAmount" | "orderCount" | "views" | "visitors";

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
  value: "正常" | "部分配置" | "未接入" | "异常" | "未检测";
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
  recentOrdersFailed?: boolean;
  recentRechargesFailed?: boolean;
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
    recentOrdersResult,
    recentRechargesResult,
  ] = await Promise.allSettled([
    supabase
      .from("orders")
      .select("id,order_no,customer_email,total_amount,status,payment_status,delivery_type,paid_at,created_at,updated_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("account_recharges")
      .select("id,recharge_no,user_email,amount,requested_amount,credited_amount,channel_name,channel_code,status,review_mode,exception_type,error_summary,paid_at,created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
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
    supabase.from("orders")
      .select("id,order_no,customer_email,total_amount,status,payment_status,delivery_type,paid_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
    supabase.from("account_recharges")
      .select("id,recharge_no,user_email,amount,requested_amount,credited_amount,channel_name,channel_code,status,review_mode,exception_type,error_summary,paid_at,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
  ]);

  const orders = ordersResult.status === "fulfilled" && !ordersResult.value.error
    ? ((ordersResult.value.data ?? []) as DashboardOrder[])
    : null;
  const recharges = rechargesResult.status === "fulfilled" && !rechargesResult.value.error
    ? ((rechargesResult.value.data ?? []) as DashboardRecharge[])
    : null;
  const products = productsResult.status === "fulfilled" ? productsResult.value.products : null;
  const lowStockCount = lowStockResult.status === "fulfilled" ? lowStockResult.value.count : null;
  const latestOrders = recentOrdersResult.status === "fulfilled" && !recentOrdersResult.value.error
    ? ((recentOrdersResult.value.data ?? []) as DashboardOrder[]) : null;
  const latestRecharges = recentRechargesResult.status === "fulfilled" && !recentRechargesResult.value.error
    ? ((recentRechargesResult.value.data ?? []) as DashboardRecharge[]) : null;
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
    { label: "数据库读取", value: orders !== null && products !== null && users !== null ? "正常" : "异常" },
    { label: "支付服务配置", value: !readiness ? "未检测" : readiness.status === "ready" ? "正常" : readiness.status === "partial" ? "部分配置" : "异常", href: "/admin/payments" },
    { label: "支付回调运行", value: "未检测", href: "/admin/payments" },
    { label: "充值入账事务", value: !readiness ? "未检测" : readiness.coreDatabase?.checks?.completeRechargeRpc ? "部分配置" : "异常", href: "/admin/recharges" },
    { label: "订单支付事务", value: !readiness ? "未检测" : readiness.coreDatabase?.checks?.completeOrderRpc ? "部分配置" : "异常", href: "/admin/orders" },
    { label: "自动发货服务", value: "未检测", href: "/admin/inventory" },
    { label: "支付对账运行", value: "未检测", href: "/admin/payments" },
    { label: "审计日志运行", value: "未检测", href: "/admin/audit-logs" },
    { label: "最近部署版本", value: "未接入" },
    { label: "服务更新时间", value: "未检测" },
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
        change: visits ? `昨日 ${yesterdayVisitorSet?.size ?? 0}` : visitsMissing ? "待执行访问统计 数据库结构升级" : "读取失败",
        failed: visitsFailed,
        trend: trend7.map((point) => point.visitors),
      },
      {
        label: "今日访问量",
        value: visitsMissing ? INITIALIZING : visitsFailed ? READ_FAILED : todayVisits?.length ?? 0,
        description: `PV · ${BUSINESS_TIME_ZONE}`,
        tone: "slate",
        change: visits ? `昨日 ${yesterdayVisits?.length ?? 0}` : visitsMissing ? "待执行访问统计 数据库结构升级" : "读取失败",
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
    lowStock: products ? products.filter((product) => product.stock > 0 && product.stock <= 5).slice(0, 5) : [],
    soldOut: products ? products.filter((product) => product.status === "sold_out" || product.stock === 0).slice(0, 5) : [],
    recentProducts: products ? [...products].sort((a, b) => new Date(b.created_at ?? b.updated_at ?? 0).getTime() - new Date(a.created_at ?? a.updated_at ?? 0).getTime() || a.id.localeCompare(b.id)).slice(0, 5) : [],
    staleProducts: products ? [...products].sort((a, b) => new Date(a.updated_at ?? a.created_at ?? 0).getTime() - new Date(b.updated_at ?? b.created_at ?? 0).getTime() || a.id.localeCompare(b.id)).slice(0, 5) : [],
    recentOrders: latestOrders ?? [],
    recentRecharges: latestRecharges ?? [],
    recentOrdersFailed: latestOrders === null,
    recentRechargesFailed: latestRecharges === null,
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
  const [metricRange, setMetricRange] = useState(() => dashboardPreset("today"));
  const [trendRange, setTrendRange] = useState(() => dashboardPreset("7"));
  const [channelRange, setChannelRange] = useState(() => dashboardPreset("7"));
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);
  const metricAnalytics = useDashboardAnalytics(metricRange, analyticsRefresh);
  const trendAnalytics = useDashboardAnalytics(trendRange, analyticsRefresh);
  const channelAnalytics = useDashboardAnalytics(channelRange, analyticsRefresh);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const metricStripRef = useRef<HTMLDivElement>(null);
  const [metricStripEdges, setMetricStripEdges] = useState({ start: true, end: false });

  const updateMetricStripEdges = useCallback(() => {
    const strip = metricStripRef.current;
    if (!strip) return;
    setMetricStripEdges({ start: strip.scrollLeft <= 2, end: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    updateMetricStripEdges();
    window.addEventListener("resize", updateMetricStripEdges);
    return () => window.removeEventListener("resize", updateMetricStripEdges);
  }, [data, updateMetricStripEdges]);

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

  const trend: TrendPoint[] = (trendAnalytics.data?.daily ?? []).map((point) => ({
    date: point.date,
    payAmount: chartNumber(point.revenueCny),
    payAmountText: point.revenueCny,
    rechargeAmount: chartNumber(point.rechargeCny),
    rechargeAmountText: point.rechargeCny,
    orderCount: point.ordersCreated,
    paidCount: null,
    visitors: point.dailyUv,
    views: point.pv,
    newUsers: null,
  }));
  const metricSummary = metricAnalytics.data?.summary;
  const metricTrend = (metricAnalytics.data?.daily ?? []).map((point) => chartNumber(point.revenueCny));
  const datedMetrics: TrendMetricCard[] = [
    { label: "商城成交额", value: metricSummary ? formatDashboardMoney(metricSummary.revenueCny) : "—", description: "按实际支付日 · 已付订单人民币业务额", href: "/admin/orders?paymentStatus=paid", trend: metricTrend },
    { label: "余额充值到账", value: metricSummary ? formatDashboardMoney(metricSummary.rechargeCny) : "—", description: "按余额流水实际入账日", href: "/admin/recharges?status=paid", trend: (metricAnalytics.data?.daily ?? []).map((point) => chartNumber(point.rechargeCny)) },
    { label: "创建订单数", value: metricSummary?.ordersCreated ?? "—", description: "按订单创建日", href: "/admin/orders", trend: (metricAnalytics.data?.daily ?? []).map((point) => point.ordersCreated) },
    { label: "创建订单当前支付率", value: metricSummary && metricSummary.ordersCreated > 0 ? formatPercent(metricSummary.ordersCreatedCurrentlyPaid, metricSummary.ordersCreated) : "—", description: "区间创建订单中截至当前已付 / 创建数", href: "/admin/payments", trend: [] },
  ];
  const channelRows = buildAnalyticsChannelRows(channelAnalytics.data, data?.channels ?? []);
  const statusByLabel = new Map((data?.statusMetrics ?? []).map((metric) => [metric.label, metric]));
  const productTotal = statusByLabel.get("商品总数");

  return (
    <AdminPageShell
      className="admin-dashboard-v21"
      variant="v2"
      title="经营数据驾驶舱"
      description="经营指标、趋势与渠道分别按所示北京时间区间读取；待办、商品与系统状态是当前快照。"
      actions={
        <div className="dashboard-actions flex flex-wrap items-center gap-2">
          <QuickLink href="/admin/products" label="新增商品" />
          <QuickLink href="/admin/inventory" label="导入库存" />
          <QuickLink href="/admin/categories" label="新增分类" />
          <Button variant="outline" size="sm" className="dashboard-refresh" onClick={() => { clearDashboardAnalyticsCache(); setAnalyticsRefresh((value) => value + 1); void loadDashboard(); }} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            刷新
          </Button>
        </div>
      }
    >
      {error ? (
        <AdminErrorState description={error} onRetry={loadDashboard} />
      ) : (
        <div className="dashboard-scroll flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-4" aria-busy={loading}>
          {loading ? <p role="status" className="shrink-0 text-xs text-[var(--admin-v2-text-muted)]">正在读取经营数据，请稍候…</p> : null}
          <section className="dashboard-section shrink-0" aria-labelledby="dashboard-core-metrics">
            <div className="dashboard-section-heading">
              <h2 id="dashboard-core-metrics">核心经营指标</h2>
              <DashboardDateRangeFilter label="核心经营指标" value={metricRange} onChange={setMetricRange} />
            </div>
            {metricAnalytics.error ? <AdminErrorState description={metricAnalytics.error} onRetry={() => { clearDashboardAnalyticsCache(); setAnalyticsRefresh((value) => value + 1); }} /> : null}
            <div className="dashboard-primary-kpis">
              {metricAnalytics.loading
                ? Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="dashboard-kpi-skeleton animate-pulse" />
                ))
                : !metricAnalytics.error && datedMetrics.map((metric) => (
                  <AdminMetricTrendCard
                    key={metric.label}
                    label={metric.label}
                    value={formatNumber(metric.value)}
                    description={metric.description}
                    comparison={metric.change}
                    href={metric.href}
                    loading={metricAnalytics.loading}
                    trend={metric.trend}
                  />
                ))}
            </div>
            <div className="dashboard-metric-strip-heading">
              <span>所选区间访问数据 · 用户与商品为当前快照/原有样本</span>
              <div className="dashboard-metric-strip-controls">
                <span>横向滑动查看更多</span>
                <Button type="button" variant="outline" size="icon" aria-label="向左查看次级指标" disabled={metricStripEdges.start} onClick={() => metricStripRef.current?.scrollBy({ left: -480, behavior: "smooth" })}><ChevronLeft className="h-4 w-4" /></Button>
                <Button type="button" variant="outline" size="icon" aria-label="向右查看次级指标" disabled={metricStripEdges.end} onClick={() => metricStripRef.current?.scrollBy({ left: 480, behavior: "smooth" })}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="dashboard-secondary-kpis" ref={metricStripRef} onScroll={updateMetricStripEdges} role="region" aria-label="次级经营指标，左右滑动查看更多" tabIndex={0}>
              {metricAnalytics.loading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="dashboard-secondary-skeleton animate-pulse" />) : <>
                {metricSummary ? <>
                  <SecondaryMetricCard label="区间访客" value={metricSummary.uv} description="UV · 区间去重" />
                  <SecondaryMetricCard label="区间访问量" value={metricSummary.pv} description="PV · 非后台事件" />
                  <SecondaryMetricCard label="区间创建且目前已付" value={metricSummary.ordersCreatedCurrentlyPaid} description="截至当前的支付状态" href="/admin/orders?paymentStatus=paid" />
                </> : null}
                {data?.userOverview.filter((row) => row.label !== "管理员数量").map((row) => (
                  <SecondaryMetricCard key={row.label} label={row.label === "总用户" ? "当前总用户（样本）" : row.label === "今日新增" ? "今日新增用户（样本）" : `${row.label}（样本）`} value={row.value} description="原有页面读取样本 · 不随区间变化" href="/admin/users" />
                ))}
                {productTotal ? <SecondaryMetricCard label="商品总数（样本）" value={productTotal.value} description="最多读取 500 项 · 非全量" href={productTotal.href} /> : null}
              </>}
            </div>
          </section>

          <div className="dashboard-analysis-grid grid shrink-0 min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="dashboard-panel dashboard-trend-panel flex min-h-0 flex-col overflow-hidden">
              <CardHeader className="flex shrink-0 flex-col items-start justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div>
                  <CardTitle className="text-base">经营趋势</CardTitle>
                  <p className="text-xs text-slate-500">支付、充值、订单和访问的综合走势；各指标独立量程，不可按线高比较不同单位</p>
                </div>
                <DashboardDateRangeFilter label="经营趋势" value={trendRange} onChange={setTrendRange} />
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-4 pb-4 pt-0">
                {trendAnalytics.error ? <AdminErrorState description={trendAnalytics.error} onRetry={() => { clearDashboardAnalyticsCache(); setAnalyticsRefresh((value) => value + 1); }} /> : <TrendChart points={trend} loading={trendAnalytics.loading} />}
              </CardContent>
            </Card>

            <Card className="dashboard-panel dashboard-channel-panel flex min-h-0 flex-col overflow-hidden">
              <CardHeader className="shrink-0 px-4 py-3">
                <div className="dashboard-channel-heading flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">支付渠道表现</CardTitle>
                    <p className="mt-1 text-xs leading-5 text-slate-600">区间发起会话的当前状态；人民币商城成交额按实际支付日 · 列表内可滚动</p>
                  </div>
                  <DashboardDateRangeFilter label="支付渠道表现" value={channelRange} onChange={setChannelRange} />
                </div>
              </CardHeader>
              <CardContent className="dashboard-channel-list min-h-0 flex-1 space-y-2 px-4 pb-4 pt-0" role="region" aria-label="支付渠道列表，可向下滚动" tabIndex={0}>
                {channelAnalytics.error ? <AdminErrorState description={channelAnalytics.error} onRetry={() => { clearDashboardAnalyticsCache(); setAnalyticsRefresh((value) => value + 1); }} /> : channelAnalytics.loading ? <div role="status" className="p-4 text-sm">正在读取渠道统计…</div> : channelRows.map((channel) => (
                  <ChannelRow key={channel.code} channel={channel} loading={false} />
                ))}
              </CardContent>
            </Card>
          </div>

          <section className="dashboard-section shrink-0" aria-labelledby="dashboard-operations-title">
            <div className="dashboard-section-heading">
              <h2 id="dashboard-operations-title">运营与待办</h2>
              <span className="dashboard-section-note">待办为现有近 30 天快照；入口指向当前完整队列</span>
            </div>
            <div className="dashboard-todo-grid dashboard-operations-grid">
              {(data?.todos ?? []).map((todo) => (
                <TodoLink key={todo.label} item={todo} overview={statusByLabel.get(todo.label)} />
              ))}
              {data?.statusMetrics.filter((metric) => metric.label === "支付异常").map((metric) => (
                <TodoLink key={metric.label} item={{ label: metric.label, value: typeof metric.value === "number" ? metric.value : null, href: metric.href ?? "/admin/payments" }} valueOverride={typeof metric.value === "string" ? metric.value : undefined} />
              ))}
              {!data && loading ? Array.from({ length: 9 }).map((_, index) => <div key={index} className="dashboard-todo-skeleton animate-pulse" />) : null}
            </div>
          </section>

          <div className="dashboard-lower-grid grid shrink-0 min-w-0 grid-cols-1 gap-4">
            <DashboardProductData />
          </div>
          <div className="dashboard-lower-grid grid shrink-0 min-w-0 grid-cols-1 gap-4">
            <InventoryFocusCard
              lowStock={data?.lowStock ?? []}
              soldOut={data?.soldOut ?? []}
              recentProducts={data?.recentProducts ?? []}
              staleProducts={data?.staleProducts ?? []}
              loading={loading}
            />
          </div>

          <div className="dashboard-lower-grid dashboard-activity-grid grid shrink-0 min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
            <RecentOrdersCard rows={data?.recentOrders ?? []} loading={loading} failed={data?.recentOrdersFailed} />
            <RecentRechargesCard rows={data?.recentRecharges ?? []} loading={loading} failed={data?.recentRechargesFailed} />
          </div>

          <SystemStatusCard rows={data?.systemStatuses ?? []} lastRefreshedAt={lastRefreshedAt} loading={loading} />
        </div>
      )}
    </AdminPageShell>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="dashboard-quick-link inline-flex">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function SecondaryMetricCard({ label, value, description, detail, href }: { label: string; value: MetricValue; description: string; detail?: string | null; href?: string }) {
  const content = <div className="dashboard-secondary-fact">
    <span className="dashboard-secondary-label">{label}</span>
    <strong title={formatNumber(value)}>{formatNumber(value)}</strong>
    <span className="dashboard-secondary-description">{description}{detail ? ` · ${detail}` : ""}</span>
  </div>;
  return href ? <Link href={href} className="dashboard-secondary-link">{content}</Link> : <div>{content}</div>;
}

function TrendChart({ points, loading }: { points: TrendPoint[]; loading: boolean }) {
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<TrendMetricKey[]>(["payAmount", "rechargeAmount", "orderCount", "views"]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (loading) return <div className="h-full min-h-[220px] animate-pulse rounded-[var(--admin-v2-surface-radius)] bg-[var(--admin-v2-surface-muted)]" />;
  if (points.length === 0) return <AdminEmptyState title="暂无趋势数据" description="有真实订单、充值或访问记录后会显示趋势。" />;

  const series = [
    { key: "payAmount", label: "支付金额", color: "#2563eb", values: points.map((point) => point.payAmount), format: formatMoney },
    { key: "rechargeAmount", label: "充值金额", color: "#0ea5e9", values: points.map((point) => point.rechargeAmount), format: formatMoney },
    { key: "orderCount", label: "订单数量", color: "#6366f1", values: points.map((point) => point.orderCount), format: (value: number | null) => value === null ? "—" : `${Math.trunc(value).toLocaleString("zh-CN")} 单` },
    { key: "views", label: "访问量", color: "#64748b", values: points.map((point) => point.views), format: (value: number | null) => value === null ? "—" : `${Math.trunc(value).toLocaleString("zh-CN")} PV` },
    { key: "visitors", label: "访客数", color: "#119ba3", values: points.map((point) => point.visitors), format: (value: number | null) => value === null ? "—" : `${Math.trunc(value).toLocaleString("zh-CN")} UV` },
  ] as const;
  const chartWidth = 720;
  const chartHeight = 220;
  const padding = { top: 16, right: 12, bottom: 28, left: 12 };
  const chartSeries = series.map((item) => ({
    ...item,
    ...buildNormalizedLine(item.values, chartWidth, chartHeight, padding),
  }));
  const selectedSeries = chartSeries.filter((item) => selectedMetricKeys.includes(item.key));
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const inspectionIndex = Math.min(points.length - 1, Math.max(0, activeIndex ?? points.length - 1));
  const activePoint = activeIndex !== null ? points[inspectionIndex] : null;
  const activeX = activeIndex !== null
    ? points.length === 1 ? chartWidth / 2 : padding.left + (inspectionIndex / (points.length - 1)) * (chartWidth - padding.left - padding.right)
    : null;
  const displaySeriesValue = (item: typeof series[number], index: number) => {
    const point = points[index];
    if (item.key === "payAmount" && point.payAmountText) return formatDashboardMoney(point.payAmountText);
    if (item.key === "rechargeAmount" && point.rechargeAmountText) return formatDashboardMoney(point.rechargeAmountText);
    return item.format(item.values[index]);
  };

  const toggleMetric = (key: TrendMetricKey) => {
    setSelectedMetricKeys((current) => {
      if (!current.includes(key)) return [...current, key];
      if (current.length === 1) return current;
      return current.filter((item) => item !== key);
    });
  };

  return (
    <div className="flex min-h-[220px] min-w-0 flex-col">
      <div className="mb-2 flex flex-wrap gap-1.5" aria-label="经营趋势指标">
        {series.map((item) => {
          const selected = selectedMetricKeys.includes(item.key);
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleMetric(item.key)}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-[var(--admin-v2-control-radius)] border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] sm:h-8",
                selected
                  ? "border-[var(--admin-v2-border)] bg-white text-[var(--admin-v2-text-secondary)]"
                  : "border-transparent bg-[var(--admin-v2-surface-muted)] text-[var(--admin-v2-text-muted)] opacity-60",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selected ? item.color : "#cbd5e1" }} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
        {[
          { label: "新增用户", reason: "管理员只读统计接口尚未提供权威每日新增用户序列" },
          { label: "总用户", reason: "当前总用户为实时快照，尚无历史每日用户总量" },
        ].map((item) => <span key={item.label} className="dashboard-unavailable-metric inline-flex h-11 items-center rounded-full border px-2.5 text-xs sm:h-8" title={item.reason} aria-label={`${item.label}暂未接入：${item.reason}`} aria-disabled="true">{item.label} · 暂未接入</span>)}
      </div>
      <div className="relative shrink-0 overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface-muted)] px-2 py-1">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[200px] w-full touch-pan-y sm:h-[240px]"
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          aria-label="支付、充值、订单与访问综合趋势折线图"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            setActiveIndex((current) => event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
          }}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
            setActiveIndex(Math.round(ratio * Math.max(points.length - 1, 0)));
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const viewBoxX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * chartWidth;
            const ratio = Math.min(1, Math.max(0, (viewBoxX - padding.left) / (chartWidth - padding.left - padding.right)));
            setActiveIndex(Math.round(ratio * Math.max(points.length - 1, 0)));
          }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") setActiveIndex(null); }}
        >
          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = padding.top + ratio * (chartHeight - padding.top - padding.bottom);
            return <path key={ratio} d={`M${padding.left} ${y} H${chartWidth - padding.right}`} stroke="#e2e8f0" strokeDasharray="3 4" strokeWidth="1" />;
          })}
          {activeX !== null ? <path d={`M${activeX} ${padding.top} V${chartHeight - padding.bottom}`} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" /> : null}
          {selectedSeries.flatMap((item) => item.paths.map((path, index) => (
            <path key={`${item.key}-${index}`} d={path} fill="none" stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          )))}
          {selectedSeries.flatMap((item) => item.points.map((point, index) => point ? (
            <circle key={`${item.key}-${index}`} cx={point.x} cy={point.y} r={index === activeIndex ? "4" : "2.5"} fill={item.color} stroke="white" strokeWidth="1.25">
              <title>{`${points[index].date} · ${item.label} ${displaySeriesValue(item, index)}`}</title>
            </circle>
          ) : null))}
          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % labelStep !== 0) return null;
            const x = points.length === 1 ? chartWidth / 2 : padding.left + (index / (points.length - 1)) * (chartWidth - padding.left - padding.right);
            return <text key={point.date} x={x} y={chartHeight - 7} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="#64748b" fontSize="10" className="hidden sm:block">{point.date.slice(5)}</text>;
          })}
        </svg>
        {activePoint && activeX !== null ? (
          <div
            className={cn(
              "dashboard-trend-tooltip pointer-events-none absolute top-3 z-10 min-w-[180px] rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] bg-white p-2.5 text-xs shadow-lg",
              activeIndex !== null && activeIndex > 0 && activeIndex >= points.length / 2 ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
            )}
            style={{ left: `${(activeX / chartWidth) * 100}%` }}
            role="tooltip"
          >
            <div className="mb-1.5 font-semibold text-[var(--admin-v2-text-primary)]">{activePoint.date}</div>
            <div className="space-y-1 text-[var(--admin-v2-text-secondary)]">
              {selectedSeries.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                  <span className="font-medium tabular-nums text-[var(--admin-v2-text-primary)]">{displaySeriesValue(item, inspectionIndex)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-xs text-[var(--admin-v2-text-muted)] sm:hidden" aria-hidden="true">
        <span>{points[0].date.slice(5)}</span><span>{points[Math.floor((points.length - 1) / 2)].date.slice(5)}</span><span>{points[points.length - 1].date.slice(5)}</span>
      </div>
      <p className="dashboard-chart-hint">鼠标悬停、触摸图上数据点；键盘聚焦图表后使用方向键查看每日数值。</p>
    </div>
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
      x: values.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (values.length - 1)) * plotWidth,
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
  const statusText = channel.failed ? READ_FAILED : channel.configured === null ? "配置状态未确认" : channel.enabled ? "已启用" : channel.configured ? "已停用" : "未配置";
  const successRate = formatPercent(channel.successful, channel.initiated);
  return (
    <Link href={`/admin/payments?channel=${channel.code}`} className="dashboard-channel-row block rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] p-3 transition-colors hover:border-blue-200 hover:bg-[var(--admin-v2-selected)]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-slate-900">{channel.label}</div>
          <div className="mt-0.5 text-xs text-slate-500">{loading ? "加载中" : statusText}</div>
        </div>
        <Badge variant={!channel.failed && channel.enabled ? "default" : "secondary"}>{statusText}</Badge>
      </div>
      <div className="dashboard-channel-amount">{channel.failed ? READ_FAILED : channel.amountText ?? formatMoney(channel.amount)}<span>商城订单人民币成交额 · 按支付日</span></div>
      <div className="dashboard-channel-stats">
        <MiniStat label="发起" value={channel.failed ? READ_FAILED : channel.initiated} />
        <MiniStat label="成功" value={channel.failed ? READ_FAILED : channel.successful} />
        <MiniStat label="成功率" value={channel.failed ? READ_FAILED : successRate} />
        <MiniStat label="失败/过期/关闭" value={channel.failed ? READ_FAILED : channel.exceptions} danger />
      </div>
      {channel.rawReceipts?.length ? <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
        {channel.rawReceipts.map((row) => <p key={row.currency} className="break-words">
          {row.currency} 会话：发起 {row.initiated} · 成功 {row.successful} · 当前异常/终止 {row.exceptions} · 原币实收 {row.currency === "CNY" || row.currency === "USDT" ? formatDashboardMoney(row.amount, row.currency) : `${row.amount} ${row.currency}`}
        </p>)}
      </div> : null}
    </Link>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: MetricValue; danger?: boolean }) {
  return (
    <div className="dashboard-mini-stat min-w-0 rounded-lg bg-[var(--admin-v2-surface-muted)] px-2 py-2">
      <div className="text-xs text-[var(--admin-v2-text-muted)]">{label}</div>
      <div className={`break-words text-sm font-semibold tabular-nums ${danger && Number(value) > 0 ? "text-red-600" : "text-slate-900"}`}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function TodoLink({ item, overview, valueOverride }: { item: TodoItem; overview?: MetricCard; valueOverride?: string }) {
  const urgent = Number(item.value ?? 0) > 0;
  const critical = urgent && /失败|异常/.test(item.label);
  return (
    <div className={`dashboard-todo-card ${critical ? "critical" : urgent ? "warning" : ""} min-h-[64px] bg-white px-3 py-2 ${urgent ? "text-[var(--admin-v2-danger-foreground)]" : "text-[var(--admin-v2-text-muted)]"}`}>
      <Link href={item.href} className="dashboard-todo-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)]">
        <span>{critical ? <CircleAlert className="dashboard-operation-icon" aria-hidden="true" /> : urgent ? <Clock3 className="dashboard-operation-icon" aria-hidden="true" /> : null}{item.label}</span>
        <strong>{valueOverride ?? item.value ?? NOT_CONNECTED}</strong>
      </Link>
      {overview?.label === "低库存商品" ? <span className="dashboard-todo-detail">当前商品页样本：{formatNumber(overview.value)}</span> : null}
      {overview?.href && overview.href !== item.href ? <Link href={overview.href} className="dashboard-todo-alternate">查看概览 →</Link> : null}
    </div>
  );
}

function ProductListCard({ title, rows, type, loading }: { title: string; rows: ProductRank[]; type: "sales" | "amount"; loading: boolean }) {
  return (
    <Card className="dashboard-panel dashboard-ranking-card flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : rows.length === 0 ? (
          <AdminEmptyState title="暂无销量数据" description="订单明细产生后会显示真实排行。" className="min-h-[96px]" />
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <Link key={row.id} href={`/admin/products?search=${encodeURIComponent(row.name)}`} className="dashboard-rank-row flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="break-words font-medium text-slate-900 sm:truncate" title={row.name}>{index + 1}. {row.name}</div>
                  <div className="text-xs text-slate-500">库存 {row.stock} · {statusLabel(row.status)}</div>
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
    <Card className="dashboard-panel dashboard-product-card flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 px-4 py-3">
        <CardTitle className="text-base">商品经营</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {groups.map((group) => (
              <div key={group.label} className="flex min-h-[218px] min-w-0 flex-col rounded-xl border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Link href="/admin/products" className="text-sm font-semibold text-slate-900 underline-offset-4 hover:text-blue-700 hover:underline">{group.label}</Link>
                </div>
                {group.rows.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-xs text-slate-500">暂无数据</div>
                ) : group.rows.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex min-w-0 items-center gap-1 py-1 text-xs">
                    <TooltipProvider delayDuration={250}><Tooltip>
                      <TooltipTrigger asChild><Link href={`/admin/products?search=${encodeURIComponent(product.slug)}`} title={product.name} aria-label={`${product.name}，库存 ${product.stock}`} className="min-w-0 flex-1 truncate text-slate-700 hover:underline">{product.name}</Link></TooltipTrigger>
                      <TooltipPrimitive.Portal><TooltipContent className="max-w-[min(90vw,36rem)] break-all">{product.name}</TooltipContent></TooltipPrimitive.Portal>
                    </Tooltip></TooltipProvider>
                    <span className="shrink-0 text-slate-500">{product.stock}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOrdersCard({ rows, loading, failed }: { rows: DashboardOrder[]; loading: boolean; failed?: boolean }) {
  return (
    <CompactTableCard
      title="最近订单"
      loading={loading}
      failed={failed}
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

function RecentRechargesCard({ rows, loading, failed }: { rows: DashboardRecharge[]; loading: boolean; failed?: boolean }) {
  return (
    <CompactTableCard
      title="最近充值"
      loading={loading}
      failed={failed}
      emptyTitle="暂无充值"
      headers={["充值单号", "用户", "金额", "渠道", "状态", "时间"]}
      rows={rows.map((row) => [
        row.recharge_no,
        row.user_email ?? "—",
        formatMoney(row.amount),
        row.channel_name ?? row.channel_code ?? "—",
        statusLabel(row.status),
        formatDateTime(row.created_at),
      ])}
      href="/admin/recharges"
    />
  );
}

function CompactTableCard({
  title,
  loading,
  failed,
  emptyTitle,
  headers,
  rows,
  href,
}: {
  title: string;
  loading: boolean;
  failed?: boolean;
  emptyTitle: string;
  headers: string[];
  rows: string[][];
  href: string;
}) {
  return (
    <Card className="dashboard-panel dashboard-record-card flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link href={href} className="inline-flex items-center text-xs text-orange-600">
          查看全部 <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="dashboard-record-content min-h-0 px-4 pb-4 pt-0">
        {loading ? <ListSkeleton /> : failed ? <p role="alert" className="py-6 text-sm text-red-700">最近记录读取失败，请刷新后重试。</p> : rows.length === 0 ? (
          <AdminEmptyState title={emptyTitle} description="有真实数据后会显示在这里；此处预留最近五条记录的位置。" className="dashboard-record-empty" />
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {rows.slice(0, 5).map((row, index) => <dl key={`${title}-mobile-${index}`} className="rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] p-3">
              {row.map((cell, cellIndex) => <div key={headers[cellIndex]} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-1 text-sm">
                <dt className="text-[var(--admin-v2-text-muted)]">{headers[cellIndex]}</dt>
                <dd className="min-w-0 text-[var(--admin-v2-text-primary)]">{["订单号", "充值单号", "用户"].includes(headers[cellIndex]) ? <CopyableValue value={cell} label={headers[cellIndex]} /> : <span className="block truncate" title={cell}>{cell}</span>}</dd>
              </div>)}
            </dl>)}
          </div>
          <div className="dashboard-record-table hidden md:block" role="region" aria-label={`${title}数据表，可左右滑动`} tabIndex={0}>
          <Table className="min-w-[680px] table-fixed">
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header} className="h-8 whitespace-nowrap text-xs">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 5).map((row, index) => (
                <TableRow key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${title}-${index}-${cellIndex}`} className="max-w-[180px] overflow-hidden whitespace-nowrap py-2 text-xs">
                      {["订单号", "充值单号", "用户"].includes(headers[cellIndex]) ? <CopyableValue value={cell} label={headers[cellIndex]} /> : <span className="block truncate" title={cell}>{cell}</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <p className="dashboard-scroll-hint hidden md:block">表格可左右滑动查看完整字段</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  if (!value || value === "—") return null;
  return <button
    type="button"
    className="dashboard-copy-button inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
    aria-label={`复制完整${label}`}
    title={`复制完整${label}`}
    onClick={async () => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label}已复制`);
      } catch {
        toast.error(`${label}复制失败，请检查浏览器剪贴板权限`);
      }
    }}
  ><Copy aria-hidden="true" className="h-4 w-4" /></button>;
}

function CopyableValue({ value, label }: { value: string; label: string }) {
  return <div className="dashboard-copy-value flex min-w-0 items-center gap-1">
    <TooltipProvider delayDuration={250}><Tooltip>
      <TooltipTrigger asChild><span className="min-w-0 flex-1 truncate focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" title={value} tabIndex={0} aria-label={`${label}：${value}`}>{value}</span></TooltipTrigger>
      <TooltipPrimitive.Portal><TooltipContent className="max-w-[min(90vw,36rem)] break-all">{value}</TooltipContent></TooltipPrimitive.Portal>
    </Tooltip></TooltipProvider>
    <CopyValueButton value={value} label={label} />
  </div>;
}

function SystemStatusCard({ rows, lastRefreshedAt, loading }: { rows: SystemStatus[]; lastRefreshedAt: string | null; loading: boolean }) {
  return (
    <Card className="dashboard-panel dashboard-system-card shrink-0 overflow-hidden">
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

// Kept after the data/query section so the Production source-contract guard remains byte-identical.
import "./dashboard-v21.css";
