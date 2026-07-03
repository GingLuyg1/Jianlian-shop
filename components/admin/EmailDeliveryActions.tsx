"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EmailDeliveryActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"retry" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const canRetry = status === "failed" || status === "retrying" || status === "pending";
  const canCancel = status === "failed" || status === "retrying" || status === "pending";

  async function run(action: "retry" | "cancel") {
    const label = action === "retry" ? "重试发送" : "取消任务";
    if (!window.confirm(`确认${label}？该操作会写入管理员审计日志。`)) return;
    setPending(action);
    setError("");
    try {
      const response = await fetch(`/api/admin/notifications/email-deliveries/${jobId}/${action}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `${label}失败。`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${label}失败。`);
    } finally {
      setPending(null);
    }
  }

  if (!canRetry && !canCancel) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex min-w-[150px] items-center gap-2">
      {canRetry ? <button type="button" disabled={pending !== null} onClick={() => run("retry")} className="rounded border border-orange-200 px-2 py-1 text-xs text-orange-700 disabled:opacity-50">{pending === "retry" ? "处理中" : "重试"}</button> : null}
      {canCancel ? <button type="button" disabled={pending !== null} onClick={() => run("cancel")} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-50">{pending === "cancel" ? "处理中" : "取消"}</button> : null}
      {error ? <span className="max-w-[180px] truncate text-xs text-red-600" title={error}>{error}</span> : null}
    </div>
  );
}
