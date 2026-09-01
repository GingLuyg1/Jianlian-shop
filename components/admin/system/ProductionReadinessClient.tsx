"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ClipboardList, MailWarning, RefreshCw, ScrollText, WalletCards } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatusPayload = {
  status: "ok" | "warning";
  release: { environment: string; commit_sha: string; application_version: string; build_time: string | null };
  database: { status: "ok" | "warning" };
  errors: { last_24_hours: number; unresolved_critical: number; available: boolean };
  providers: { email: { status: string; provider: string }; payment: { status: string; configured_channels: number } };
  background_jobs: { email_pending_or_failed: number; available: boolean };
  checked_at: string;
};

type PaymentStats = { todayPaymentAmount: number; todayRechargeAmount: number; todaySuccessCount: number; successRate: number; pendingExceptionCount: number };
type ErrorEvent = { id: string; level: string; title: string; route: string | null; request_id: string | null; last_seen_at: string; status: string };
type AuditLog = { id: string; admin_email: string | null; action: string; module: string; result: string; request_id: string; created_at: string };
type DashboardData = { status: StatusPayload; payments: PaymentStats | null; orders: { count: number } | null; errors: ErrorEvent[]; audits: AuditLog[]; moduleErrors: Record<string, string> };

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `${url} 读取失败`);
  if (!body) throw new Error(`${url} 未返回数据`);
  return body;
}

export default function ProductionReadinessClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const status = await readJson<StatusPayload>("/api/admin/system/status");
      const [payments, orders, errors, audits] = await Promise.allSettled([
        readJson<PaymentStats>("/api/admin/payment-stats"),
        readJson<{ count: number }>("/api/admin/orders?page=1&pageSize=1&sortBy=created_at&sortDirection=desc"),
        readJson<{ events: ErrorEvent[] }>("/api/admin/system-errors?page=1&pageSize=6"),
        readJson<{ logs: AuditLog[] }>("/api/admin/audit-logs?page=1&pageSize=10"),
      ]);
      const moduleErrors: Record<string, string> = {};
      if (payments.status === "rejected") moduleErrors.payments = getReason(payments.reason, "支付统计读取失败");
      if (orders.status === "rejected") moduleErrors.orders = getReason(orders.reason, "订单统计读取失败");
      if (errors.status === "rejected") moduleErrors.errors = getReason(errors.reason, "异常摘要读取失败");
      if (audits.status === "rejected") moduleErrors.audits = getReason(audits.reason, "操作日志读取失败");
      setData({
        status,
        payments: payments.status === "fulfilled" ? payments.value : null,
        orders: orders.status === "fulfilled" ? orders.value : null,
        errors: errors.status === "fulfilled" ? errors.value.events : [],
        audits: audits.status === "fulfilled" ? audits.value.logs : [],
        moduleErrors,
      });
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "生产状态读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminPageShell
      title="生产看板"
      description="汇总应用、数据库、订单、支付、邮件和近期运营事件；所有指标均来自现有只读接口。"
      actions={<Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}
    >
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading && !data ? <AdminTableSkeleton rows={7} /> : null}
        {error ? <AdminErrorState description={error} onRetry={() => void load()} /> : null}
        {!loading && data ? <Dashboard data={data} /> : null}
      </div>
    </AdminPageShell>
  );
}

