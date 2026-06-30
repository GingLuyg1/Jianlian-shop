import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type ReadinessStatus = "pass" | "warning" | "blocked";
type ScanRisk = "low" | "medium" | "high";

type TestDataScanRule = {
  table: string;
  label: string;
  fields: string[];
  sensitive?: boolean;
  note: string;
};

export type TestDataScanSummary = {
  table: string;
  label: string;
  totalCount: number | null;
  suspectedCount: number | null;
  rule: string;
  relatedCount: number | null;
  risk: ScanRisk;
  recommendation: string;
  error?: string | null;
};

export type ProductionReadinessItem = {
  key: string;
  label: string;
  status: ReadinessStatus;
  summary: string;
  action: string;
};

const TEST_DATA_KEYWORDS = [
  "test",
  "demo",
  "mock",
  "sandbox",
  "example",
  "sample",
  "dev",
  "local",
  "localhost",
  "fake",
  "placeholder",
];

const TEST_DATA_SCAN_RULES: TestDataScanRule[] = [
  { table: "profiles", label: "测试用户", fields: ["email", "display_name", "full_name"], note: "邮箱、昵称或显示名称命中测试关键字" },
  { table: "categories", label: "测试分类", fields: ["name", "slug", "description"], note: "分类名称、标识或说明命中测试关键字" },
  { table: "products", label: "测试商品", fields: ["name", "slug", "short_description", "description"], note: "商品名称、标识或说明命中测试关键字" },
  { table: "product_skus", label: "测试 SKU", fields: ["sku_code", "title"], note: "SKU 编码或标题命中测试关键字" },
  { table: "orders", label: "测试订单", fields: ["order_no", "customer_email", "customer_name", "customer_note", "admin_note"], note: "订单号、客户信息或备注命中测试关键字" },
  { table: "payment_sessions", label: "测试支付会话", fields: ["payment_no", "provider", "channel_code", "provider_order_no", "provider_transaction_id"], note: "支付单号、Provider、渠道单号命中测试关键字" },
  { table: "account_recharges", label: "测试充值", fields: ["recharge_no", "payment_channel", "provider_transaction_id"], note: "充值单号、渠道或交易号命中测试关键字" },
  { table: "refund_requests", label: "测试退款", fields: ["refund_no", "reason", "admin_note"], note: "退款编号、原因或备注命中测试关键字" },
  { table: "balance_transactions", label: "测试余额流水", fields: ["business_no", "description"], note: "业务编号或说明命中测试关键字" },
  { table: "digital_inventory", label: "测试数字库存", fields: ["batch_no", "remark"], sensitive: true, note: "批次号或备注命中测试关键字；不扫描库存明文 content" },
  { table: "order_deliveries", label: "测试交付记录", fields: ["delivery_note", "failure_reason"], sensitive: true, note: "交付备注或失败原因命中测试关键字；不扫描交付明文" },
  { table: "visitor_events", label: "测试访问统计", fields: ["path", "referrer", "source"], note: "访问路径、来源或 referrer 命中测试关键字" },
  { table: "admin_audit_logs", label: "测试审计日志", fields: ["admin_email", "action", "target_label", "error_message"], note: "审计用户、动作、目标或错误摘要命中测试关键字" },
  { table: "system_errors", label: "测试错误日志", fields: ["message", "source", "path"], note: "错误消息、来源或路径命中测试关键字" },
];

export function getTestDataScanRules() {
  return TEST_DATA_SCAN_RULES;
}

export async function buildProductionReadinessPayload(supabase: SupabaseClient) {
  const checkedAt = new Date().toISOString();
  const scans = await Promise.all(TEST_DATA_SCAN_RULES.map((rule) => scanTable(supabase, rule)));
  const items = await loadConfigurationChecks(supabase, scans);
  const blockers = items.filter((item) => item.status === "blocked");
  const warnings = items.filter((item) => item.status === "warning");

  return {
    checkedAt,
    keywords: TEST_DATA_KEYWORDS,
    scans,
    items,
    summary: {
      status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "pass",
      blockedCount: blockers.length,
      warningCount: warnings.length,
      suspectedTestRecords: scans.reduce((sum, scan) => sum + (scan.suspectedCount ?? 0), 0),
      manualConfirmationTables: scans.filter((scan) => (scan.suspectedCount ?? 0) > 0).map((scan) => scan.table),
    },
    cleanup: {
      dryRunScript: "scripts/production-data-cleanup-dry-run.sql",
      cleanupTemplate: "scripts/production-data-cleanup-template.sql",
      requiresBackup: true,
      autoDeleteEnabled: false,
    },
  };
}

