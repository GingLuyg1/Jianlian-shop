"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import AdminPageShell from "@/components/admin/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CompensationTask = {
  id: string;
  business_type: string | null;
  business_id: string | null;
  business_no: string | null;
  operation: string | null;
  failure_stage: string | null;
  status: string | null;
  retryable: boolean | null;
  attempts: number | null;
  next_retry_at: string | null;
  error_code: string | null;
  error_summary: string | null;
  request_id: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  retrying: "重试中",
  manual_review: "人工审核",
  resolved: "已解决",
  cancelled: "已取消",
};

const BUSINESS_LABEL: Record<string, string> = {
  product: "商品",
  order: "订单",
  payment: "支付",
  recharge: "充值",
  refund: "退款",
  balance: "余额",
  delivery: "交付",
  inventory: "库存",
  system: "系统",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminCompensationsPage() {
  const [tasks, setTasks] = useState<CompensationTask[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("all");
  const [businessType, setBusinessType] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 20)), [count]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, businessType, page: String(page), pageSize: "20" });
      const response = await fetch(`/api/admin/system/compensations?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "补偿任务读取失败");
      setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
      setCount(Number(payload.count ?? 0));
    } catch (loadError) {
      setTasks([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "补偿任务读取失败");
    } finally {
      setLoading(false);
    }
  }, [businessType, page, status]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function handleAction(task: CompensationTask, action: "mark_manual_review" | "mark_resolved" | "mark_cancelled") {
    const reason = window.prompt("请输入处理原因，处理会写入管理员审计日志。");
    if (!reason) return;
    const confirmed = window.confirm("确认处理该补偿任务？此操作不会直接修改支付、余额或库存状态。");
    if (!confirmed) return;

    setActingId(task.id);
    setError("");
    try {
      const response = await fetch("/api/admin/system/compensations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, action, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "补偿任务处理失败");
      await loadTasks();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "补偿任务处理失败");
    } finally {
      setActingId(null);
    }
  }

  return (
    <AdminPageShell
      title="事务补偿"
      description="查看支付、订单、余额、退款和交付等无法自动回滚时产生的人工补偿任务。"
      actions={
        <Button type="button" variant="outline" onClick={() => void loadTasks()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      }
    >
      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col gap-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={businessType} onValueChange={(value) => { setBusinessType(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="业务类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部业务</SelectItem>
                {Object.entries(BUSINESS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={`共 ${count} 条`} readOnly className="bg-slate-50 text-slate-500" />
          </div>

          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">业务</th>
                  <th className="px-3 py-2">编号</th>
                  <th className="px-3 py-2">操作</th>
                  <th className="px-3 py-2">失败步骤</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">错误</th>
                  <th className="px-3 py-2">Request ID</th>
                  <th className="px-3 py-2">尝试</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-500">读取中...</td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-16 text-center text-slate-500">暂无补偿任务。只有外部事实已发生但站内事务无法自动完成时，才会显示在这里。</td></tr>
                ) : tasks.map((task) => {
                  const closed = ["resolved", "cancelled"].includes(String(task.status));
                  return (
                    <tr key={task.id} className="border-t">
                      <td className="px-3 py-3">{BUSINESS_LABEL[String(task.business_type)] ?? task.business_type ?? "-"}</td>
                      <td className="px-3 py-3 font-mono text-xs">{task.business_no ?? task.business_id ?? "-"}</td>
                      <td className="px-3 py-3">{task.operation ?? "-"}</td>
                      <td className="px-3 py-3">{task.failure_stage ?? "-"}</td>
                      <td className="px-3 py-3">{STATUS_LABEL[String(task.status)] ?? task.status ?? "-"}</td>
                      <td className="max-w-[260px] truncate px-3 py-3" title={task.error_summary ?? task.error_code ?? ""}>{task.error_code ?? "-"} {task.error_summary ?? ""}</td>
                      <td className="px-3 py-3 font-mono text-xs">{task.request_id ?? "-"}</td>
                      <td className="px-3 py-3">{task.attempts ?? 0}</td>
                      <td className="px-3 py-3">{formatDate(task.created_at)}</td>
                      <td className="space-x-2 whitespace-nowrap px-3 py-3">
                        <Button size="sm" variant="outline" disabled={closed || actingId === task.id} onClick={() => void handleAction(task, "mark_manual_review")}>人工审核</Button>
                        <Button size="sm" variant="outline" disabled={closed || actingId === task.id} onClick={() => void handleAction(task, "mark_resolved")}>已解决</Button>
                        <Button size="sm" variant="destructive" disabled={closed || actingId === task.id} onClick={() => void handleAction(task, "mark_cancelled")}>取消</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>第 {page} / {totalPages} 页</span>
            <div className="space-x-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminPageShell>
  );
}