function Dashboard({ data }: { data: DashboardData }) {
  const { status, payments, orders, errors, audits, moduleErrors } = data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Activity} label="应用状态" value={status.status === "ok" ? "正常" : "需关注"} warning={status.status !== "ok"} detail={`${status.release.environment} · ${status.release.commit_sha || "未知版本"}`} />
        <Metric icon={Activity} label="数据库状态" value={status.database.status === "ok" ? "正常" : "需关注"} warning={status.database.status !== "ok"} detail={`检查于 ${formatDate(status.checked_at)}`} />
        <Metric icon={ClipboardList} label="订单总量" value={orders ? String(orders.count) : "不可用"} warning={!orders} detail={moduleErrors.orders || "来自订单只读列表"} />
        <Metric icon={AlertTriangle} label="未解决严重异常" value={status.errors.available ? String(status.errors.unresolved_critical) : "不可用"} warning={!status.errors.available || status.errors.unresolved_critical > 0} detail={`近 24 小时 ${status.errors.last_24_hours} 条`} />
        <Metric icon={WalletCards} label="今日支付成功" value={payments ? String(payments.todaySuccessCount) : "不可用"} warning={!payments} detail={payments ? `成功率 ${payments.successRate}%` : moduleErrors.payments} />
        <Metric icon={WalletCards} label="支付异常" value={payments ? String(payments.pendingExceptionCount) : "不可用"} warning={!payments || (payments?.pendingExceptionCount ?? 0) > 0} detail={payments ? `支付 ${payments.todayPaymentAmount} / 充值 ${payments.todayRechargeAmount}` : moduleErrors.payments} />
        <Metric icon={MailWarning} label="邮件待处理或失败" value={status.background_jobs.available ? String(status.background_jobs.email_pending_or_failed) : "不可用"} warning={!status.background_jobs.available || status.background_jobs.email_pending_or_failed > 0} detail={`${status.providers.email.provider} · ${status.providers.email.status}`} />
        <Metric icon={WalletCards} label="已配置支付渠道" value={String(status.providers.payment.configured_channels)} warning={status.providers.payment.status !== "configured"} detail={status.providers.payment.status} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="最近异常" href="/admin/system-errors" error={moduleErrors.errors}>
          {errors.length ? errors.map((event) => <Link key={event.id} href={event.request_id ? `/admin/system-errors?requestId=${encodeURIComponent(event.request_id)}` : "/admin/system-errors"} className="block border-b border-slate-100 px-1 py-3 last:border-0 hover:bg-slate-50"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium text-slate-900">{event.title}</span><span className="text-xs text-slate-500">{formatDate(event.last_seen_at)}</span></div><div className="mt-1 truncate text-xs text-slate-500">{event.level} · {event.route || "无路由"} · {event.status}</div></Link>) : <AdminEmptyState title="暂无异常记录" description="当前查询未返回系统异常。" className="min-h-[180px]" />}
        </Panel>
        <Panel title="最近后台操作" href="/admin/audit-logs" error={moduleErrors.audits}>
          {audits.length ? audits.map((log) => <Link key={log.id} href={`/admin/audit-logs?requestId=${encodeURIComponent(log.request_id)}`} className="block border-b border-slate-100 px-1 py-3 last:border-0 hover:bg-slate-50"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium text-slate-900">{log.action}</span><span className="text-xs text-slate-500">{formatDate(log.created_at)}</span></div><div className="mt-1 truncate text-xs text-slate-500">{log.admin_email || "未知管理员"} · {log.module} · {log.result}</div></Link>) : <AdminEmptyState icon={<ScrollText className="h-5 w-5" />} title="暂无操作日志" description="当前账号可见范围内没有后台操作记录。" className="min-h-[180px]" />}
        </Panel>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, warning }: { icon: typeof Activity; label: string; value: string; detail?: string; warning?: boolean }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon className="h-4 w-4" />{label}</div><div className={cn("mt-2 text-2xl font-semibold", warning ? "text-amber-700" : "text-slate-950")}>{value}</div><div className="mt-1 truncate text-xs text-slate-500" title={detail}>{detail || "—"}</div></div>;
}

function Panel({ title, href, error, children }: { title: string; href: string; error?: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 p-4"><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold text-slate-950">{title}</h2><Link href={href} className="text-sm text-primary hover:underline">查看全部</Link></div>{error ? <AdminErrorState title={`${title}不可用`} description={error} className="min-h-[180px]" /> : children}</section>;
}

function getReason(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
function formatDate(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