async function scanTable(supabase: SupabaseClient, rule: TestDataScanRule): Promise<TestDataScanSummary> {
  const total = await safeCount(supabase, rule.table);
  const suspected = await safeSuspectedCount(supabase, rule);
  const risk: ScanRisk = rule.sensitive ? "high" : rule.table.includes("payment") || rule.table.includes("orders") ? "medium" : "low";

  return {
    table: rule.table,
    label: rule.label,
    totalCount: total.count,
    suspectedCount: suspected.count,
    rule: `${rule.fields.join(", ")} 包含 ${TEST_DATA_KEYWORDS.join(" / ")}`,
    relatedCount: null,
    risk,
    recommendation:
      suspected.count && suspected.count > 0
        ? "需人工核对记录来源；确认是演示数据后，先备份再按清理模板逐段处理。"
        : "未发现明显测试关键字；仍需结合业务编号、来源环境和财务记录人工抽查。",
    error: total.error || suspected.error || null,
  };
}

async function safeCount(supabase: SupabaseClient, table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  return {
    count: error ? null : count ?? 0,
    error: error ? normalizeScanError(error, `${table} 总量读取失败`) : null,
  };
}

async function safeSuspectedCount(supabase: SupabaseClient, rule: TestDataScanRule) {
  const filters = rule.fields.flatMap((field) =>
    TEST_DATA_KEYWORDS.map((keyword) => `${field}.ilike.%${escapeFilterValue(keyword)}%`)
  );
  if (filters.length === 0) return { count: 0, error: null as string | null };
  const { count, error } = await supabase
    .from(rule.table)
    .select("id", { count: "exact", head: true })
    .or(filters.join(","));

  return {
    count: error ? null : count ?? 0,
    error: error ? normalizeScanError(error, `${rule.table} 疑似测试数据扫描失败`) : null,
  };
}

async function loadConfigurationChecks(
  supabase: SupabaseClient,
  scans: TestDataScanSummary[]
): Promise<ProductionReadinessItem[]> {
  const [adminCount, settingsCount, enabledPaymentChannels, productsCount, activeProductsCount, inventoryCount] = await Promise.all([
    countWhere(supabase, "profiles", "role", "admin"),
    safeCount(supabase, "site_settings"),
    countWhere(supabase, "payment_channels", "enabled", true),
    safeCount(supabase, "products"),
    countWhere(supabase, "products", "status", "active"),
    safeCount(supabase, "digital_inventory"),
  ]);
  const suspectedCount = scans.reduce((sum, scan) => sum + (scan.suspectedCount ?? 0), 0);

  return [
    item("database", "数据库结构状态", settingsCount.error ? "warning" : "pass", settingsCount.error || "关键配置表可读取。", "如提示缺表，请先执行已审核 migration。"),
    item("super_admin", "超级管理员状态", (adminCount.count ?? 0) > 0 ? "pass" : "blocked", `管理员账号数量：${adminCount.count ?? "未知"}`, "缺少管理员时，请在 Supabase Auth 创建账号并设置 profiles.role=admin。"),
    item("site_config", "站点配置状态", (settingsCount.count ?? 0) > 0 ? "pass" : "warning", `站点配置记录：${settingsCount.count ?? "未知"}`, "上线前确认网站名称、域名、默认币种、默认时区、协议和公告。"),
    item("payment", "支付配置状态", (enabledPaymentChannels.count ?? 0) > 0 ? "warning" : "pass", `已启用支付渠道：${enabledPaymentChannels.count ?? "未知"}`, "未接真实 Provider 前支付渠道应保持关闭；启用渠道需人工核对密钥和回调。"),
    item("catalog", "商品与库存状态", (activeProductsCount.count ?? 0) > 0 ? "pass" : "warning", `商品总数：${productsCount.count ?? "未知"}；上架商品：${activeProductsCount.count ?? "未知"}；数字库存：${inventoryCount.count ?? "未知"}`, "上线前确认上架商品、SKU、库存和自动发货配置。"),
    item("test_data", "测试数据风险", suspectedCount > 0 ? "warning" : "pass", `疑似测试记录：${suspectedCount}`, "疑似测试数据必须人工核对，不得自动删除真实业务数据。"),
    item("hardcoded", "硬编码占位风险", "warning", "代码中保留空状态文案和未接入 Provider 降级，不生成假支付成功。", "上线前继续检查二维码、钱包地址、固定统计数字和测试密钥。"),
  ];
}

async function countWhere(supabase: SupabaseClient, table: string, field: string, value: string | boolean) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(field, value);
  return {
    count: error ? null : count ?? 0,
    error: error ? normalizeScanError(error, `${table}.${field} 统计失败`) : null,
  };
}

function item(key: string, label: string, status: ReadinessStatus, summary: string, action: string): ProductionReadinessItem {
  return { key, label, status, summary, action };
}

function escapeFilterValue(value: string) {
  return value.replace(/[,%]/g, "");
}

function normalizeScanError(error: unknown, fallback: string) {
  const message = (error as { message?: string; code?: string } | null | undefined)?.message ?? "";
  if (/schema cache|Could not find|PGRST|42P01|column/i.test(message)) return `${fallback}：相关表或字段尚未初始化。`;
  return fallback;
}
