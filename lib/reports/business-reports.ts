import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatDateTime,
  getBusinessDateKey,
  normalizeDateRange,
} from "@/lib/i18n/datetime";
import { formatAmountWithCurrency, normalizeAmount } from "@/lib/i18n/money";

export type ReportRange = { start: string; end: string };
export type ReportErrorMap = Record<string, string>;

type Row = Record<string, any>;

export const REPORT_METRICS = {
  totalOrders: "订单总数：按订单 created_at 落在筛选时间内统计。",
  paidOrders: "已支付订单数：payment_status=paid 或订单状态已进入 paid/processing/delivered/completed。",
  cancelledOrders: "已取消订单数：status=cancelled。",
  closedOrders: "已关闭订单数：status in cancelled/failed/refunded。",
  salesAmount: "销售金额：有效已支付商品订单 total_amount 汇总，不包含充值。",
  paidAmount: "实付金额：成功订单支付记录 received_amount/payable_amount 汇总。",
  rechargeAmount: "充值金额：成功 account_recharges credited_amount/requested_amount 汇总。",
  refundAmount: "退款金额：refund_requests status=succeeded 的 approved_amount 汇总。",
  balancePaymentAmount: "余额支付金额：订单支付渠道为 balance 的成功金额。",
  externalPaymentAmount: "外部渠道支付金额：非 balance 渠道成功金额。",
  paymentSuccessRate: "支付成功率：成功支付会话数 / 支付会话总数。",
  autoDeliverySuccessRate: "自动交付成功率：自动交付成功数 / 自动交付总数。",
  manualDeliveryCount: "人工交付数量：delivery_type=manual 的交付记录数。",
  newUsers: "新增用户：profiles.created_at 落在筛选时间内。",
  payingUsers: "付费用户：筛选期内至少有一笔成功商品订单的用户。",
  repeatUsers: "复购用户：累计成功商品订单数 >= 2 的用户。",
  visitors: "访客数：尚未接入访问统计时显示未接入。",
  pageViews: "访问量：尚未接入访问统计时显示未接入。",
} as const;

const PAID_ORDER_STATUSES = new Set(["paid", "processing", "delivered", "completed"]);
const CLOSED_ORDER_STATUSES = new Set(["cancelled", "failed", "refunded"]);
const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "succeeded", "success", "completed"]);
const FAILED_PAYMENT_STATUSES = new Set(["failed", "expired", "closed", "cancelled"]);
const ACTIVE_REFUND_STATUSES = new Set(["requested", "reviewing", "approved", "processing"]);

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function currencyValue(value: unknown) {
  const currency = String(value ?? "CNY").trim().toUpperCase();
  return currency || "CNY";
}

function inRange(value: unknown, range: ReportRange) {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) && time >= new Date(range.start).getTime() && time <= new Date(range.end).getTime();
}

function formatDateKey(value: unknown) {
  return getBusinessDateKey(value);
}

function addAmount(map: Record<string, number>, key: string, amount: number) {
  map[key] = (map[key] ?? 0) + amount;
}

async function safeSelect<T = Row[]>(label: string, promise: PromiseLike<{ data: any; error: any }>, errors: ReportErrorMap): Promise<T> {
  try {
    const { data, error } = await promise;
    if (error) throw error;
    return (data ?? []) as T;
  } catch (error) {
    errors[label] = normalizeReportError(error, `${label}读取失败`);
    return [] as T;
  }
}

export function normalizeReportError(error: unknown, fallback = "报表数据读取失败") {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  if (/schema cache|PGRST205|42P01|42703|Could not find/i.test(message)) return `${fallback}：相关数据表或字段尚未初始化`;
  return fallback;
}

export function normalizeReportRange(start?: string | null, end?: string | null): ReportRange {
  return normalizeDateRange(start, end);
}

