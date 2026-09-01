"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";

type DatabaseStatusResponse = {
  ok: boolean;
  checkedAt?: string;
  source?: "rpc" | "fallback";
  release?: {
    release: string;
    commit: string;
    buildTime: string;
    environment: string;
    schemaVersion: string;
  };
  expectedMigrations?: Array<{
    name: string;
    area: string;
    order: number;
    status: string;
    notes?: string;
  }>;
  migrationHistory?: {
    ready: boolean;
    rows: Array<{
      migration_name?: string | null;
      status?: string | null;
      applied_at?: string | null;
      environment?: string | null;
    }>;
    error?: string | null;
  };
  latestMigration?: {
    migration_name?: string | null;
    status?: string | null;
    applied_at?: string | null;
    environment?: string | null;
  } | null;
  pendingMigrations?: Array<{ name: string; area: string; status: string }>;
  failedMigrations?: Array<{ migration_name?: string | null; applied_at?: string | null }>;
  schema?: {
    checked_at?: string | null;
    missing_tables?: string[];
    missing_columns?: string[];
    missing_functions?: string[];
    missing_constraints?: string[];
    summary?: Record<string, unknown>;
  } | null;
  schemaError?: string | null;
  codeFieldConsistency?: string[];
  error?: string;
};

export default function DatabaseStatusClient() {
  const [data, setData] = useState<DatabaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/system/database", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as DatabaseStatusResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error || "数据库状态读取失败，请稍后重试。");
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "数据库状态读取失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const issueCount = useMemo(() => {
    if (!data?.schema) return 0;
    return (
      (data.schema.missing_tables?.length ?? 0) +
      (data.schema.missing_columns?.length ?? 0) +
      (data.schema.missing_functions?.length ?? 0) +
      (data.schema.missing_constraints?.length ?? 0) +
      (data.failedMigrations?.length ?? 0)
    );
  }, [data]);

  return (
    <AdminPageShell
      title="数据库状态"
      description="只读检查数据库连通、关键结构、RPC 和 migration 登记；不会执行 SQL 或修改数据。"
      actions={
        <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "检查中" : "重新检查"}
        </Button>
      }
    >

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
        {loading && !data ? <AdminTableSkeleton rows={6} /> : null}
        {error ? <AdminErrorState title="数据库状态读取失败" description={error} onRetry={() => void loadStatus()} /> : null}
        {!loading && !error && !data ? (
          <AdminEmptyState title="暂无数据库检查结果" description="重新检查后可查看当前只读探测结果。" />
        ) : null}
        {!error && data ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusCard label="数据库连通" value="已连接" tone="green" />
              <StatusCard label="结构检查" value={data.ok && issueCount === 0 ? "通过" : "需关注"} tone={data.ok && issueCount === 0 ? "green" : "amber"} />
              <StatusCard label="RPC 可用性" value={data.source === "rpc" ? "可用" : "使用降级探测"} tone={data.source === "rpc" ? "green" : "amber"} />
              <StatusCard label="结构问题" value={`${issueCount}`} tone={issueCount > 0 ? "red" : "green"} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Migration 区域仅展示应用登记表中的记录；“未登记”不代表 migration 未执行，不能据此直接操作数据库。
            </div>

            <Panel title="发布信息">
              <DescriptionGrid
                items={[
                  ["Release", data.release?.release ?? "—"],
                  ["Commit", shortCommit(data.release?.commit)],
                  ["Build Time", data.release?.buildTime ?? "—"],
                  ["Environment", data.release?.environment ?? "—"],
                  ["Schema Version", data.release?.schemaVersion ?? "—"],
                  ["Last Check", formatDate(data.checkedAt)],
                ]}
              />
            </Panel>

            {data.schemaError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {data.schemaError}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <IssueList title="缺失表" items={data.schema?.missing_tables ?? []} />
              <IssueList title="缺失字段" items={data.schema?.missing_columns ?? []} />
              <IssueList title="缺失函数 / RPC" items={data.schema?.missing_functions ?? []} />
              <IssueList title="缺失约束" items={data.schema?.missing_constraints ?? []} />
            </div>

            <Panel title={`Migration 登记（未登记 ${data.pendingMigrations?.length ?? 0} 项）`}>
              {!data.migrationHistory?.ready ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {data.migrationHistory?.error ?? "迁移登记表尚未初始化。"}
                </p>
              ) : null}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Migration</th>
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">登记状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.expectedMigrations ?? []).map((migration) => {
                      const row = data.migrationHistory?.rows.find((item) => item.migration_name === migration.name);
                      return (
                        <tr key={migration.name}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{migration.name}</td>
                          <td className="px-3 py-2 text-slate-600">{migration.area}</td>
                          <td className="px-3 py-2 text-slate-600">{migration.status}</td>
                          <td className="px-3 py-2">
                            <span className={row?.status === "success" ? "text-emerald-700" : "text-amber-700"}>
                              {row?.status === "success" ? "已登记" : "未登记"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="代码字段一致性检查备注">
              <ul className="space-y-2 text-sm text-slate-600">
                {(data.codeFieldConsistency ?? []).map((item) => (
                  <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        ) : null}
      </div>
    </AdminPageShell>
  );
}

function StatusCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" | "amber" | "red" }) {
  const color =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
      ? "text-amber-700"
      : tone === "red"
      ? "text-red-700"
      : "text-slate-950";
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

function IssueList({ title, items }: { title: string; items: string[] }) {
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-emerald-700">未发现问题</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="rounded-lg bg-red-50 px-3 py-2 font-mono text-xs text-red-700">
              {item}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DescriptionGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 truncate font-mono text-sm text-slate-800" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function shortCommit(value?: string) {
  if (!value || value === "unknown") return "unknown";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
