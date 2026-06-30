"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileLock2, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "requested", label: "已提交" },
  { value: "verifying", label: "校验中" },
  { value: "blocked", label: "有阻塞项" },
  { value: "approved", label: "已批准" },
  { value: "processing", label: "处理中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "failed", label: "失败" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "data_export", label: "数据导出" },
  { value: "account_deletion", label: "账号注销" },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, item.label]));
const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((item) => [item.value, item.label]));

type PrivacyRow = {
  id: string;
  requestNo: string;
  requestType: string;
  status: string;
  reasonDetail: string | null;
  blockReasons: string[];
  reviewNote: string | null;
  userEmail: string | null;
  userLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
  cooldownUntil: string | null;
  completedAt: string | null;
};

export default function AdminPrivacyRequestsPage() {
  const [rows, setRows] = useState<PrivacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<PrivacyRow | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, type, pageSize: "50" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/admin/privacy-requests?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "隐私请求读取失败");
      setRows(Array.isArray(payload.requests) ? payload.requests : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "隐私请求读取失败";
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, status, type]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const counts = useMemo(() => rows.reduce((acc, row) => {
    acc.total += 1;
    if (["requested", "verifying", "blocked"].includes(row.status)) acc.pending += 1;
    if (row.status === "processing") acc.processing += 1;
    return acc;
  }, { total: 0, pending: 0, processing: 0 }), [rows]);

  async function submitAction(action: string) {
    if (!selected) return;
    if (["approve", "reject", "processing", "complete_anonymize"].includes(action) && !note.trim()) {
      toast.error("请填写处理备注");
      return;
    }
    const dangerous = ["approve", "reject", "cancel", "complete_anonymize"].includes(action);
    if (dangerous && !window.confirm("确认执行该隐私请求操作？操作会写入审计日志。")) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/privacy-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId: selected.id, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "隐私请求处理失败");
      toast.success("隐私请求已处理");
      setSelected(null);
      setNote("");
      loadRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "隐私请求处理失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminPageShell
      title="隐私请求"
      description="处理个人数据导出、账号注销、阻塞项复查与匿名化操作。"
      actions={<Button variant="outline" size="sm" onClick={loadRows} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>}
    >
      <div className="grid shrink-0 gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">当前列表</p><p className="mt-2 text-2xl font-semibold">{counts.total}</p></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">待处理</p><p className="mt-2 text-2xl font-semibold text-amber-600">{counts.pending}</p></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">处理中</p><p className="mt-2 text-2xl font-semibold text-blue-600">{counts.processing}</p></div>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap gap-2 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索申请编号或说明" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          {TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border bg-white shadow-sm">
        {error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {loading ? (
          <div className="h-full animate-pulse bg-slate-50" />
        ) : rows.length ? (
          <div className="h-full overflow-auto">
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">申请编号</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">阻塞原因</th>
                  <th className="px-4 py-3">申请时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-orange-50/40">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.requestNo}</td>
                    <td className="px-4 py-3">{row.userEmail || row.userLabel}</td>
                    <td className="px-4 py-3">{TYPE_LABELS[row.requestType] ?? row.requestType}</td>
                    <td className="px-4 py-3">{STATUS_LABELS[row.status] ?? row.status}</td>
                    <td className="max-w-[300px] truncate px-4 py-3 text-slate-500">{row.blockReasons?.length ? row.blockReasons.join("；") : "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN") : "—"}</td>
                    <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => { setSelected(row); setNote(""); }}>查看</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-sm text-slate-500">
            <FileLock2 className="mb-3 h-10 w-10 text-slate-300" />
            暂无隐私请求
          </div>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={() => setSelected(null)}>
          <aside className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{selected.requestNo}</h2>
                <p className="text-sm text-slate-500">{TYPE_LABELS[selected.requestType] ?? selected.requestType}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="用户" value={selected.userEmail || selected.userLabel} />
                <Info label="状态" value={STATUS_LABELS[selected.status] ?? selected.status} />
                <Info label="申请时间" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString("zh-CN") : "—"} />
                <Info label="预计处理时间" value={selected.cooldownUntil ? new Date(selected.cooldownUntil).toLocaleString("zh-CN") : "—"} />
              </div>
              <Info label="申请说明" value={selected.reasonDetail || "—"} />
              <Info label="阻塞原因" value={selected.blockReasons?.length ? selected.blockReasons.join("；") : "—"} />
              <label className="block">
                <span className="font-medium text-slate-700">处理备注</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 h-24 w-full rounded-lg border px-3 py-2 outline-none focus:border-orange-400" placeholder="管理员处理备注，批准/拒绝/匿名化必须填写" />
              </label>
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
              <Button variant="outline" onClick={() => submitAction("recheck")} disabled={submitting}>重新检查</Button>
              <Button variant="outline" onClick={() => submitAction("processing")} disabled={submitting}>标记处理中</Button>
              <Button variant="outline" onClick={() => submitAction("cancel")} disabled={submitting}>取消</Button>
              <Button variant="outline" onClick={() => submitAction("reject")} disabled={submitting}>拒绝</Button>
              <Button onClick={() => submitAction("approve")} disabled={submitting}>批准</Button>
              {selected.requestType === "account_deletion" ? <Button variant="destructive" onClick={() => submitAction("complete_anonymize")} disabled={submitting}>完成匿名化</Button> : null}
            </footer>
          </aside>
        </div>
      ) : null}
    </AdminPageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-900">{value}</p>
    </div>
  );
}
