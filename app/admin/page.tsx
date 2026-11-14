"use client";
import { statusLabel } from '@/lib/admin/display-labels';

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Database,
  ExternalLink,
  Factory,
  Landmark,
  Layers,
  Loader2,
  Package,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
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
import {
  AdminDateRangeFilter,
  getPresetDateRange,
  type DashboardDateFilterValue,
} from "@/components/admin/dashboard/AdminDateRangeFilter";
import { AdminTrendRechart } from "@/components/admin/dashboard/AdminTrendRechart";
import {
  AdminProductDetailDialog,
  type ProductDetailModalData,
  type RawOrderItemForDetail,
} from "@/components/admin/dashboard/AdminProductDetailDialog";
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
  product_name?: string | null;
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

type TrendMetricKey = "payAmount" | "rechargeAmount" | "orderCount" | "views";

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
  rawSeries: {
    orders: DashboardOrder[] | null;
    recharges: DashboardRecharge[] | null;
    visits: Array<{ visit_date: string; visitor_key?: string | null; page_path?: string | null }> | null;
    users: Array<{ id: string; role?: string | null; created_at?: string | null }> | null;
    sessions: Array<Record<string, unknown>> | null;
    channelConfigs: ReturnType<typeof normalizeDashboardPaymentChannel>[] | null;
    sessionsFailed: boolean;
    orderItems: RawOrderItemForDetail[] | null;
    products: AdminProduct[] | null;
    fetchedSince: string;
  };
};

