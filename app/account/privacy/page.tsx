"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileLock2, RefreshCcw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type PrivacySummary = {
  profile?: { email?: string | null; displayName?: string | null; accountStatus?: string | null; riskStatus?: string | null; createdAt?: string | null };
  counts?: Record<string, number | null>;
  recentRequests?: Array<{ id: string; requestNo: string; requestType: string; status: string; createdAt: string | null }>;
  requests?: Array<{ id: string; requestNo: string; requestType: string; status: string; createdAt: string | null }>;
  errors?: Record<string, string>;
};

const STATUS_LABELS: Record<string, string> = {
  requested: "已提交",
  verifying: "校验中",
  blocked: "存在阻塞项",
  approved: "已批准",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失败",
};

function makeClientRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AccountPrivacyPage() {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");

  async function loadSummary() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/privacy", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "隐私设置读取失败");
      setSummary(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "隐私设置读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const counts = summary?.counts ?? {};
  const hasActiveDeletion = useMemo(
    () => (summary?.recentRequests ?? summary?.requests)?.some((item) => item.requestType === "account_deletion" && ["requested", "verifying", "blocked", "approved", "processing"].includes(item.status)),
    [summary]
  );

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch("/api/account/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_data", clientRequestId: makeClientRequestId("export") }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "个人数据导出失败");
      const blob = new Blob([JSON.stringify(payload.data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.fileName || "jianlian-personal-data.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("个人数据导出已生成");
      loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "个人数据导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function checkDeletion() {
    setChecking(true);
    try {
      const response = await fetch("/api/account/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_deletion" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "注销阻塞项检查失败");
      setBlockers(Array.isArray(payload.reasons) ? payload.reasons : []);
      toast.success(payload.blocked ? "已发现需要处理的阻塞项" : "当前未发现阻塞项");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "注销阻塞项检查失败");
    } finally {
      setChecking(false);
    }
  }

  async function requestDeletion() {
    if (confirmText !== "确认注销") {
      toast.error("请输入“确认注销”完成二次确认");
      return;
    }
    if (!window.confirm("确认提交账号注销申请？提交后会进入冷静期或管理员处理流程。")) return;
    setRequesting(true);
    try {
      const response = await fetch("/api/account/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_deletion", confirmText, reason, clientRequestId: makeClientRequestId("delete") }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "账号注销申请提交失败");
      setBlockers(Array.isArray(payload.blockers?.reasons) ? payload.blockers.reasons : []);
      toast.success(payload.blockers?.blocked ? "注销申请已提交，但存在阻塞项" : "注销申请已提交");
      setConfirmText("");
      setReason("");
      loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "账号注销申请提交失败");
    } finally {
      setRequesting(false);
    }
  }

  async function cancelDeletion() {
    if (!window.confirm("确认取消当前账号注销申请？")) return;
    setCancelling(true);
    try {
      const response = await fetch("/api/account/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_deletion", clientRequestId: makeClientRequestId("cancel") }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "取消注销申请失败");
      toast.success(`已取消 ${payload.cancelled ?? 0} 个注销申请`);
      loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "取消注销申请失败");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-7 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">隐私设置</h1>
            <p className="mt-1 text-sm text-slate-500">管理个人数据导出、账号注销和数据保留说明。</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSummary} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            重新加载
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-orange-50" />
        ) : (
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-4">
              {[
                ["订单", counts.orders],
                ["充值", counts.recharges],
                ["余额流水", counts.balanceTransactions],
                ["交付记录", counts.deliveries],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border bg-orange-50/40 p-4">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{value ?? "—"}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border p-5">
              <div className="flex items-start gap-3">
                <FileLock2 className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">个人数据导出</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">导出内容包含基本资料、订单摘要、充值记录、余额流水、退款记录、交付摘要和通知记录。不会包含密码、Token、支付密钥、内部备注或其他用户数据。</p>
                  <Button className="mt-4" onClick={exportData} disabled={exporting}>
                    <Download className="mr-2 h-4 w-4" />
                    {exporting ? "生成中..." : "导出个人数据"}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-orange-200 bg-orange-50/30 p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-1 h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">账号注销</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">注销前会校验未完成订单、待处理退款、余额、待交付内容和安全风险。历史订单、支付、余额流水和审计记录会按业务和法定要求保留，个人资料会按规则匿名化。</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={checkDeletion} disabled={checking}>{checking ? "检查中..." : "检查阻塞项"}</Button>
                    {hasActiveDeletion ? <Button variant="outline" onClick={cancelDeletion} disabled={cancelling}>{cancelling ? "取消中..." : "取消注销申请"}</Button> : null}
                  </div>
                  {blockers.length ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <p className="font-medium">当前存在阻塞项：</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {blockers.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
                    <input className="rounded-lg border px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="注销原因或补充说明" />
                    <input className="rounded-lg border px-3 py-2 text-sm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="输入：确认注销" />
                    <Button variant="destructive" onClick={requestDeletion} disabled={requesting}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {requesting ? "提交中..." : "提交注销申请"}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-5">
                <h2 className="text-lg font-semibold">数据保留说明</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">账号注销后，订单、支付、余额流水、退款、交付摘要和审计记录会保留用于财务核对、争议处理和安全审计；邮箱、昵称、头像、电话和常用地址会匿名化。</p>
              </div>
              <div className="rounded-xl border p-5">
                <h2 className="text-lg font-semibold">登录设备与通知</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">当前版本不展示完整设备指纹，也不会导出 Session、Token 或密钥。通知偏好后续接入统一通知系统后在这里配置。</p>
              </div>
            </section>

            <section className="rounded-xl border p-5">
              <h2 className="text-lg font-semibold">最近隐私请求</h2>
              <div className="mt-3 space-y-2">
                {(summary?.recentRequests ?? summary?.requests)?.length ? (summary?.recentRequests ?? summary?.requests ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{item.requestNo}</span>
                    <span>{item.requestType === "data_export" ? "数据导出" : "账号注销"}</span>
                    <span>{STATUS_LABELS[item.status] ?? item.status}</span>
                    <span className="text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : "—"}</span>
                  </div>
                )) : <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">暂无隐私请求</div>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
