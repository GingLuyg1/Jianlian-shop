"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, ShieldOff, XCircle } from "lucide-react";
import { toast } from "sonner";

type RiskDetail = {
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
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  reviews: Array<{ id: string; status: string; decision: string; reason: string; reviewedBy: string | null; reviewedAt: string | null }>;
};

const ACTIONS = [
  { action: "approve", label: "批准继续处理", icon: CheckCircle2 },
  { action: "reject", label: "拒绝", icon: XCircle },
  { action: "monitor", label: "继续观察", icon: Eye },
  { action: "release", label: "解除限制", icon: ShieldOff },
];

export default function AdminRiskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [event, setEvent] = useState<RiskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState("");

  const loadEvent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/risk/${id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "风险事件读取失败");
      setEvent(payload.event ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "风险事件读取失败";
      setError(message);
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  async function submit(action: string) {
    if (!event) return;
    if (!reason.trim()) {
      toast.error("请填写审核原因");
      return;
    }
    const highRisk = ["high", "critical"].includes(event.riskLevel);
    if (highRisk && !window.confirm("确认执行该高风险审核动作？")) return;
    setSubmitting(action);
    try {
      const response = await fetch(`/api/admin/risk/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim(), confirmHighRisk: highRisk }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "风险审核操作失败");
      toast.success("风险审核已保存");
      setReason("");
      await loadEvent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "风险审核操作失败");
    } finally {
      setSubmitting("");
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-3">
        <Link href="/admin/risk" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          返回风险审核中心
        </Link>
      </div>

      {loading ? <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-500">正在读取风险事件...</div> : null}
      {error ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">{error}</div> : null}

      {event ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-950">{event.ruleCode}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">{event.summary}</p>
              </div>
              <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700 ring-1 ring-red-200">{event.riskLevel} · {event.riskScore}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Info label="业务类型" value={event.businessType} />
              <Info label="业务编号" value={event.businessId ?? "-"} />
              <Info label="用户摘要" value={event.userId ? `${event.userId.slice(0, 8)}...` : "-"} />
              <Info label="来源摘要" value={event.sourceHash ?? "-"} />
              <Info label="建议动作" value={event.recommendedAction} />
              <Info label="审核状态" value={event.status} />
              <Info label="首次发现" value={formatDate(event.firstSeenAt)} />
              <Info label="最后发现" value={formatDate(event.lastSeenAt)} />
              <Info label="过期时间" value={formatDate(event.expiresAt)} />
              <Info label="命中次数" value={String(event.occurrences)} />
            </div>

            <div className="mt-5">
              <h2 className="text-sm font-semibold text-slate-900">安全元数据</h2>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(event.metadata, null, 2)}</pre>
            </div>

            <div className="mt-5">
              <h2 className="text-sm font-semibold text-slate-900">审核记录</h2>
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {event.reviews.length === 0 ? <div className="p-3 text-sm text-slate-500">暂无审核记录</div> : null}
                {event.reviews.map((review) => (
                  <div key={review.id} className="p-3 text-sm">
                    <div className="font-medium text-slate-900">{review.decision} · {review.status}</div>
                    <div className="mt-1 text-slate-600">{review.reason}</div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(review.reviewedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">人工审核</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">审核动作只更新风险事件和审核记录，不直接修改订单、余额、支付或退款事实。</p>
            <textarea value={reason} onChange={(input) => setReason(input.target.value)} rows={5} placeholder="填写审核原因" className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" />
            <div className="mt-4 grid gap-2">
              {ACTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.action} type="button" disabled={Boolean(submitting)} onClick={() => submit(item.action)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                    <Icon className="h-4 w-4" />
                    {submitting === item.action ? "提交中..." : item.label}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