export async function loadBusinessReport(supabase: SupabaseClient, range: ReportRange) {
  const errors: ReportErrorMap = {};
  const [orders, payments, recharges, refunds, profiles, products, skus, inventory, deliveries, balanceTransactions] = await Promise.all([
    safeSelect<Row[]>("订单", supabase.from("orders").select("id,order_no,user_id,status,payment_status,payment_method,total_amount,subtotal,currency,created_at,paid_at,delivery_type,customer_email,order_items(id,product_id,sku_id,sku_title,product_name,quantity,unit_price,line_total,delivery_status,delivery_type,created_at)").gte("created_at", range.start).lte("created_at", range.end).limit(5000), errors),
    safeSelect<Row[]>("支付", supabase.from("order_payments").select("id,order_id,user_id,payment_no,channel,network,payment_method,status,amount,business_amount,payable_amount,received_amount,fee_amount,currency,created_at,paid_at,orders(order_no,customer_email)").gte("created_at", range.start).lte("created_at", range.end).limit(5000), errors),
    safeSelect<Row[]>("充值", supabase.from("account_recharges").select("id,recharge_no,user_id,user_email,channel,channel_code,network,status,amount,requested_amount,credited_amount,fee_amount,currency,created_at,paid_at").gte("created_at", range.start).lte("created_at", range.end).limit(5000), errors),
    safeSelect<Row[]>("退款", supabase.from("refund_requests").select("id,refund_no,order_id,user_id,status,refund_method,approved_amount,requested_amount,currency,created_at,completed_at,orders(order_no)").gte("created_at", range.start).lte("created_at", range.end).limit(5000), errors),
    safeSelect<Row[]>("用户", supabase.from("profiles").select("id,email,role,balance,account_status,risk_status,created_at,last_login_at").limit(10000), errors),
    safeSelect<Row[]>("商品", supabase.from("products").select("id,name,slug,status,price,stock,delivery_type,created_at,updated_at").limit(10000), errors),
    safeSelect<Row[]>("SKU", supabase.from("product_skus").select("id,product_id,title,sku_code,price,stock,status,created_at,updated_at").limit(10000), errors),
    safeSelect<Row[]>("数字库存", supabase.from("digital_inventory").select("id,product_id,sku_id,batch_no,status,created_at,updated_at,delivered_at,reserved_at").limit(10000), errors),
    safeSelect<Row[]>("交付", supabase.from("order_deliveries").select("id,order_id,order_item_id,user_id,product_id,sku_id,delivery_type,delivery_status,created_at,delivered_at,updated_at").gte("created_at", range.start).lte("created_at", range.end).limit(5000), errors),
    safeSelect<Row[]>("余额流水", supabase.from("balance_transactions").select("id,user_id,business_type,direction,amount,status,balance_before,balance_after,currency,created_at").gte("created_at", range.start).lte("created_at", range.end).limit(5000), errors),
  ]);

  const paidOrders = orders.filter((order) => order.payment_status === "paid" || PAID_ORDER_STATUSES.has(String(order.status ?? "")));
  const cancelledOrders = orders.filter((order) => order.status === "cancelled");
  const closedOrders = orders.filter((order) => CLOSED_ORDER_STATUSES.has(String(order.status ?? "")));
  const successfulPayments = payments.filter((payment) => SUCCESS_PAYMENT_STATUSES.has(String(payment.status ?? "")));
  const successfulRecharges = recharges.filter((recharge) => SUCCESS_PAYMENT_STATUSES.has(String(recharge.status ?? "")));
  const succeededRefunds = refunds.filter((refund) => refund.status === "succeeded");
  const pendingRefunds = refunds.filter((refund) => ACTIVE_REFUND_STATUSES.has(String(refund.status ?? "")));
  const paidUserIds = new Set(paidOrders.map((order) => String(order.user_id ?? "")).filter(Boolean));
  const successfulOrdersByUser = new Map<string, number>();
  paidOrders.forEach((order) => successfulOrdersByUser.set(String(order.user_id), (successfulOrdersByUser.get(String(order.user_id)) ?? 0) + 1));

  const orderTrend: Record<string, { date: string; orders: number; paidOrders: number; amount: number }> = {};
  orders.forEach((order) => {
    const key = formatDateKey(order.created_at);
    orderTrend[key] ??= { date: key, orders: 0, paidOrders: 0, amount: 0 };
    orderTrend[key].orders += 1;
    if (paidOrders.includes(order)) {
      orderTrend[key].paidOrders += 1;
      orderTrend[key].amount += numberValue(order.total_amount);
    }
  });

  const orderStatusDistribution: Record<string, number> = {};
  const paymentStatusDistribution: Record<string, number> = {};
  const paymentChannelDistribution: Record<string, { channel: string; count: number; amount: number }> = {};
  const amountBuckets = { "0-50": 0, "50-100": 0, "100-300": 0, "300-1000": 0, "1000+": 0 };

  orders.forEach((order) => {
    orderStatusDistribution[String(order.status ?? "unknown")] = (orderStatusDistribution[String(order.status ?? "unknown")] ?? 0) + 1;
    paymentStatusDistribution[String(order.payment_status ?? "unknown")] = (paymentStatusDistribution[String(order.payment_status ?? "unknown")] ?? 0) + 1;
    const amount = numberValue(order.total_amount);
    if (amount < 50) amountBuckets["0-50"] += 1;
    else if (amount < 100) amountBuckets["50-100"] += 1;
    else if (amount < 300) amountBuckets["100-300"] += 1;
    else if (amount < 1000) amountBuckets["300-1000"] += 1;
    else amountBuckets["1000+"] += 1;
  });

  successfulPayments.forEach((payment) => {
    const channel = String(payment.channel ?? payment.payment_method ?? "未配置");
    paymentChannelDistribution[channel] ??= { channel, count: 0, amount: 0 };
    paymentChannelDistribution[channel].count += 1;
    paymentChannelDistribution[channel].amount += numberValue(payment.received_amount ?? payment.payable_amount ?? payment.amount);
  });

  const productStats = new Map<string, { productId: string; name: string; quantity: number; amount: number; refunds: number }>();
  const skuStats = new Map<string, { skuId: string; name: string; productName: string; quantity: number; amount: number; stock: number }>();
  paidOrders.forEach((order) => {
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    items.forEach((item: Row) => {
      const productId = String(item.product_id ?? "snapshot");
      const product = productStats.get(productId) ?? { productId, name: textValue(item.product_name) || "未知商品", quantity: 0, amount: 0, refunds: 0 };
      product.quantity += numberValue(item.quantity);
      product.amount += numberValue(item.line_total);
      productStats.set(productId, product);
      if (item.sku_id) {
        const skuId = String(item.sku_id);
        const sku = skuStats.get(skuId) ?? { skuId, name: textValue(item.sku_title) || "未命名 SKU", productName: product.name, quantity: 0, amount: 0, stock: 0 };
        sku.quantity += numberValue(item.quantity);
        sku.amount += numberValue(item.line_total);
        skuStats.set(skuId, sku);
      }
    });
  });
  skus.forEach((sku) => {
    if (skuStats.has(String(sku.id))) skuStats.get(String(sku.id))!.stock = numberValue(sku.stock);
  });

  const inventoryByStatus: Record<string, number> = {};
  inventory.forEach((item) => {
    const status = String(item.status ?? "unknown");
    inventoryByStatus[status] = (inventoryByStatus[status] ?? 0) + 1;
  });

  const autoDeliveries = deliveries.filter((item) => ["automatic", "auto", "card", "account"].includes(String(item.delivery_type ?? "")));
  const successfulAutoDeliveries = autoDeliveries.filter((item) => item.delivery_status === "delivered");
  const failedAutoDeliveries = autoDeliveries.filter((item) => item.delivery_status === "failed");
  const manualDeliveries = deliveries.filter((item) => item.delivery_type === "manual");
  const deliveryDurations = deliveries
    .filter((item) => item.delivered_at && item.created_at)
    .map((item) => new Date(item.delivered_at).getTime() - new Date(item.created_at).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);

  const balanceCredit = balanceTransactions.filter((row) => row.direction === "credit" && row.status === "completed").reduce((sum, row) => sum + numberValue(row.amount), 0);
  const balanceDebit = balanceTransactions.filter((row) => row.direction === "debit" && row.status === "completed").reduce((sum, row) => sum + numberValue(row.amount), 0);
  const balanceRefund = balanceTransactions.filter((row) => row.direction === "credit" && row.status === "completed" && String(row.business_type ?? "").includes("refund")).reduce((sum, row) => sum + numberValue(row.amount), 0);
  const adminAdjustment = balanceTransactions.filter((row) => String(row.business_type ?? "").includes("adjust")).reduce((sum, row) => sum + numberValue(row.amount), 0);

  const summary = {
    salesAmount: paidOrders.reduce((sum, order) => sum + numberValue(order.total_amount), 0),
    paidAmount: successfulPayments.reduce((sum, payment) => sum + numberValue(payment.received_amount ?? payment.payable_amount ?? payment.amount), 0),
    totalOrders: orders.length,
    paidOrders: paidOrders.length,
    cancelledOrders: cancelledOrders.length,
    closedOrders: closedOrders.length,
    paymentSuccessRate: payments.length ? successfulPayments.length / payments.length : null,
    refundAmount: succeededRefunds.reduce((sum, refund) => sum + numberValue(refund.approved_amount ?? refund.requested_amount), 0),
    rechargeAmount: successfulRecharges.reduce((sum, recharge) => sum + numberValue(recharge.credited_amount ?? recharge.requested_amount ?? recharge.amount), 0),
    balancePaymentAmount: successfulPayments.filter((payment) => ["balance", "balance_pay"].includes(String(payment.channel ?? payment.payment_method ?? ""))).reduce((sum, payment) => sum + numberValue(payment.received_amount ?? payment.payable_amount ?? payment.amount), 0),
    externalPaymentAmount: successfulPayments.filter((payment) => !["balance", "balance_pay"].includes(String(payment.channel ?? payment.payment_method ?? ""))).reduce((sum, payment) => sum + numberValue(payment.received_amount ?? payment.payable_amount ?? payment.amount), 0),
    newUsers: profiles.filter((profile) => inRange(profile.created_at, range)).length,
    payingUsers: paidUserIds.size,
    repeatUsers: Array.from(successfulOrdersByUser.values()).filter((count) => count >= 2).length,
    visitors: null as number | null,
    pageViews: null as number | null,
    autoDeliverySuccessRate: autoDeliveries.length ? successfulAutoDeliveries.length / autoDeliveries.length : null,
    manualDeliveryCount: manualDeliveries.length,
  };

  return {
    range,
    generatedAt: new Date().toISOString(),
    metrics: REPORT_METRICS,
    summary,
    orderPayment: {
      orderTrend: Object.values(orderTrend).sort((a, b) => a.date.localeCompare(b.date)),
      orderStatusDistribution,
      paymentStatusDistribution,
      paymentChannelDistribution: Object.values(paymentChannelDistribution),
      amountBuckets,
      pendingPaymentConversion: orders.length ? paidOrders.length / orders.length : null,
      failedOrClosedPayments: payments.filter((payment) => FAILED_PAYMENT_STATUSES.has(String(payment.status ?? ""))).length,
    },
    products: {
      salesRanking: Array.from(productStats.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      revenueRanking: Array.from(productStats.values()).sort((a, b) => b.amount - a.amount).slice(0, 10),
      refundRanking: Array.from(productStats.values()).sort((a, b) => b.refunds - a.refunds).slice(0, 10),
      lowStockProducts: products.filter((product) => numberValue(product.stock) > 0 && numberValue(product.stock) <= 5).slice(0, 20),
      soldOutProducts: products.filter((product) => numberValue(product.stock) <= 0 || product.status === "sold_out").slice(0, 20),
      recentProducts: products.filter((product) => inRange(product.created_at, range)).slice(0, 20),
      skuSalesRanking: Array.from(skuStats.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      skuRevenueRanking: Array.from(skuStats.values()).sort((a, b) => b.amount - a.amount).slice(0, 10),
      skuStockRanking: skus.map((sku) => ({ skuId: String(sku.id), name: textValue(sku.title ?? sku.sku_code), stock: numberValue(sku.stock), status: textValue(sku.status) })).sort((a, b) => a.stock - b.stock).slice(0, 20),
    },
    users: {
      totalUsers: profiles.length,
      newUsers: summary.newUsers,
      payingUsers: summary.payingUsers,
      unpaidUsers: Math.max(profiles.length - summary.payingUsers, 0),
      repeatUsers: summary.repeatUsers,
      restrictedUsers: profiles.filter((profile) => ["restricted", "suspended", "disabled"].includes(String(profile.account_status ?? "active"))).length,
      highRiskUsers: profiles.filter((profile) => ["high_risk", "blocked"].includes(String(profile.risk_status ?? "normal"))).length,
      firstPurchaseUsers: summary.payingUsers,
      repeatRate: summary.payingUsers ? summary.repeatUsers / summary.payingUsers : null,
    },
    inventory: {
      total: inventory.length,
      byStatus: inventoryByStatus,
      available: inventoryByStatus.available ?? 0,
      reserved: inventoryByStatus.reserved ?? 0,
      delivered: inventoryByStatus.delivered ?? 0,
      disabled: inventoryByStatus.disabled ?? 0,
      batchCount: new Set(inventory.map((item) => item.batch_no).filter(Boolean)).size,
      failedDeliveries: failedAutoDeliveries.length,
      partialDeliveries: deliveries.filter((item) => item.delivery_status === "partial").length,
      pendingManual: deliveries.filter((item) => item.delivery_type === "manual" && item.delivery_status !== "delivered").length,
      averageDeliveryMinutes: deliveryDurations.length ? deliveryDurations.reduce((sum, value) => sum + value, 0) / deliveryDurations.length / 60000 : null,
    },
    finance: {
      rechargeRequested: recharges.reduce((sum, row) => sum + numberValue(row.requested_amount ?? row.amount), 0),
      rechargeSucceeded: summary.rechargeAmount,
      rechargeFailed: recharges.filter((row) => ["failed", "expired", "closed"].includes(String(row.status ?? ""))).reduce((sum, row) => sum + numberValue(row.requested_amount ?? row.amount), 0),
      balanceCredit,
      balanceDebit,
      balanceRefund,
      externalRefund: succeededRefunds.filter((row) => row.refund_method !== "balance").reduce((sum, row) => sum + numberValue(row.approved_amount ?? row.requested_amount), 0),
      pendingRefund: pendingRefunds.reduce((sum, row) => sum + numberValue(row.approved_amount ?? row.requested_amount), 0),
      succeededRefund: summary.refundAmount,
      adminAdjustment,
    },
    raw: { orders, payments, recharges, refunds, profiles, products, skus, inventory, deliveries, balanceTransactions },
    errors,
  };
}

function csvSafe(value: unknown) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvDate(value: unknown) {
  return value ? formatDateTime(value) : "";
}

function csvAmount(value: unknown, currency: unknown) {
  const normalized = normalizeAmount(value, currencyValue(currency));
  return normalized === null ? "" : formatAmountWithCurrency(normalized, currencyValue(currency));
}

export function buildCsv(type: string, report: Awaited<ReturnType<typeof loadBusinessReport>>) {
  const rows: unknown[][] = [];
  if (type === "orders") {
    rows.push(["订单号", "用户邮箱", "订单状态", "支付状态", "订单金额", "币种", "创建时间（Asia/Shanghai）"]);
    report.raw.orders.forEach((row) => rows.push([row.order_no, row.customer_email, row.status, row.payment_status, csvAmount(row.total_amount, row.currency), currencyValue(row.currency), csvDate(row.created_at)]));
  } else if (type === "payments") {
    rows.push(["支付单号", "业务单号", "渠道", "状态", "应付金额", "实收金额", "币种", "支付时间（Asia/Shanghai）"]);
    report.raw.payments.forEach((row) => rows.push([row.payment_no, row.orders?.order_no, row.channel ?? row.payment_method, row.status, csvAmount(row.payable_amount ?? row.amount, row.currency), csvAmount(row.received_amount, row.currency), currencyValue(row.currency), csvDate(row.paid_at)]));
  } else if (type === "recharges") {
    rows.push(["充值单号", "用户", "渠道", "状态", "申请金额", "入账金额", "币种", "创建时间（Asia/Shanghai）"]);
    report.raw.recharges.forEach((row) => rows.push([row.recharge_no, row.user_email, row.channel_code ?? row.channel, row.status, csvAmount(row.requested_amount ?? row.amount, row.currency), csvAmount(row.credited_amount, row.currency), currencyValue(row.currency), csvDate(row.created_at)]));
  } else if (type === "refunds") {
    rows.push(["退款单号", "订单号", "状态", "退款方式", "申请金额", "批准金额", "币种", "完成时间（Asia/Shanghai）"]);
    report.raw.refunds.forEach((row) => rows.push([row.refund_no, row.orders?.order_no, row.status, row.refund_method, csvAmount(row.requested_amount, row.currency), csvAmount(row.approved_amount, row.currency), currencyValue(row.currency), csvDate(row.completed_at)]));
  } else if (type === "users") {
    rows.push(["用户ID", "邮箱", "角色", "余额", "币种", "账户状态", "风险状态", "注册时间（Asia/Shanghai）"]);
    report.raw.profiles.forEach((row) => rows.push([row.id, row.email, row.role, csvAmount(row.balance, "CNY"), "CNY", row.account_status ?? "active", row.risk_status ?? "normal", csvDate(row.created_at)]));
  } else if (type === "product-sales") {
    rows.push(["商品ID", "商品名称", "销量", "销售额"]);
    report.products.salesRanking.forEach((row) => rows.push([row.productId, row.name, row.quantity, row.amount.toFixed(2)]));
  } else if (type === "sku-sales") {
    rows.push(["SKU ID", "SKU 名称", "商品", "销量", "销售额", "库存"]);
    report.products.skuSalesRanking.forEach((row) => rows.push([row.skuId, row.name, row.productName, row.quantity, row.amount.toFixed(2), row.stock]));
  } else if (type === "inventory") {
    rows.push(["库存ID", "商品ID", "SKU ID", "批次", "状态", "创建时间"]);
    report.raw.inventory.forEach((row) => rows.push([row.id, row.product_id, row.sku_id, row.batch_no, row.status, csvDate(row.created_at)]));
  } else if (type === "deliveries") {
    rows.push(["交付ID", "订单ID", "用户ID", "商品ID", "SKU ID", "交付方式", "交付状态", "交付时间"]);
    report.raw.deliveries.forEach((row) => rows.push([row.id, row.order_id, row.user_id, row.product_id, row.sku_id, row.delivery_type, row.delivery_status, csvDate(row.delivered_at)]));
  } else if (type === "balance") {
    rows.push(["流水ID", "用户ID", "业务类型", "方向", "金额", "币种", "状态", "创建时间（Asia/Shanghai）"]);
    report.raw.balanceTransactions.forEach((row) => rows.push([row.id, row.user_id, row.business_type, row.direction, csvAmount(row.amount, row.currency), currencyValue(row.currency), row.status, csvDate(row.created_at)]));
  } else {
    throw new Error("不支持的导出类型。");
  }
  return "\uFEFF" + rows.map((row) => row.map(csvSafe).join(",")).join("\r\n");
}

export function exportFileName(type: string, range: ReportRange) {
  const start = range.start.slice(0, 10).replace(/-/g, "");
  const end = range.end.slice(0, 10).replace(/-/g, "");
  return `jianlian-${type}-${start}-${end}.csv`;
}
