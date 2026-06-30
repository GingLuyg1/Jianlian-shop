"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

type Rule = { code: string; title: string; severity: string; suggestion: string };
type Issue = {
  id: string;
  rule_code: string;
  severity: "P0" | "P1" | "P2" | "P3";
  entity_type: string;
  entity_id: string | null;
  related_entities: Record<string, unknown> | null;
  title: string;
  summary: string;
  suggestion?: string | null;
  status: "open" | "investigating" | "resolved" | "ignored";
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
};

type State = {
  latestRun: any | null;
  issues: Issue[];
  count: number;
  page: number;
  pageSize: number;
  rules: Rule[];
  stats: { total: number; p0: number; p1: number; resolved: number; open: number };
};

const severityClass: Record<string, string> = {
  P0: "bg-red-50 text-red-700 border-red-200",
  P1: "bg-orange-50 text-orange-700 border-orange-200",
  P2: "bg-blue-50 text-blue-700 border-blue-200",
  P3: "bg-slate-50 text-slate-600 border-slate-200",
};

const statusText: Record<string, string> = {
  open: "待处理",
  investigating: "处理中",
  resolved: "已解决",
  ignored: "已忽略",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function DataConsistencyClient() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState("all");
  const [ruleCode, setRuleCode] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [note, setNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ severity, ruleCode, status, page: "1", pageSize: "20" });
    return params.toString();
  }, [severity, ruleCode, status]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/system/data-consistency?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "数据巡检记录读取失败");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "数据巡检记录读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [query]);

  async function runScan() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system/data-consistency", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "数据巡检执行失败");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "数据巡检执行失败");
    } finally {
      setRunning(false);
    }
  }

  async function updateStatus(nextStatus: Issue["status"]) {
    if (!selected) return;
    if (!note.trim()) {
      setError("处理备注不能为空。");
      return;
    }
    setSavingStatus(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/system/data-consistency/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "处理状态保存失败");
      setSelected(null);
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理状态保存失败");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">数据一致性巡检</h1>
          <p className="mt-1 text-sm text-slate-500">只读检查订单、支付、充值、余额、退款、数字库存和交付数据，提供人工核对建议。</p>
        </div>
        <Button onClick={runScan} disabled={running} className="shrink-0">
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "巡检中..." : "立即巡检"}
        </Button>
      </div>

      {error ? <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <SummaryCard label="最近巡检" value={formatDate(state?.latestRun?.completed_at ?? state?.latestRun?.created_at)} />
        <SummaryCard label="巡检状态" value={state?.latestRun?.status ?? "—"} />
        <SummaryCard label="规则数量" value={String(state?.rules?.length ?? 0)} />
        <SummaryCard label="异常总数" value={String(state?.stats?.total ?? 0)} />
        <SummaryCard label="P0" value={String(state?.stats?.p0 ?? 0)} accent="red" />
        <SummaryCard label="P1" value={String(state?.stats?.p1 ?? 0)} accent="orange" />
        <SummaryCard label="已解决" value={String(state?.stats?.resolved ?? 0)} accent="green" />
        <SummaryCard label="待处理" value={String(state?.stats?.open ?? 0)} accent="blue" />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="mr-auto">
            <div className="font-semibold text-slate-900">异常列表</div>
            <div className="text-xs text-slate-500">当前结果 {state?.count ?? 0} 条</div>
          </div>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="all">全部等级</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <select value={ruleCode} onChange={(event) => setRuleCode(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="all">全部规则</option>
            {(state?.rules ?? []).map((rule) => <option key={rule.code} value={rule.code}>{rule.code}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="all">全部状态</option>
            <option value="open">待处理</option>
            <option value="investigating">处理中</option>
            <option value="resolved">已解决</option>
            <option value="ignored">已忽略</option>
          </select>
          <Button variant="outline" onClick={load} disabled={loading}>刷新</Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1180px] table-fixed text-sm">
            <colgroup>
              <col className="w-[90px]" />
              <col className="w-[80px]" />
              <col className="w-[260px]" />
              <col className="w-[120px]" />
              <col className="w-[180px]" />
              <col className="w-[90px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">规则编号</th>
                <th className="px-3 py-2 text-left">严重程度</th>
                <th className="px-3 py-2 text-left">异常标题</th>
                <th className="px-3 py-2 text-left">业务类型</th>
                <th className="px-3 py-2 text-left">关联业务编号</th>
                <th className="px-3 py-2 text-center">出现次数</th>
                <th className="px-3 py-2 text-left">首次发现</th>
                <th className="px-3 py-2 text-left">最后发现</th>
                <th className="px-3 py-2 text-left">处理状态</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td colSpan={10} className="px-3 py-3"><div className="h-4 w-full rounded bg-slate-100" /></td>
                  </tr>
                ))
              ) : state?.issues?.length ? (
                state.issues.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{item.rule_code}</td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${severityClass[item.severity]}`}>{item.severity}</span></td>
                    <td className="truncate px-3 py-2 font-medium text-slate-900" title={item.title}>{item.title}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{item.entity_type}</td>
                    <td className="truncate px-3 py-2 text-slate-500" title={item.entity_id ?? "—"}>{item.entity_id ?? "—"}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{item.occurrences}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDate(item.first_seen_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDate(item.last_seen_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{statusText[item.status]}</td>
                    <td className="px-3 py-2 text-right"><button type="button" onClick={() => setSelected(item)} className="text-sm font-medium text-blue-600 hover:text-blue-700">查看</button></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="h-72 px-4 text-center text-slate-500">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
                    暂无数据一致性异常。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-200 px-4 text-sm text-slate-500">
          <span>共 {state?.count ?? 0} 条</span>
          <span>巡检只读，不会自动修改资金、支付、退款或库存数据。</span>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500">{selected.rule_code}</div>
                <h2 className="text-xl font-bold text-slate-950">{selected.title}</h2>
              </div>
              <button className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={() => setSelected(null)}>关闭</button>
            </div>
            <div className="space-y-4 text-sm">
              <Info label="严重程度" value={selected.severity} />
              <Info label="业务类型" value={selected.entity_type} />
              <Info label="业务编号" value={selected.entity_id ?? "—"} />
              <Info label="异常摘要" value={selected.summary} />
              <Info label="安全修复建议" value={selected.suggestion || "请人工核对后通过已有业务服务处理。"} />
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">关联实体（已脱敏）</div>
                <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(selected.related_entities ?? {}, null, 2)}</pre>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">处理备注</label>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="h-24 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="必须填写人工核对或处理说明" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={savingStatus} onClick={() => updateStatus("investigating")}>标记处理中</Button>
                <Button variant="outline" disabled={savingStatus} onClick={() => updateStatus("resolved")}>标记已解决</Button>
                <Button variant="outline" disabled={savingStatus} onClick={() => updateStatus("ignored")}>标记忽略</Button>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <ShieldAlert className="mr-1 inline h-4 w-4" />
                页面不提供直接 SQL、余额调整、支付状态修改或库存重分配按钮。高风险修复必须通过已有业务服务并保留审计记录。
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: "red" | "orange" | "green" | "blue" }) {
  const accentClass = accent === "red" ? "text-red-600" : accent === "orange" ? "text-orange-600" : accent === "green" ? "text-green-600" : accent === "blue" ? "text-blue-600" : "text-slate-950";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-bold ${accentClass}`} title={value}>{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <div className="rounded-lg bg-slate-50 p-3 text-slate-700">{value}</div>
    </div>
  );
}
