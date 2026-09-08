"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  requested: "已提交", verifying: "校验中", blocked: "有阻塞项", approved: "已批准",
  processing: "处理中", completed: "已完成", cancelled: "已取消", failed: "失败",
};
const TYPE_LABELS: Record<string, string> = { data_export: "数据导出", account_deletion: "账号注销" };

type Row = Record<string, unknown>;
type PrivacyDetail = {
  request: {
    id: string; requestNo: string; userId: string; userEmail: string | null; userLabel: string;
    requestType: string; status: string; reasonDetail: string | null; blockReasons: string[];
    reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null;
    createdAt: string | null; updatedAt: string | null; cooldownUntil: string | null;
    completedAt: string | null; cancelledAt: string | null; failedAt: string | null;
  };
  events: Row[];
  auditLogs: Row[];
  errors?: Record<string, string>;
};

export default function AdminPrivacyRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [detail, setDetail] = useState<PrivacyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/privacy-requests/" + requestId, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "隐私请求详情加载失败。");
      setDetail(payload as PrivacyDetail);
    } catch (loadError) {
      setDetail(null);
      setError(loadError instanceof Error ? loadError.message : "隐私请求详情加载失败。");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);
  const item = detail?.request;
  const relatedSearch = encodeURIComponent(item?.userEmail || item?.userId || "");

  return (
    <AdminPageShell
      title="隐私请求详情"
      description="只读查看请求摘要、用户关联、最近处理时间线和严格匹配的后台审计。"
      actions={<Button variant="outline" onClick={() => void loadDetail()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}
    >
      <div className="mb-3 shrink-0"><Link href="/admin/privacy-requests" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />返回隐私请求</Link></div>
      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {error ? <AdminErrorState title="隐私请求详情加载失败" description={error} onRetry={() => void loadDetail()} /> : loading && !detail ? <AdminTableSkeleton rows={10} /> : detail && item ? (
          <div className="space-y-4">
            {detail.errors && Object.keys(detail.errors).length ? <Notice>部分关联数据读取失败：{Object.values(detail.errors).join("、")}</Notice> : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Section title="请求摘要">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="请求编号" value={item.requestNo || "—"} />
                  <Info label="请求 ID" value={item.id} mono />
                  <Info label="请求类型" value={TYPE_LABELS[item.requestType] ?? item.requestType} />
                  <Info label="当前状态" value={STATUS_LABELS[item.status] ?? item.status} />
                  <Info label="提交时间" value={formatDate(item.createdAt)} />
                  <Info label="最近更新" value={formatDate(item.updatedAt)} />
                  <Info label="预计处理时间" value={formatDate(item.cooldownUntil)} />
                  <Info label="处理人 ID" value={item.reviewedBy || "—"} mono />
                  <Info label="审核时间" value={formatDate(item.reviewedAt)} />
                  <Info label="完成 / 关闭时间" value={formatDate(item.completedAt || item.cancelledAt || item.failedAt)} />
                </div>
              </Section>
              <Section title="用户摘要">
                <div className="space-y-3">
                  <Info label="用户" value={item.userEmail || item.userLabel || "—"} />
                  <Info label="用户 ID" value={item.userId || "—"} mono />
                  {item.userId ? <Button asChild variant="outline" className="w-full"><Link href={"/admin/users/" + item.userId}>查看用户详情</Link></Button> : null}
                </div>
              </Section>
            </div>

            <Section title="运营信息">
              <div className="grid gap-3 md:grid-cols-3">
                <Info label="用户申请说明" value={item.reasonDetail || "—"} />
                <Info label="阻塞原因" value={item.blockReasons.length ? item.blockReasons.join("；") : "—"} />
                <Info label="审核备注" value={item.reviewNote || "—"} />
              </div>
            </Section>

            {item.userId ? (
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <RelatedLink label="关联订单" href={"/admin/orders?search=" + relatedSearch} />
                <RelatedLink label="关联支付" href={"/admin/payments?search=" + relatedSearch} />
                <RelatedLink label="关联充值" href={"/admin/recharges?search=" + relatedSearch} />
                <RelatedLink label="关联退款" href={"/admin/refunds?search=" + relatedSearch} />
              </section>
            ) : null}

            <Section title="最近处理时间线">
              <RecordList rows={detail.events} columns={[["eventType", "事件"], ["actorType", "执行方"], ["message", "说明"], ["createdAt", "时间"]]} />
            </Section>
            <Section title="最近后台审计" action={<Link href={"/admin/audit-logs?targetId=" + encodeURIComponent(item.id)} className="text-sm font-medium text-primary hover:underline">查看全部</Link>}>
              <RecordList rows={detail.auditLogs} columns={[["admin_email", "管理员"], ["action", "操作"], ["result", "结果"], ["request_id", "请求编号"], ["reason", "原因"], ["created_at", "时间"]]} />
            </Section>
            <Notice>本页面不执行数据导出、账号删除或匿名化，也不修改隐私请求状态。订单、支付、充值、退款与资金流水按既有保留规则处理。</Notice>
          </div>
        ) : <AdminEmptyState title="隐私请求不存在" />}
      </div>
    </AdminPageShell>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-950">{title}</h2>{action}</div>{children}</section>;
}
function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className={cn("mt-1 break-words text-sm font-medium text-slate-900", mono && "break-all font-mono text-xs")}>{value}</div></div>;
}
function RelatedLink({ label, href }: { label: string; href: string }) {
  return <Link href={href} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 font-medium text-slate-900 shadow-sm transition hover:border-primary/30 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span>{label}</span><span className="text-sm font-normal text-slate-500">查看</span></Link>;
}
function RecordList({ rows, columns }: { rows: Row[]; columns: [string, string][] }) {
  if (!rows.length) return <AdminEmptyState title="暂无记录" className="min-h-[160px]" />;
  return <div className="overflow-auto rounded-lg border border-slate-200"><table className="min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{columns.map(([, label]) => <th key={label} className="h-9 whitespace-nowrap px-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(([key]) => <td key={key} className="max-w-[320px] truncate whitespace-nowrap px-3 py-2 text-xs" title={safeText(row[key])}>{renderValue(key, row[key])}</td>)}</tr>)}</tbody></table></div>;
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{children}</div>;
}
function renderValue(key: string, value: unknown) {
  return /(?:At|_at)$/.test(key) ? formatDate(typeof value === "string" ? value : null) : safeText(value);
}
function safeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" ? value : String(value);
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
