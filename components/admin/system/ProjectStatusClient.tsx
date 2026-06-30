"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StatusResponse = {
  ok: boolean;
  checkedAt?: string;
  release?: {
    release: string;
    commit: string;
    buildTime: string;
    environment: string;
    schemaVersion: string;
  };
  schema?: {
    ok: boolean;
    source: string;
    error: string | null;
    data: {
      missing_tables: string[];
      missing_columns: string[];
      missing_functions: string[];
      missing_constraints: string[];
    };
  };
  migrations?: {
    historyReady: boolean;
    historyError: string | null;
    expected: Array<{ name: string; area: string; order: number; status: string; notes?: string }>;
    rows: Array<{ migration_name?: string | null; status?: string | null; applied_at?: string | null; environment?: string | null }>;
    pending: Array<{ name: string; area: string; order: number; status: string; notes?: string }>;
    failed: Array<{ migration_name?: string | null; status?: string | null; applied_at?: string | null }>;
  };
  features?: {
    completion: string;
    summary: Record<string, number>;
    rows: Array<{
      module: string;
      status: string;
      pages: string[];
      apis: string[];
      services: string[];
      tables: string[];
      evidence: string;
      blocker?: string;
    }>;
  };
  providers?: { status: string; message: string };
  blockers?: {
    p0: Array<Blocker>;
    p1: Array<Blocker>;
    all: Array<Blocker>;
  };
  error?: string;
};

type Blocker = {
  id: string;
  priority: string;
  issue: string;
  impact: string;
  relatedFiles: string[];
  needsMigration: boolean;
  status: string;
};

export default function ProjectStatusClient() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/system/project-status", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as StatusResponse | null;
      if (!response.ok) throw new Error(payload?.error || "Project status check failed.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project status check failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const schemaIssueCount = useMemo(() => {
    const schema = data?.schema?.data;
    if (!schema) return 0;
    return (
      schema.missing_tables.length +
      schema.missing_columns.length +
      schema.missing_functions.length +
      schema.missing_constraints.length
    );
  }, [data]);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 xl:px-6">
      <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-950">项目验收面板</h1>
          <p className="mt-1 text-sm text-slate-500">
            只读汇总当前版本、Migration、功能矩阵、Provider 状态和上线阻塞项；检查会写入审计日志。
          </p>
        </div>
        <button
          type="button"
          onClick={loadStatus}
          disabled={loading}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "检查中..." : "重新检查"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
        {loading && !data ? <Skeleton /> : null}
        {error ? <ErrorState message={error} onRetry={loadStatus} /> : null}
        {!loading && !error && data ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusCard label="数据库结构状态" value={schemaIssueCount === 0 && data.schema?.ok ? "通过" : "需处理"} tone={schemaIssueCount === 0 && data.schema?.ok ? "green" : "red"} />
              <StatusCard label="待确认 Migration" value={`${data.migrations?.pending.length ?? 0}`} tone={(data.migrations?.pending.length ?? 0) > 0 ? "amber" : "green"} />
              <StatusCard label="当前 P0 阻塞" value={`${data.blockers?.p0.length ?? 0}`} tone={(data.blockers?.p0.length ?? 0) > 0 ? "red" : "green"} />
              <StatusCard label="支付 Provider" value={data.providers?.status === "not_configured" ? "未配置" : "已配置"} tone={data.providers?.status === "not_configured" ? "red" : "green"} />
            </div>

            <Panel title="版本信息">
              <DescriptionGrid
                items={[
                  ["应用版本", data.release?.release ?? "-"],
                  ["当前 commit", shortCommit(data.release?.commit)],
                  ["构建时间", data.release?.buildTime ?? "-"],
                  ["环境", data.release?.environment ?? "-"],
                  ["Schema version", data.release?.schemaVersion ?? "-"],
                  ["最近检查时间", formatDate(data.checkedAt)],
                ]}
              />
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="功能完成状态">
                <p className="mb-3 text-sm text-slate-600">{data.features?.completion}</p>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
                  {Object.entries(data.features?.summary ?? {}).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-500">{key}</div>
                      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="当前上线建议">
                <div className="space-y-2 text-sm">
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">可本地测试：仅限已完成与部分完成模块，未测项不得标记通过。</p>
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">可部署测试环境：需要先人工执行并确认 migrations。</p>
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">可部署生产环境：否，P0 阻塞仍存在。</p>
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">可真实收款：否，Provider 未配置。</p>
                </div>
              </Panel>
            </div>

            <Panel title="P0 / P1 阻塞">
              <BlockerTable rows={[...(data.blockers?.p0 ?? []), ...(data.blockers?.p1 ?? [])]} />
            </Panel>

            <Panel title="功能矩阵">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">模块</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">页面 / API</th>
                      <th className="px-3 py-2">表</th>
                      <th className="px-3 py-2">证据 / 阻塞</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.features?.rows ?? []).map((row) => (
                      <tr key={row.module}>
                        <td className="px-3 py-2 font-medium text-slate-900">{row.module}</td>
                        <td className="px-3 py-2"><StatusPill value={row.status} /></td>
                        <td className="px-3 py-2 text-xs text-slate-600">{[...row.pages, ...row.apis].join(", ") || "-"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.tables.join(", ") || "-"}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{row.blocker ?? row.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Migration 状态">
              {!data.migrations?.historyReady ? (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {data.migrations?.historyError ?? "Migration history is not available; treat every migration as pending confirmation."}
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Migration</th>
                      <th className="px-3 py-2">模块</th>
                      <th className="px-3 py-2">登记状态</th>
                      <th className="px-3 py-2">执行时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.migrations?.expected ?? []).map((migration) => {
                      const row = data.migrations?.rows.find((item) => item.migration_name === migration.name);
                      return (
                        <tr key={migration.name}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{migration.name}</td>
                          <td className="px-3 py-2 text-slate-600">{migration.area}</td>
                          <td className="px-3 py-2"><StatusPill value={row?.status === "success" ? "executed" : "pending_confirmation"} /></td>
                          <td className="px-3 py-2 text-xs text-slate-600">{formatDate(row?.applied_at ?? undefined)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Skeleton() {
  return <div className="h-80 animate-pulse rounded-xl bg-slate-100" />;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
      <h2 className="text-lg font-semibold text-slate-950">项目状态读取失败</h2>
      <p className="mt-2 max-w-lg text-sm text-slate-500">{message}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
        重新加载
      </button>
    </div>
  );
}

function StatusCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" | "amber" | "red" }) {
  const color = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "text-slate-950";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DescriptionGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 truncate font-mono text-sm text-slate-800" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BlockerTable({ rows }: { rows: Blocker[] }) {
  if (rows.length === 0) return <p className="text-sm text-emerald-700">没有 P0/P1 阻塞。</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">问题</th>
            <th className="px-3 py-2">影响</th>
            <th className="px-3 py-2">Migration</th>
            <th className="px-3 py-2">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.id}</td>
              <td className="px-3 py-2 text-slate-900">{row.issue}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{row.impact}</td>
              <td className="px-3 py-2 text-slate-600">{row.needsMigration ? "需要" : "不需要"}</td>
              <td className="px-3 py-2"><StatusPill value={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "completed" || value === "success" || value === "executed" || value === "resolved"
      ? "bg-emerald-50 text-emerald-700"
      : value === "blocked" || value === "open" || value === "not_configured"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{value}</span>;
}

function shortCommit(value?: string) {
  if (!value || value === "unknown") return "unknown";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
