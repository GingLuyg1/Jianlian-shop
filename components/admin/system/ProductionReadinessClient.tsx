"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReadinessStatus = "pass" | "warning" | "blocked";

type ReadinessPayload = {
  checkedAt?: string;
  summary?: {
    status: ReadinessStatus;
    blockedCount: number;
    warningCount: number;
    suspectedTestRecords: number;
    manualConfirmationTables?: string[];
  };
  items?: Array<{
    key: string;
    label: string;
    status: ReadinessStatus;
    summary: string;
    action: string;
  }>;
  scans?: Array<{
    table: string;
    label: string;
    totalCount: number | null;
    suspectedCount: number | null;
    risk: "low" | "medium" | "high";
    recommendation: string;
    error?: string | null;
  }>;
  cleanup?: {
    dryRunScript: string;
    cleanupTemplate: string;
    requiresBackup: boolean;
    autoDeleteEnabled: boolean;
  };
  error?: string;
};

const statusLabel: Record<ReadinessStatus, string> = {
  pass: "通过",
  warning: "需确认",
  blocked: "阻塞",
};

const statusClass: Record<ReadinessStatus, string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  blocked: "border-red-200 bg-red-50 text-red-700",
};

export default function ProductionReadinessClient() {
  const [data, setData] = useState<ReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system/production-readiness", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ReadinessPayload | null;
      if (!response.ok) throw new Error(payload?.error || "生产验收检查失败");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生产验收检查失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 xl:px-6">
      <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">上线验收</h1>
          <p className="mt-1 text-sm text-slate-500">检查配置、测试数据风险和上线前阻塞项；检查结果会写入管理员审计日志。</p>
        </div>
        <Button type="button" onClick={load} disabled={loading} className="shrink-0">
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          {loading ? "检查中..." : "重新检查"}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {loading && !data ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">正在读取上线验收数据...</div> : null}
        {!loading && !error && data ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="总体状态" value={summary ? statusLabel[summary.status] : "-"} tone={summary?.status ?? "warning"} />
              <Metric label="阻塞项" value={String(summary?.blockedCount ?? 0)} tone={(summary?.blockedCount ?? 0) > 0 ? "blocked" : "pass"} />
              <Metric label="警告项" value={String(summary?.warningCount ?? 0)} tone={(summary?.warningCount ?? 0) > 0 ? "warning" : "pass"} />
              <Metric label="疑似测试记录" value={String(summary?.suspectedTestRecords ?? 0)} tone={(summary?.suspectedTestRecords ?? 0) > 0 ? "warning" : "pass"} />
            </div>

            <Panel title="验收项目">
              <div className="divide-y divide-slate-100">
                {(data.items ?? []).map((item) => (
                  <div key={item.key} className="grid gap-3 py-3 md:grid-cols-[160px_110px_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <span className={cn("inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass[item.status])}>{statusLabel[item.status]}</span>
                    <div className="text-sm text-slate-600">{item.summary}</div>
                    <div className="text-sm text-slate-500">{item.action}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="测试数据扫描">
              <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">表</th>
                      <th className="px-3 py-2">总量</th>
                      <th className="px-3 py-2">疑似记录</th>
                      <th className="px-3 py-2">风险</th>
                      <th className="px-3 py-2">建议</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.scans ?? []).map((scan) => (
                      <tr key={scan.table}>
                        <td className="px-3 py-2 font-medium text-slate-900">{scan.label}<div className="text-xs font-normal text-slate-400">{scan.table}</div></td>
                        <td className="px-3 py-2">{scan.totalCount ?? "-"}</td>
                        <td className="px-3 py-2">{scan.suspectedCount ?? "-"}</td>
                        <td className="px-3 py-2">{scan.risk}</td>
                        <td className="px-3 py-2 text-slate-500">{scan.error || scan.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="清理原则">
              <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <div>只提供 dry-run 和人工清理模板，不自动删除生产数据。</div>
                <div>清理前必须备份，敏感业务记录需人工核对。</div>
                <div>Dry-run：{data.cleanup?.dryRunScript ?? "-"}</div>
                <div>模板：{data.cleanup?.cleanupTemplate ?? "-"}</div>
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: ReadinessStatus }) {
  return (
    <div className={cn("rounded-xl border p-4", statusClass[tone])}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}
