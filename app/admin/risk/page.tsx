"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCcw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type RiskEvent = {
  id: string;
  ruleCode: string;
  riskLevel: string;
  riskScore: number;
  recommendedAction: string;
  businessType: string;
  businessId: string | null;
  userId: string | null;
  requestId: string | null;
  sourceHash: string | null;
  summary: string;
  status: string;
  occurrences: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type RiskStats = {
  pending: number;
  high: number;
  today: number;
  processed: number;
  orderRisk: number;
  paymentRisk: number;
  refundRisk: number;
  accountRisk: number;
};

const LEVELS = [
  { value: "all", label: "全部等级" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "critical", label: "严重" },
];

const STATUSES = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待审核" },
  { value: "reviewing", label: "审核中" },
  { value: "monitoring", label: "观察中" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
  { value: "resolved", label: "已解除" },
];

const BUSINESS_TYPES = [
  { value: "all", label: "全部业务" },
  { value: "order", label: "订单" },
  { value: "payment", label: "支付" },
  { value: "recharge", label: "充值" },
  { value: "refund", label: "退款" },
  { value: "account", label: "账户" },
  { value: "delivery", label: "交付" },
];

export default function AdminRiskPage() {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [stats, setStats] = useState<RiskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState("all");
  const [businessType, setBusinessType] = useState("all");
  const [rule, setRule] = useState("");

  const loadRisk = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ pageSize: "50", level, status, businessType });
    if (rule.trim()) params.set("rule", rule.trim());
    try {
      const response = await fetch(`/api/admin/risk?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "风险事件读取失败");
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setStats(payload.stats ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "风险事件读取失败";
      setError(message);
      setEvents([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [businessType, level, rule, status]);

  useEffect(() => {
    loadRisk();
  }, [loadRisk]);

  const cards = useMemo(() => [
    { label: "待审核", value: stats?.pending ?? 0 },
    { label: "高风险", value: stats?.high ?? 0 },
    { label: "今日事件", value: stats?.today ?? 0 },
    { label: "已处理", value: stats?.processed ?? 0 },
    { label: "重复订单风险", value: stats?.orderRisk ?? 0 },
    { label: "支付风险", value: stats?.paymentRisk ?? 0 },
    { label: "退款风险", value: stats?.refundRisk ?? 0 },
    { label: "账户风险", value: stats?.accountRisk ?? 0 },
  ], [stats]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">风险审核中心</h1>
          <p className="mt-1 text-sm text-slate-500">集中查看订单、支付、充值、退款和账户风险事件。</p>
        </div>
        <button type="button" onClick={loadRisk} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <RefreshCcw className="h-4 w-4" />
          刷新
        </button>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{card.label}</span>
              <ShieldAlert className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid shrink-0 gap-3 border-b border-slate-100 p-3 md:grid-cols-5">
          <select value={level} onChange={(event) => setLevel(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
            {LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
            {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={businessType} onChange={(event) => setBusinessType(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
            {BUSINESS_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={rule} onChange={(event) => setRule(event.target.value)} placeholder="规则编号" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" />
          </div>
        </div>

        {error ? (
          <div className="m-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">风险等级</th>
                <th className="px-4 py-3">规则编号</th>
                <th className="px-4 py-3">业务</th>
                <th className="px-4 py-3">命中次数</th>
                <th className="px-4 py-3">建议动作</th>
                <th className="px-4 py-3">审核状态</th>
                <th className="px-4 py-3">最后发现</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">正在读取风险事件...</td></tr> : null}
              {!loading && events.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">暂无风险事件</td></tr> : null}
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><RiskBadge level={event.riskLevel} score={event.riskScore} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{event.ruleCode}</td>
                  <td className="px-4 py-3 text-slate-700">{event.businessType}<div className="text-xs text-slate-400">{event.businessId ?? "-"}</div></td>
                  <td className="px-4 py-3">{event.occurrences}</td>
                  <td className="px-4 py-3">{event.recommendedAction}</td>
                  <td className="px-4 py-3">{event.status}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(event.lastSeenAt)}</td>
                  <td className="px-4 py-3"><Link href={`/admin/risk/${event.id}`} className="font-medium text-blue-600 hover:underline">查看</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ level, score }: { level: string; score: number }) {
  const cls = level === "critical" || level === "high" ? "bg-red-50 text-red-700 ring-red-200" : level === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${cls}`}>{level} · {score}</span>;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