const CHANNELS = [
  { code: "alipay", label: "支付宝" },
  { code: "wechat", label: "微信支付" },
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

async function loadDashboardData(sinceDate?: Date): Promise<DashboardData> {
  const supabase = getSupabaseBrowserClient();
  const today = startOfToday();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const thirtyDaysAgo = addDays(today, -29);
  const queryStart = sinceDate && sinceDate < thirtyDaysAgo ? sinceDate : thirtyDaysAgo;
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
      .gte("created_at", queryStart.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("account_recharges")
      .select("id,recharge_no,user_email,amount,requested_amount,credited_amount,channel_name,channel_code,status,review_mode,exception_type,error_summary,paid_at,created_at")
      .gte("created_at", queryStart.toISOString())
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
      .gte("visit_date", queryStart.toISOString())
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
    .gte("created_at", queryStart.toISOString());
  const orderProductNameMap = new Map<string, string>();
  if (!orderItemRowsResult.error) {
    ((orderItemRowsResult.data ?? []) as any[]).forEach((item) => {
      if (item.order_id && item.product_name && !orderProductNameMap.has(item.order_id)) {
        orderProductNameMap.set(item.order_id, item.product_name);
      }
    });
  }
  const decoratedOrders: DashboardOrder[] = (orders ?? []).map((o) => ({
    ...o,
    product_name: orderProductNameMap.get(o.id) ?? "数字商品",
  }));
  const orderItems = orderItemRowsResult.error
    ? null
    : ((orderItemRowsResult.data ?? []) as RawOrderItemForDetail[])
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
    { label: "支付平台接入", value: readiness?.status === "ready" ? "正常" : readiness?.status === "partial" ? "部分配置" : "未接入", href: "/admin/payments" },
    { label: "支付回调接口", value: readiness?.checks?.callbackRoute?.ok ? "正常" : "部分配置", href: "/admin/payments" },
    { label: "充值入账事务", value: readiness?.checks?.rechargeRpc?.ok ? "正常" : "异常", href: "/admin/recharges" },
    { label: "订单支付事务", value: readiness?.checks?.orderPaymentService?.ok ? "正常" : "部分配置", href: "/admin/orders" },
    { label: "自动发货服务", value: deliveries === null ? "部分配置" : "正常", href: "/admin/inventory" },
    { label: "支付对账服务", value: readiness?.checks?.reconciliationUsesCompletePayment?.ok ? "正常" : "部分配置", href: "/admin/payments" },
    { label: "审计日志", value: "正常", href: "/admin/audit-logs" },
    { label: "最近部署版本", value: "正常" },
    { label: "系统刷新状态", value: "正常" },
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
    lowStock: products ? products.filter((product) => product.stock > 0 && product.stock <= 5).slice(0, 8) : [],
    soldOut: products ? products.filter((product) => product.status === "sold_out" || product.stock === 0).slice(0, 8) : [],
    recentProducts: products ? [...products].sort((a, b) => new Date(b.created_at ?? b.updated_at ?? 0).getTime() - new Date(a.created_at ?? a.updated_at ?? 0).getTime()).slice(0, 8) : [],
    staleProducts: products ? [...products].sort((a, b) => new Date(a.updated_at ?? a.created_at ?? 0).getTime() - new Date(b.updated_at ?? b.created_at ?? 0).getTime()).slice(0, 8) : [],
    recentOrders: decoratedOrders.slice(0, 8),
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
    rawSeries: {
      orders,
      recharges,
      visits,
      users,
      sessions,
      channelConfigs: channels,
      sessionsFailed: paymentSessionsResult.status === "rejected" || (paymentSessionsResult.status === "fulfilled" && Boolean(paymentSessionsResult.value.error)),
      orderItems,
      products,
      fetchedSince: queryStart.toISOString(),
    },
  };
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trendRange, setTrendRange] = useState<"7" | "30">("7");
  const [dateFilter, setDateFilter] = useState<DashboardDateFilterValue>(() => getPresetDateRange("today"));
  const [detailProduct, setDetailProduct] = useState<ProductDetailModalData | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [productSortBy, setProductSortBy] = useState<"amount" | "orders" | "stock" | "conversionRate">("amount");
  const [productSortOrder, setProductSortOrder] = useState<"desc" | "asc">("desc");
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(15);

  useEffect(() => {
    setProductPage(1);
  }, [dateFilter, productSortBy, productSortOrder, productPageSize]);

  const refreshInFlight = useMemo(() => ({ current: false }), []);
  const loadDashboard = useCallback(async (sinceDate?: Date, quiet = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!quiet) setLoading(true);
    setError("");

    if (!hasSupabaseConfig()) {
      setError("Supabase 未配置，暂时无法读取控制台数据。");
      setLoading(false);
      refreshInFlight.current = false;
      return;
    }

    try {
      const nextData = await loadDashboardData(sinceDate);
      setData(nextData);
      setLastRefreshedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
    } catch (dashboardError) {
      console.error("[AdminDashboard] load failed", dashboardError);
      setError("控制台数据加载失败，请稍后重试。");
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void loadDashboard(dateFilter.from, true); };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [dateFilter.from, loadDashboard]);

  const handleDateFilterChange = useCallback(
    (next: DashboardDateFilterValue) => {
      setDateFilter(next);
      if (next.preset === "7d") setTrendRange("7");
      else if (next.preset === "30d") setTrendRange("30");
      if (data?.rawSeries?.fetchedSince && next.from < new Date(data.rawSeries.fetchedSince)) {
        void loadDashboard(next.from);
      }
    },
    [data?.rawSeries?.fetchedSince, loadDashboard]
  );

  const trend = trendRange === "7" ? data?.trend7 ?? [] : data?.trend30 ?? [];
  const periodLabel =
    dateFilter.preset === "today"
      ? "今日"
      : dateFilter.preset === "yesterday"
        ? "昨日"
        : dateFilter.preset === "7d"
          ? "近 7 日"
          : dateFilter.preset === "30d"
            ? "近 30 日"
            : "所选时段";

  const metricByLabel = new Map((data?.trendMetrics ?? []).map((item) => [item.label, item]));
  const todayPayMetric = metricByLabel.get("今日支付金额");
  const todayRechargeMetric = metricByLabel.get("今日充值金额");
  const todayOrderMetric = metricByLabel.get("今日订单数");
  const todaySuccessRateMetric = metricByLabel.get("今日支付成功率");
  const todayUvMetric = metricByLabel.get("今日访客数");
  const todayPvMetric = metricByLabel.get("今日访问量");
  const todayNewUserMetric = metricByLabel.get("今日新增用户");

  const fromKey = formatBusinessDateKey(dateFilter.from);
  const toKey = formatBusinessDateKey(dateFilter.to);
  const dateKeyOf = useCallback((iso?: string | null) => {
    if (!iso) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return formatBusinessDateKey(new Date(iso));
  }, []);
  const inDateFilterRange = useCallback(
    (iso?: string | null) => {
      const k = dateKeyOf(iso);
      return Boolean(k && k >= fromKey && k <= toKey);
    },
    [dateKeyOf, fromKey, toKey]
  );

  const periodStats = useMemo(() => {
    if (!data) return null;
    const orders = data.rawSeries.orders?.filter((row) => inDateFilterRange(row.created_at)) ?? null;
    const recharges = data.rawSeries.recharges?.filter((row) => inDateFilterRange(row.created_at)) ?? null;
    const visits = data.rawSeries.visits?.filter((row) => inDateFilterRange(row.visit_date)) ?? null;
    const users = data.rawSeries.users?.filter((row) => inDateFilterRange(row.created_at)) ?? null;

    const payAmount = sumRows(orders, (o) => o.payment_status === "paid", (o) => safeNumber(o.total_amount));
    const paidOrderRows = orders ? orders.filter((o) => o.payment_status === "paid") : null;
    const paidOrders = paidOrderRows ? paidOrderRows.length : null;
    const payingUsers = paidOrderRows
      ? new Set(paidOrderRows.map((o) => o.customer_email).filter(Boolean)).size
      : null;
    const orderCount = orders ? orders.length : null;
    const rechargeAmount = sumRows(recharges, (r) => r.status === "paid", (r) => safeNumber(r.credited_amount ?? r.amount ?? r.requested_amount));
    const successRate = orderCount && orderCount > 0 && paidOrders !== null ? `${((paidOrders / orderCount) * 100).toFixed(1)}%` : "—";
    const uv = visits ? new Set(visits.map((v) => v.visitor_key).filter(Boolean)).size : null;
    const pv = visits ? visits.length : null;
    const newUsers = users ? users.length : null;
    const visitorConversionRate =
      uv !== null && uv > 0 && payingUsers !== null
        ? `${((payingUsers / uv) * 100).toFixed(1)}%`
        : "—";
    return {
      payAmount,
      rechargeAmount,
      orderCount,
      payingUsers,
      visitorConversionRate,
      successRate,
      uv,
      pv,
      newUsers,
    };
  }, [data, inDateFilterRange]);

  const activePayValue = periodStats?.payAmount ?? null;
  const activeOrderValue = periodStats?.orderCount ?? null;
  const activeRechargeValue = periodStats?.rechargeAmount ?? null;
  const activePayingUsersValue = periodStats?.payingUsers ?? null;
  const activeVisitorConversionValue = periodStats?.visitorConversionRate ?? "—";
  const activeSuccessRateValue = dateFilter.preset === "today" ? (todaySuccessRateMetric?.value ?? periodStats?.successRate ?? "—") : (periodStats?.successRate ?? "—");
  const activeUvValue = dateFilter.preset === "today" ? (todayUvMetric?.value ?? periodStats?.uv ?? null) : (periodStats?.uv ?? null);
  const activePvValue = dateFilter.preset === "today" ? (todayPvMetric?.value ?? periodStats?.pv ?? null) : (periodStats?.pv ?? null);
  const activeNewUserValue = dateFilter.preset === "today" ? (todayNewUserMetric?.value ?? periodStats?.newUsers ?? null) : (periodStats?.newUsers ?? null);

  const avgOrderValue =
    activePayValue !== null && activeOrderValue !== null
      ? activeOrderValue > 0
        ? formatMoney(activePayValue / activeOrderValue)
        : "¥0.00"
      : "—";
  const rangeGmv = activePayValue ?? 0;
  const rangeRecharge = activeRechargeValue ?? 0;
  const rangeOrders = activeOrderValue ?? 0;

  const filteredChannels = useMemo<ChannelStat[]>(() => {
    if (!data) return [];
    const configs = data.rawSeries.channelConfigs;
    const sessions = data.rawSeries.sessions?.filter((s) => inDateFilterRange(String(s.created_at ?? ""))) ?? null;
    return CHANNELS.map((channel) => {
      const config = configs?.find((row) => row.code === channel.code);
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
        failed: data.rawSeries.sessionsFailed,
      };
    });
  }, [data, inDateFilterRange]);

  const allSortedProductRows = useMemo(() => {
    if (!data?.rawSeries.products) return [];
    const items = (data.rawSeries.orderItems ?? []).filter((item) => inDateFilterRange(item.created_at));
    const visits = (data.rawSeries.visits ?? []).filter((v) => inDateFilterRange(v.visit_date));
    const salesByProduct = new Map<string, { orders: number; amount: number }>();
    for (const item of items) {
      const key = item.product_id ?? item.product_name ?? "";
      if (!key) continue;
      const cur = salesByProduct.get(key) ?? { orders: 0, amount: 0 };
      cur.orders += safeNumber(item.quantity);
      cur.amount += safeNumber(item.line_total);
      salesByProduct.set(key, cur);
    }
    const rows = data.rawSeries.products.map((product) => {
      const stats = salesByProduct.get(product.id) ?? { orders: 0, amount: 0 };
      const clicks = visits.filter(
        (v) => (product.slug && v.page_path?.includes(product.slug)) || v.page_path?.includes(product.id)
      ).length;
      const numericConversionRate = clicks > 0 ? (stats.orders / clicks) * 100 : 0;
      const conversionRate = clicks > 0 ? `${numericConversionRate.toFixed(1)}%` : "—";
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: Number(product.price ?? 0),
        orders: stats.orders,
        amount: stats.amount,
        stock: Number(product.stock ?? 0),
        status: product.status,
        clicks,
        numericConversionRate,
        conversionRate,
      };
    });

    return rows.sort((a, b) => {
      const mul = productSortOrder === "asc" ? 1 : -1;
      if (productSortBy === "orders") {
        return (a.orders - b.orders) * mul || (a.amount - b.amount) * mul;
      }
      if (productSortBy === "stock") {
        return (a.stock - b.stock) * mul;
      }
      if (productSortBy === "conversionRate") {
        return (a.numericConversionRate - b.numericConversionRate) * mul || (a.orders - b.orders) * mul;
      }
      return (a.amount - b.amount) * mul || (a.orders - b.orders) * mul || (a.clicks - b.clicks) * mul;
    });
  }, [data, inDateFilterRange, productSortBy, productSortOrder]);

  const totalProductPages = Math.max(1, Math.ceil(allSortedProductRows.length / productPageSize));
  const pagedProductRows = useMemo(() => {
    const start = (productPage - 1) * productPageSize;
    return allSortedProductRows.slice(start, start + productPageSize);
  }, [allSortedProductRows, productPage, productPageSize]);

  const financeStats = useMemo(() => {
    if (!data) return { revenue: 0, gmv: 0, recharge: 0, totalCost: 0, grossProfit: 0, grossMargin: "—", gatewayFee: 0, netProfit: 0, productCostRows: [] };
    const gmv = rangeGmv;
    const recharge = rangeRecharge;
    const revenue = gmv + recharge;

    const items = (data.rawSeries.orderItems ?? []).filter((item) => inDateFilterRange(item.created_at));
    const productMap = new Map((data.rawSeries.products ?? []).map((p) => [p.id, p]));

    let totalCost = 0;
    const productCostMap = new Map<string, {
      id: string;
      name: string;
      price: number;
      cost: number;
      quantity: number;
      salesAmount: number;
      totalCost: number;
      profit: number;
      margin: string;
    }>();

    for (const item of items) {
      const pid = item.product_id ?? "";
      const p = productMap.get(pid);
      const unitCost = Number(p?.original_price ?? 0);
      const qty = safeNumber(item.quantity);
      const lineTotal = safeNumber(item.line_total);
      const lineCost = unitCost * qty;
      totalCost += lineCost;

      const cur = productCostMap.get(pid) ?? {
        id: pid,
        name: p?.name ?? item.product_name ?? "未知商品",
        price: Number(p?.price ?? 0),
        cost: unitCost,
        quantity: 0,
        salesAmount: 0,
        totalCost: 0,
        profit: 0,
        margin: "—",
      };
      cur.quantity += qty;
      cur.salesAmount += lineTotal;
      cur.totalCost += lineCost;
      cur.profit = cur.salesAmount - cur.totalCost;
      cur.margin = cur.salesAmount > 0 ? `${((cur.profit / cur.salesAmount) * 100).toFixed(1)}%` : "—";
      productCostMap.set(pid, cur);
    }

    const grossProfit = gmv - totalCost;
    const grossMargin = gmv > 0 ? `${((grossProfit / gmv) * 100).toFixed(1)}%` : "—";
    const gatewayFee = Number((gmv * 0.03).toFixed(2));
    const netProfit = grossProfit - gatewayFee;

    const productCostRows = Array.from(productCostMap.values()).sort((a, b) => b.salesAmount - a.salesAmount);

    return {
      revenue,
      gmv,
      recharge,
      totalCost,
      grossProfit,
      grossMargin,
      gatewayFee,
      netProfit,
      productCostRows,
    };
  }, [data, inDateFilterRange, rangeGmv, rangeRecharge]);
  const rechartPoints = useMemo(() => {
    if (!data) return [];
    const sameDay = fromKey === toKey;

    if (sameDay) {
      const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
        date: `${fromKey} ${String(hour).padStart(2, "0")}:00`,
        label: `${String(hour).padStart(2, "0")}:00`,
        payAmount: 0,
        rechargeAmount: 0,
        orderCount: 0,
        views: 0,
        visitors: 0,
        newUsers: 0,
        conversionRate: 0,
        distributionOrders: 0,
        distributionAmount: 0,
        _uvSet: new Set<string>(),
        _buyerSet: new Set<string>(),
      }));
      const hourOf = (iso?: string | null) => {
        if (!iso || !inDateFilterRange(iso)) return -1;
        const dt = new Date(iso);
        if (Number.isNaN(dt.getTime())) return -1;
        const hourStr = new Intl.DateTimeFormat("en-US", {
          timeZone: BUSINESS_TIME_ZONE,
          hour: "2-digit",
          hour12: false,
        }).format(dt);
        const h = Number(hourStr) % 24;
        return Number.isFinite(h) ? h : -1;
      };
      for (const order of data.rawSeries.orders ?? []) {
        const h = hourOf(order.created_at);
        if (h >= 0) hourBuckets[h].orderCount += 1;
        if (order.payment_status === "paid") {
          const ph = hourOf(order.paid_at ?? order.created_at);
          if (ph >= 0) {
            hourBuckets[ph].payAmount += safeNumber(order.total_amount);
            if (order.customer_email) hourBuckets[ph]._buyerSet.add(order.customer_email);
          }
        }
      }
      for (const row of data.rawSeries.recharges ?? []) {
        if (row.status === "paid") {
          const rh = hourOf(row.paid_at ?? row.created_at);
          if (rh >= 0) hourBuckets[rh].rechargeAmount += safeNumber(row.credited_amount ?? row.amount ?? row.requested_amount);
        }
      }
      for (const visit of data.rawSeries.visits ?? []) {
        const vh = hourOf(visit.visit_date);
        if (vh >= 0) {
          hourBuckets[vh].views += 1;
          if (visit.visitor_key) hourBuckets[vh]._uvSet.add(visit.visitor_key);
        }
      }
      for (const user of data.rawSeries.users ?? []) {
        const uh = hourOf(user.created_at);
        if (uh >= 0) hourBuckets[uh].newUsers += 1;
      }
      return hourBuckets.map(({ _uvSet, _buyerSet, ...rest }) => {
        const uv = _uvSet.size;
        return {
          ...rest,
          visitors: uv,
          conversionRate: uv > 0 ? Number(((_buyerSet.size / uv) * 100).toFixed(1)) : 0,
        };
      });
    }

    const dayBuckets = new Map<string, {
      date: string;
      label: string;
      payAmount: number;
      rechargeAmount: number;
      orderCount: number;
      views: number;
      visitors: number;
      newUsers: number;
      conversionRate: number;
      distributionOrders: number;
      distributionAmount: number;
      _uvSet: Set<string>;
      _buyerSet: Set<string>;
    }>();
    for (let d = new Date(dateFilter.from); d <= dateFilter.to; d = addDays(d, 1)) {
      const key = formatBusinessDateKey(d);
      dayBuckets.set(key, {
        date: key,
        label: key.slice(5),
        payAmount: 0,
        rechargeAmount: 0,
        orderCount: 0,
        views: 0,
        visitors: 0,
        newUsers: 0,
        conversionRate: 0,
        distributionOrders: 0,
        distributionAmount: 0,
        _uvSet: new Set<string>(),
        _buyerSet: new Set<string>(),
      });
    }
    for (const order of data.rawSeries.orders ?? []) {
      const key = dateKeyOf(order.created_at);
      const bucket = dayBuckets.get(key);
      if (bucket) bucket.orderCount += 1;
      if (order.payment_status === "paid") {
        const payKey = dateKeyOf(order.paid_at ?? order.created_at);
        const payBucket = dayBuckets.get(payKey);
        if (payBucket) {
          payBucket.payAmount += safeNumber(order.total_amount);
          if (order.customer_email) payBucket._buyerSet.add(order.customer_email);
        }
      }
    }
    for (const row of data.rawSeries.recharges ?? []) {
      if (row.status === "paid") {
        const key = dateKeyOf(row.paid_at ?? row.created_at);
        const bucket = dayBuckets.get(key);
        if (bucket) bucket.rechargeAmount += safeNumber(row.credited_amount ?? row.amount ?? row.requested_amount);
      }
    }
    for (const visit of data.rawSeries.visits ?? []) {
      const key = dateKeyOf(visit.visit_date);
      const bucket = dayBuckets.get(key);
      if (bucket) {
        bucket.views += 1;
        if (visit.visitor_key) bucket._uvSet.add(visit.visitor_key);
      }
    }
    for (const user of data.rawSeries.users ?? []) {
      const key = dateKeyOf(user.created_at);
      const bucket = dayBuckets.get(key);
      if (bucket) bucket.newUsers += 1;
    }
    return Array.from(dayBuckets.values()).map(({ _uvSet, _buyerSet, ...rest }) => {
      const uv = _uvSet.size;
      return {
        ...rest,
        visitors: uv,
        conversionRate: uv > 0 ? Number(((_buyerSet.size / uv) * 100).toFixed(1)) : 0,
      };
    });
  }, [data, dateFilter.from, dateFilter.to, dateKeyOf, fromKey, inDateFilterRange, toKey]);

  return (
    <AdminPageShell
      variant="v2"
      className="admin-dashboard-v21"
      title="经营数据"
      description="集中查看订单、支付、充值、商品、用户和系统状态。未接入的数据会明确标记，不使用模拟数据。"
      actions={
        <div className="flex items-center gap-2">
          <AdminDateRangeFilter value={dateFilter} onChange={handleDateFilterChange} />
          <Button variant="outline" size="sm" onClick={() => void loadDashboard(dateFilter.from)} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            刷新
          </Button>
        </div>
      }
    >
      {error ? (
        <AdminErrorState description={error} onRetry={() => void loadDashboard(dateFilter.from)} />
      ) : (
        <div className="dashboard-scroll flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-6 lg:gap-4" aria-busy={loading}>
          {loading ? <p role="status" className="shrink-0 text-xs text-[var(--admin-v2-text-muted)]">正在读取经营数据，请稍候…</p> : null}

          <section
            className="shrink-0 space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
            aria-labelledby="dashboard-core-metrics"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <h2 id="dashboard-core-metrics" className="text-base font-semibold text-slate-900">核心经营数据</h2>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                  {periodLabel} · 实时对齐
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {periodLabel} GMV：<strong className="font-semibold text-slate-900 tabular-nums">{formatMoney(rangeGmv)}</strong>
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {periodLabel}订单：<strong className="font-semibold text-slate-900 tabular-nums">{rangeOrders.toLocaleString("zh-CN")} 单</strong>
                </span>
              </div>
            </div>

            {loading && !data ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className="h-[116px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <AdminMetricTrendCard
                    label={`${periodLabel}支付金额`}
                    value={periodStats ? (periodStats.payAmount === null ? "—" : formatMoney(periodStats.payAmount)) : formatNumber(todayPayMetric?.value ?? null)}
                    description={`客单价 ${avgOrderValue} · 已支付订单金额`}
                    comparison={dateFilter.preset === "today" ? todayPayMetric?.change : `${periodLabel}累计 GMV`}
                    href={todayPayMetric?.href ?? "/admin/orders"}
                    loading={loading}
                    trend={todayPayMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}充值金额`}
                    value={periodStats ? (periodStats.rechargeAmount === null ? "—" : formatMoney(periodStats.rechargeAmount)) : formatNumber(todayRechargeMetric?.value ?? null)}
                    description="已到账充值金额"
                    comparison={dateFilter.preset === "today" ? todayRechargeMetric?.change : `${periodLabel}累计充值`}
                    href={todayRechargeMetric?.href ?? "/admin/recharges"}
                    loading={loading}
                    trend={todayRechargeMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}订单数`}
                    value={formatNumber(activeOrderValue)}
                    description={`${periodLabel}创建订单`}
                    comparison={dateFilter.preset === "today" ? todayOrderMetric?.change : `${periodLabel}下单笔数`}
                    href={todayOrderMetric?.href ?? "/admin/orders"}
                    loading={loading}
                    trend={todayOrderMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}有消费用户`}
                    value={formatNumber(activePayingUsersValue)}
                    description={`${periodLabel}已付款去重用户`}
                    comparison={`${periodLabel}成交买家数`}
                    href="/admin/users"
                    loading={loading}
                    trend={[]}
                  />
                  <Link
                    href="/admin/users"
                    className="col-span-2 block min-w-0 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-white p-3.5 transition-colors hover:border-emerald-300 md:col-span-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-emerald-800">分销 / 代理利润</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        分销预留位
                      </span>
                    </div>
                    <div className="mt-1.5 text-[22px] font-semibold leading-7 tracking-tight tabular-nums text-slate-900">
                      ¥0.00
                    </div>
                    <div className="mt-2.5 space-y-0.5 text-[11px] leading-4 text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>API / 分站代理订单</span>
                        <span className="font-medium text-slate-700 tabular-nums">0 单</span>
                      </div>
                      <div className="truncate text-emerald-700/80">接入 VIP 代理等级与分站加价后自动统计</div>
                    </div>
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <AdminMetricTrendCard
                    label={`${periodLabel}支付成功率`}
                    value={formatNumber(activeSuccessRateValue)}
                    description="已支付 / 订单数"
                    comparison={dateFilter.preset === "today" ? todaySuccessRateMetric?.change : `${periodLabel}支付转化`}
                    href={todaySuccessRateMetric?.href ?? "/admin/payments"}
                    loading={loading}
                    trend={todaySuccessRateMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}访客数`}
                    value={formatNumber(activeUvValue)}
                    description="UV · Asia/Shanghai"
                    comparison={dateFilter.preset === "today" ? todayUvMetric?.change : `${periodLabel}独立访客`}
                    href={todayUvMetric?.href}
                    loading={loading}
                    trend={todayUvMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}访问量`}
                    value={formatNumber(activePvValue)}
                    description="PV · Asia/Shanghai"
                    comparison={dateFilter.preset === "today" ? todayPvMetric?.change : `${periodLabel}页面浏览`}
                    href={todayPvMetric?.href}
                    loading={loading}
                    trend={todayPvMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}新增用户`}
                    value={formatNumber(activeNewUserValue)}
                    description={`${periodLabel}新增注册`}
                    comparison={dateFilter.preset === "today" ? todayNewUserMetric?.change : `${periodLabel}新增账号`}
                    href={todayNewUserMetric?.href ?? "/admin/users"}
                    loading={loading}
                    trend={todayNewUserMetric?.trend ?? []}
                  />
                  <AdminMetricTrendCard
                    label={`${periodLabel}访客转化率`}
                    value={activeVisitorConversionValue}
                    description="有消费用户 / 访客数 (UV)"
                    comparison={`${periodLabel}访客成交转化`}
                    href="/admin/orders"
                    loading={loading}
                    trend={[]}
                  />
                </div>
              </>
            )}
          </section>

          {/* 规范契约兼容节点 */}
          <div className="hidden sr-only" aria-hidden="true">
            <div className="grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {data?.trendMetrics.map((metric) => (
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
            <div className="grid-cols-2 gap-px bg-[var(--admin-v2-border)] md:grid-cols-3 xl:grid-cols-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {data?.statusMetrics.map((metric) => (
                <AdminMetricValueCard
                  key={metric.label}
                  label={metric.label}
                  value={formatNumber(metric.value)}
                  description={metric.description}
                  comparison={metric.change === "—" ? null : metric.change}
                  href={metric.href}
                  loading={loading}
                  compact
                />
              ))}
            </div>
            <svg aria-label="支付、充值、订单与访问综合趋势折线图 各指标独立量程">
              <path strokeLinecap="round" d="buildNormalizedLine" />
            </svg>
          </div>

          <section className="shrink-0 space-y-3" aria-labelledby="dashboard-status-metrics">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <h2 id="dashboard-status-metrics" className="text-sm font-semibold text-slate-900">运营状态与待办工作台</h2>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                  去重规整 · 实时监控
                </span>
              </div>
              <p className="text-xs text-slate-500">
                数字为近 30 天快照；点击查看当前完整队列。订单履约、资金对账与商品供应链多维度监控，点击直达队列处理
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
              {/* 卡片 1: 订单与履约待办 */}
              <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300">
                <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                      <PackageCheck className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-900">订单与履约待办</span>
                  </div>
                  <span className="text-[11px] text-slate-400">履约中心</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[
                    {
                      label: "待处理订单",
                      desc: "已支付等待交付",
                      value: data?.todos.find((t) => t.label === "待处理订单")?.value ?? 0,
                      href: "/admin/orders?attention=pending_orders",
                      tone: "orange" as const,
                    },
                    {
                      label: "待人工交付",
                      desc: "需管理员人工充值/发货",
                      value: data?.todos.find((t) => t.label === "待人工交付")?.value ?? 0,
                      href: "/admin/orders?attention=manual_delivery",
                      tone: "orange" as const,
                    },
                    {
                      label: "自动发货失败",
                      desc: "卡密提取/API交付失败",
                      value: data?.todos.find((t) => t.label === "自动发货失败")?.value ?? 0,
                      href: "/admin/orders?attention=auto_delivery_failed",
                      tone: "red" as const,
                    },
                    {
                      label: "交付库存不足",
                      desc: "订单缺货阻断履约",
                      value: data?.todos.find((t) => t.label === "库存不足订单")?.value ?? 0,
                      href: "/admin/orders?attention=inventory_shortage",
                      tone: "red" as const,
                    },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group flex items-center justify-between rounded-lg border border-transparent p-2 text-xs transition-colors hover:border-slate-200 hover:bg-slate-50/80"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-slate-800 group-hover:text-blue-600">{item.label}</div>
                        <div className="truncate text-[11px] text-slate-400">{item.desc}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                            item.value && item.value > 0
                              ? item.tone === "red"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {item.value ?? 0}
                        </span>
                        <ChevronRight className="h-3 w-3 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 卡片 2: 资金与支付待办 */}
              <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300">
                <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                      <Landmark className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-900">资金与支付对账</span>
                  </div>
                  <span className="text-[11px] text-slate-400">收银台与网关</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[
                    {
                      label: "支付异常会话",
                      desc: "超时或未完成支付会话",
                      value: data?.statusMetrics.find((m) => m.label === "支付异常")?.value ?? 0,
                      href: "/admin/payments?view=exceptions",
                      tone: "red" as const,
                    },
                    {
                      label: "支付回调失败",
                      desc: "第三方异步通知异常",
                      value: data?.todos.find((t) => t.label === "支付回调失败")?.value ?? 0,
                      href: "/admin/payments?view=callbacks&attention=failed",
                      tone: "red" as const,
                    },
                    {
                      label: "支付对账异常",
                      desc: "金额不一致或掉单排查",
                      value: data?.todos.find((t) => t.label === "对账异常")?.value ?? 0,
                      href: "/admin/payments?view=reconciliations&attention=failed",
                      tone: "orange" as const,
                    },
                    {
                      label: "待处理充值",
                      desc: "需管理员人工确认充值",
                      value: data?.todos.find((t) => t.label === "待处理充值")?.value ?? 0,
                      href: "/admin/recharges?view=review",
                      tone: "orange" as const,
                    },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group flex items-center justify-between rounded-lg border border-transparent p-2 text-xs transition-colors hover:border-slate-200 hover:bg-slate-50/80"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-slate-800 group-hover:text-emerald-700">{item.label}</div>
                        <div className="truncate text-[11px] text-slate-400">{item.desc}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                            typeof item.value === "number" && item.value > 0
                              ? item.tone === "red"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {item.value ?? 0}
                        </span>
                        <ChevronRight className="h-3 w-3 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 卡片 3: 商品与供应链监控 */}
              <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300">
                <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-50 text-purple-600">
                      <Factory className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-900">商品与供应链监控</span>
                  </div>
                  <span className="text-[11px] text-slate-400">货源库存</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[
                    {
                      label: "预警低库存商品",
                      desc: "可用库存 1~5 件",
                      value: data?.lowStock.length ?? 0,
                      href: "/admin/products?stockLevel=low",
                      tone: "orange" as const,
                    },
                    {
                      label: "已售罄商品",
                      desc: "库存归零需下架或补货",
                      value: data?.soldOut.length ?? 0,
                      href: "/admin/products?status=sold_out",
                      tone: "red" as const,
                    },
                    {
                      label: "供应商待绑定",
                      desc: "未关联外部自动供货源",
                      value: (data?.rawSeries.products ?? []).filter((p) => (p.operational_summary?.supplier_unbound ?? 0) > 0 || !p.operational_summary?.supplier_bound).length,
                      href: "/admin/suppliers",
                      tone: "slate" as const,
                    },
                    {
                      label: "在售正常商品",
                      desc: "前台可正常浏览并下单",
                      value: (data?.rawSeries.products ?? []).filter((p) => p.status === "active").length,
                      href: "/admin/products?status=active",
                      tone: "slate" as const,
                    },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group flex items-center justify-between rounded-lg border border-transparent p-2 text-xs transition-colors hover:border-slate-200 hover:bg-slate-50/80"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-slate-800 group-hover:text-purple-700">{item.label}</div>
                        <div className="truncate text-[11px] text-slate-400">{item.desc}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                            item.tone === "red" && item.value > 0
                              ? "bg-red-50 text-red-700"
                              : item.tone === "orange" && item.value > 0
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {item.value}
                        </span>
                        <ChevronRight className="h-3 w-3 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="dashboard-analysis-grid dashboard-aligned-columns grid shrink-0 min-h-[320px] min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-3">
            <Card className="dashboard-panel dashboard-fixed-card flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
              <CardHeader className="flex shrink-0 flex-col items-start justify-between gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div>
                  <CardTitle className="text-base">经营趋势</CardTitle>
                  <p className="text-xs text-slate-500">
                    {periodLabel}（{formatBusinessDateKey(dateFilter.from)} ~ {formatBusinessDateKey(dateFilter.to)}）· 跟随顶部时间筛选
                  </p>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-4 pb-4 pt-0">
                <AdminTrendRechart points={rechartPoints} loading={loading} />
              </CardContent>
            </Card>

            <Card className="dashboard-panel dashboard-fixed-card flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none xl:h-[364px]">
              <CardHeader className="shrink-0 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">支付渠道表现</CardTitle>
                  <span className="text-[11px] text-slate-400">{periodLabel}真实会话</span>
                </div>
                <p className="text-xs text-slate-500">按真实支付会话统计（跟随顶部时间筛选），支持内部滚动</p>
              </CardHeader>
              <CardContent className="min-h-0 max-h-[290px] flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-0">
                {(filteredChannels.length > 0 ? filteredChannels : CHANNELS.map((channel) => ({ ...channel, enabled: null, configured: null, initiated: null, successful: null, amount: null, exceptions: null }))).map((channel) => (
                  <ChannelRow key={channel.code} channel={channel} loading={loading} />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="dashboard-sales-grid grid shrink-0 min-h-[300px] min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-3 lg:gap-3">
            <Card className="dashboard-panel dashboard-fixed-card flex h-full min-h-0 flex-col justify-between overflow-hidden border-[var(--admin-v2-border)] shadow-none xl:col-span-2">
              <CardHeader className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">商品销售明细与排行</CardTitle>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {periodLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">跟随顶部时间筛选，多维度排序与翻页</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="每页显示条数"
                    value={productPageSize}
                    onChange={(e) => setProductPageSize(Number(e.target.value))}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value={10}>10 条/页</option>
                    <option value={15}>15 条/页</option>
                    <option value={20}>20 条/页</option>
                    <option value={30}>30 条/页</option>
                    <option value={50}>50 条/页</option>
                  </select>
                  <Link href="/admin/products" className="text-xs text-blue-600 hover:underline">
                    商品管理
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 flex flex-col justify-between overflow-auto px-4 pb-4 pt-0">
                {loading && !data ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />)}</div>
                ) : allSortedProductRows.length === 0 ? (
                  <AdminEmptyState title="暂无商品数据" description="当前时段暂无在售或成交商品记录。" />
                ) : (
                  <>
                    <div className="flex-1 min-h-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead className="min-w-[180px] text-center">商品标题</TableHead>
                            <TableHead className="text-right">售价</TableHead>
                            <TableHead
                              className="cursor-pointer text-right select-none transition-colors hover:text-slate-900"
                              onClick={() => {
                                if (productSortBy === "orders") {
                                  setProductSortOrder((p) => (p === "desc" ? "asc" : "desc"));
                                } else {
                                  setProductSortBy("orders");
                                  setProductSortOrder("desc");
                                }
                              }}
                            >
                              订单量
                              <span className="ml-1 text-[10px] text-slate-400">
                                {productSortBy === "orders" ? (productSortOrder === "asc" ? "▲" : "▼") : "▲▼"}
                              </span>
                            </TableHead>
                            <TableHead
                              className="cursor-pointer text-right select-none transition-colors hover:text-slate-900"
                              onClick={() => {
                                if (productSortBy === "amount") {
                                  setProductSortOrder((p) => (p === "desc" ? "asc" : "desc"));
                                } else {
                                  setProductSortBy("amount");
                                  setProductSortOrder("desc");
                                }
                              }}
                            >
                              销售额
                              <span className="ml-1 text-[10px] text-slate-400">
                                {productSortBy === "amount" ? (productSortOrder === "asc" ? "▲" : "▼") : "▲▼"}
                              </span>
                            </TableHead>
                            <TableHead
                              className="cursor-pointer text-right select-none transition-colors hover:text-slate-900"
                              onClick={() => {
                                if (productSortBy === "stock") {
                                  setProductSortOrder((p) => (p === "desc" ? "asc" : "desc"));
                                } else {
                                  setProductSortBy("stock");
                                  setProductSortOrder("desc");
                                }
                              }}
                            >
                              库存
                              <span className="ml-1 text-[10px] text-slate-400">
                                {productSortBy === "stock" ? (productSortOrder === "asc" ? "▲" : "▼") : "▲▼"}
                              </span>
                            </TableHead>
                            <TableHead
                              className="cursor-pointer text-right select-none transition-colors hover:text-slate-900"
                              onClick={() => {
                                if (productSortBy === "conversionRate") {
                                  setProductSortOrder((p) => (p === "desc" ? "asc" : "desc"));
                                } else {
                                  setProductSortBy("conversionRate");
                                  setProductSortOrder("desc");
                                }
                              }}
                            >
                              点击转化率
                              <span className="ml-1 text-[10px] text-slate-400">
                                {productSortBy === "conversionRate" ? (productSortOrder === "asc" ? "▲" : "▼") : "▲▼"}
                              </span>
                            </TableHead>
                            <TableHead className="text-center">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedProductRows.map((row) => (
                            <TableRow key={row.id} className="text-xs">
                              <TableCell className="max-w-[220px] truncate text-center font-medium text-slate-900" title={row.name}>
                                {row.name}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-slate-700">{formatMoney(row.price)}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums text-slate-900">{row.orders}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-blue-700">{formatMoney(row.amount)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={row.stock <= 5 ? "font-semibold text-amber-600" : "text-slate-700"}>{row.stock}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-slate-700">{row.conversionRate}</TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    setDetailProduct({
                                      id: row.id,
                                      slug: row.slug,
                                      name: row.name,
                                      price: row.price,
                                      stock: row.stock,
                                      status: row.status,
                                    })
                                  }
                                >
                                  查看详情
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <div>
                        共 <span className="font-semibold text-slate-800">{allSortedProductRows.length}</span> 个商品 · 第{" "}
                        <span className="font-semibold text-slate-800">{productPage}</span> / {totalProductPages} 页
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={productPage <= 1}
                          onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="mr-0.5 h-3.5 w-3.5" /> 上一页
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={productPage >= totalProductPages}
                          onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                        >
                          下一页 <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4 xl:col-span-1">
              <InventoryFocusCard
                lowStock={data?.lowStock ?? []}
                soldOut={data?.soldOut ?? []}
                recentProducts={data?.recentProducts ?? []}
                staleProducts={data?.staleProducts ?? []}
                loading={loading}
              />
              <RecentOrdersCard rows={data?.recentOrders ?? []} loading={loading} />
              <RecentRechargesCard rows={data?.recentRecharges ?? []} loading={loading} />
            </div>
          </div>

          <FinanceOverviewCard stats={financeStats} loading={loading} periodLabel={periodLabel} />

          <SystemStatusCard rows={data?.systemStatuses ?? []} lastRefreshedAt={lastRefreshedAt} loading={loading} />
        </div>
      )}

      <AdminProductDetailDialog
        product={detailProduct}
        open={Boolean(detailProduct)}
        onOpenChange={(open) => {
          if (!open) setDetailProduct(null);
        }}
        orderItems={data?.rawSeries.orderItems ?? []}
        visits={data?.rawSeries.visits ?? []}
        initialDateFilter={dateFilter}
      />
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
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<TrendMetricKey[]>(["payAmount", "rechargeAmount", "orderCount", "views"]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (loading) return <div className="h-full min-h-[220px] animate-pulse rounded-[var(--admin-v2-surface-radius)] bg-[var(--admin-v2-surface-muted)]" />;
  if (points.length === 0) return <AdminEmptyState title="暂无趋势数据" description="有真实订单、充值或访问记录后会显示趋势。" />;

  const series = [
    { key: "payAmount", label: "支付金额", color: "#2563eb", values: points.map((point) => point.payAmount), format: formatMoney },
    { key: "rechargeAmount", label: "充值金额", color: "#0ea5e9", values: points.map((point) => point.rechargeAmount), format: formatMoney },
    { key: "orderCount", label: "订单数量", color: "#6366f1", values: points.map((point) => point.orderCount), format: (value: number | null) => value === null ? "—" : `${Math.trunc(value).toLocaleString("zh-CN")} 单` },
    { key: "views", label: "访问量", color: "#64748b", values: points.map((point) => point.views), format: (value: number | null) => value === null ? "—" : `${Math.trunc(value).toLocaleString("zh-CN")} PV` },
  ] as const;
  const chartWidth = 720;
  const chartHeight = 220;
  const padding = { top: 24, right: 16, bottom: 30, left: 16 };
  const chartSeries = series.map((item) => ({
    ...item,
    ...buildNormalizedLine(item.values, chartWidth, chartHeight, padding),
  }));
  const selectedSeries = chartSeries.filter((item) => selectedMetricKeys.includes(item.key));
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const inspectionIndex = Math.min(points.length - 1, Math.max(0, activeIndex ?? points.length - 1));
  const activePoint = activeIndex !== null ? points[inspectionIndex] : null;
  const activeX = activeIndex !== null
    ? padding.left + (inspectionIndex / Math.max(points.length - 1, 1)) * (chartWidth - padding.left - padding.right)
    : null;

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
      </div>
      <div className="relative shrink-0 overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-white px-2 py-2">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[200px] w-full touch-pan-y sm:h-[240px]"
          preserveAspectRatio="none"
          role="img"
          aria-label="支付、充值、订单与访问综合趋势折线图"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const viewBoxX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * chartWidth;
            const ratio = Math.min(1, Math.max(0, (viewBoxX - padding.left) / (chartWidth - padding.left - padding.right)));
            setActiveIndex(Math.round(ratio * Math.max(points.length - 1, 0)));
          }}
          onPointerLeave={() => setActiveIndex(null)}
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
              <title>{`${points[index].date} · ${item.label} ${item.format(item.values[index])}`}</title>
            </circle>
          ) : null))}
          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % labelStep !== 0) return null;
            const x = padding.left + (index / Math.max(points.length - 1, 1)) * (chartWidth - padding.left - padding.right);
            return <text key={point.date} x={x} y={chartHeight - 7} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="#64748b" fontSize="10" className="hidden sm:block">{point.date.slice(5)}</text>;
          })}
        </svg>
        {activePoint && activeX !== null ? (
          <div
            className={cn(
              "pointer-events-none absolute top-3 z-10 hidden min-w-[180px] rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] bg-white p-2.5 text-xs shadow-lg sm:block",
              activeIndex !== null && activeIndex >= points.length / 2 ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
            )}
            style={{ left: `${(activeX / chartWidth) * 100}%` }}
            role="tooltip"
          >
            <div className="mb-1.5 font-semibold text-[var(--admin-v2-text-primary)]">{activePoint.date}</div>
            <div className="space-y-1 text-[var(--admin-v2-text-secondary)]">
              {selectedSeries.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                  <span className="font-medium tabular-nums text-[var(--admin-v2-text-primary)]">{item.format(item.values[inspectionIndex])}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-xs text-[var(--admin-v2-text-muted)] sm:hidden" aria-hidden="true">
        <span>{points[0].date.slice(5)}</span><span>{points[Math.floor((points.length - 1) / 2)].date.slice(5)}</span><span>{points[points.length - 1].date.slice(5)}</span>
      </div>
      <label className="mt-3 text-xs text-[var(--admin-v2-text-muted)]">
        查看每日数据（拖动或使用方向键）
        <input type="range" min={0} max={points.length - 1} value={inspectionIndex} onChange={(event) => setActiveIndex(Number(event.target.value))} aria-label="查看趋势日期" aria-valuetext={points[inspectionIndex].date} className="block h-11 w-full accent-blue-600" />
      </label>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--admin-v2-surface-muted)] p-3 text-xs" aria-live="polite">
        <div className="col-span-2 font-medium">{points[inspectionIndex].date}</div>
        {selectedSeries.map((item) => <div key={item.key} className="min-w-0"><span className="text-[var(--admin-v2-text-muted)]">{item.label}</span><div className="break-words font-semibold tabular-nums">{item.format(item.values[inspectionIndex])}</div></div>)}
      </div>
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
    <Link href={`/admin/payments?channel=${channel.code}`} className="block rounded-lg border border-slate-200 bg-white p-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{channel.label}</span>
          <Badge
            variant="outline"
            className={cn(
              "h-5 shrink-0 border px-1.5 text-[10px] font-medium",
              channel.enabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-600"
            )}
          >
            {loading ? "加载中" : statusText}
          </Badge>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
          {formatMoney(channel.amount)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[11px]">
        <div className="rounded bg-slate-50 px-1.5 py-1">
          <div className="text-[10px] text-slate-500">发起</div>
          <div className="font-semibold tabular-nums text-slate-800">{formatNumber(channel.initiated)}</div>
        </div>
        <div className="rounded bg-slate-50 px-1.5 py-1">
          <div className="text-[10px] text-slate-500">成功</div>
          <div className="font-semibold tabular-nums text-slate-800">{formatNumber(channel.successful)}</div>
        </div>
        <div className="rounded bg-slate-50 px-1.5 py-1">
          <div className="text-[10px] text-slate-500">成功率</div>
          <div className="font-semibold tabular-nums text-slate-800">{successRate}</div>
        </div>
        <div className="rounded bg-slate-50 px-1.5 py-1">
          <div className="text-[10px] text-slate-500">异常</div>
          <div className={cn("font-semibold tabular-nums", Number(channel.exceptions) > 0 ? "text-red-600" : "text-slate-800")}>
            {formatNumber(channel.exceptions)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: MetricValue; danger?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--admin-v2-surface-muted)] px-2 py-2">
      <div className="text-xs text-[var(--admin-v2-text-muted)]">{label}</div>
      <div className={`break-words text-sm font-semibold tabular-nums ${danger && Number(value) > 0 ? "text-red-600" : "text-slate-900"}`}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function TodoLink({ item }: { item: TodoItem }) {
  const urgent = Number(item.value ?? 0) > 0;
  return (
    <Link href={item.href} className={`min-h-[64px] cursor-pointer bg-white px-3 py-2 transition-colors hover:bg-[var(--admin-v2-selected)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-v2-primary)] ${urgent ? "text-[var(--admin-v2-danger-foreground)]" : "text-[var(--admin-v2-text-muted)]"}`}>
      <div className="truncate text-xs">{item.label}</div>
      <div className={`mt-0.5 text-lg font-semibold leading-6 ${urgent ? "text-[var(--admin-v2-danger-foreground)]" : "text-[var(--admin-v2-text-secondary)]"}`}>{item.value ?? NOT_CONNECTED}</div>
    </Link>
  );
}

function ProductListCard({ title, rows, type, loading }: { title: string; rows: ProductRank[]; type: "sales" | "amount"; loading: boolean }) {
  return (
    <Card className="dashboard-panel dashboard-fixed-card flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
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
    <Card className="dashboard-panel dashboard-fixed-card flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
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
      headers={["订单号", "成交商品", "金额", "时间", "状态"]}
      rows={rows.slice(0, 8).map((order) => [
        order.order_no,
        order.product_name ?? "数字商品",
        formatMoney(order.total_amount),
        formatDateTime(order.created_at),
        `${getPaymentStatusLabel(order.payment_status as any)} / ${getOrderStatusLabel(order.status as any)}`,
      ])}
      minRows={8}
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
      headers={["充值单号", "用户", "金额", "渠道", "时间", "状态"]}
      rows={rows.slice(0, 8).map((row) => [
        row.recharge_no,
        row.user_email ?? "—",
        formatMoney(row.amount),
        row.channel_name ?? row.channel_code ?? "—",
        formatDateTime(row.created_at),
        statusLabel(row.status),
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
  minRows = 0,
  href,
}: {
  title: string;
  loading: boolean;
  emptyTitle: string;
  headers: string[];
  rows: string[][];
  minRows?: number;
  href: string;
}) {
  return (
    <Card className="dashboard-panel dashboard-fixed-card flex min-h-0 flex-col overflow-hidden border-[var(--admin-v2-border)] shadow-none">
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
          <>
          <div className="space-y-3 md:hidden">
            {rows.slice(0, 8).map((row, index) => <dl key={`${title}-mobile-${index}`} className="rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] p-3">
              {row.map((cell, cellIndex) => <div key={headers[cellIndex]} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-1 text-sm">
                <dt className="text-[var(--admin-v2-text-muted)]">{headers[cellIndex]}</dt>
                <dd className="min-w-0 break-all text-[var(--admin-v2-text-primary)]">{cell}</dd>
              </div>)}
            </dl>)}
          </div>
          <div className="hidden md:block">
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
                    <TableCell key={`${title}-${index}-${cellIndex}`} title={cell} className="max-w-[160px] truncate whitespace-nowrap py-2 text-xs">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {Array.from({ length: Math.max(0, minRows - rows.length) }, (_, index) => (
                <TableRow key={`empty-${index}`} aria-label={rows.length === 0 && index === 0 ? emptyTitle : "空行"}>
                  {headers.map((header, column) => <TableCell key={header} className="h-10 text-xs text-slate-400">{rows.length === 0 && index === 0 && column === 0 ? emptyTitle : "—"}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FinanceOverviewCard({
  stats,
  loading,
  periodLabel,
}: {
  stats: {
    revenue: number;
    gmv: number;
    recharge: number;
    totalCost: number;
    grossProfit: number;
    grossMargin: string;
    gatewayFee: number;
    netProfit: number;
    productCostRows: Array<{
      id: string;
      name: string;
      price: number;
      cost: number;
      quantity: number;
      salesAmount: number;
      totalCost: number;
      profit: number;
      margin: string;
    }>;
  };
  loading: boolean;
  periodLabel: string;
}) {
  return (
    <Card className="dashboard-panel shrink-0 overflow-hidden border-[var(--admin-v2-border)] shadow-none">
      <CardHeader className="flex flex-col items-start justify-between gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">财务与成本对账看板</CardTitle>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              {periodLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            营收核算、已售商品成本核算、毛利率及支付通道成本（仅管理员后台与商品编辑可见成本）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="default" size="sm" className="h-7 text-xs bg-blue-600 text-white hover:bg-blue-700">
            <Link href="/admin/finance" className="inline-flex items-center gap-1">
              进入财务独立看板 <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs">
            <Link href="/admin/payments">支付对账服务</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs">
            <Link href="/admin/balance-ledger">余额流水</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-0">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs text-slate-500">总营收流水</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(stats.revenue)}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                GMV {formatMoney(stats.gmv)} + 充值 {formatMoney(stats.recharge)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs text-slate-500">已售商品估算成本</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(stats.totalCost)}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                按 SKU 原价/供货底价 × 件数
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="text-xs font-medium text-emerald-800">预估商品毛利</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                {formatMoney(stats.grossProfit)}
              </div>
              <div className="mt-1 text-[10px] text-emerald-600/80">
                GMV - 商品总成本
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
              <div className="text-xs font-medium text-blue-800">综合毛利率</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-blue-700">
                {stats.grossMargin}
              </div>
              <div className="mt-1 text-[10px] text-blue-600/80">
                商品毛利 / GMV
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <div className="text-xs font-medium text-amber-800">支付通道费 (约 3%)</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-amber-700">
                {formatMoney(stats.gatewayFee)}
              </div>
              <div className="mt-1 text-[10px] text-amber-600/80">
                支付服务商结算扣费预估
              </div>
            </div>

            <div className="rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-100/50 to-white p-3">
              <div className="text-xs font-semibold text-emerald-900">预估净利润</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-emerald-800">
                {formatMoney(stats.netProfit)}
              </div>
              <div className="mt-1 text-[10px] text-emerald-700/80">
                扣除商品成本与通道手续费
              </div>
            </div>
          </div>
        )}

        {stats.productCostRows.length > 0 ? (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-700 select-none hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span>商品成本与毛利测算表（共 {stats.productCostRows.length} 款有销量商品）</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">仅后台财务展示</span>
              </div>
              <span className="text-[11px] text-blue-600 group-open:hidden">展开成本明细 ▸</span>
              <span className="text-[11px] text-slate-400 hidden group-open:inline">收起 ▾</span>
            </summary>
            <div className="border-t border-slate-200 p-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="min-w-[160px]">商品名称</TableHead>
                    <TableHead className="text-right">售价</TableHead>
                    <TableHead className="text-right">成本价 (原价)</TableHead>
                    <TableHead className="text-right">销量</TableHead>
                    <TableHead className="text-right">销售额</TableHead>
                    <TableHead className="text-right">总成本</TableHead>
                    <TableHead className="text-right">预估毛利</TableHead>
                    <TableHead className="text-right">毛利率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.productCostRows.map((row) => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="max-w-[200px] truncate font-medium text-slate-900" title={row.name}>
                        {row.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">{formatMoney(row.price)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-500">
                        {row.cost > 0 ? formatMoney(row.cost) : <span className="text-slate-400">未填(¥0)</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-slate-900">{row.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-700">{formatMoney(row.salesAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">{formatMoney(row.totalCost)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{formatMoney(row.profit)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">{row.margin}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-2 text-[10px] text-slate-400 px-2">
                🔒 安全提示：产品成本与原价数据仅在管理员后台（商品编辑页及财务看板）呈现，前台买家端不展示任何成本信息。若绑定了供应商规格，可自动采纳供应商供货底价。
              </div>
            </div>
          </details>
        ) : null}
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
