"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CreditCard, RefreshCw, ScrollText, ShieldAlert, ShoppingBag, WalletCards } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;
type UserDetail = {
  profile: { id: string; email: string | null; displayName: string | null; role: string; accountStatus: string; riskStatus: string; statusReason: string | null; riskReason: string | null; balance: number; createdAt: string | null; updatedAt: string | null; lastLoginAt: string | null };
  summary: { balance: number; totalRecharge: number; totalSpend: number };
  orders: Row[]; recharges: Row[]; balanceTransactions: Row[]; deliveries: Row[];
  statusHistory: Row[]; riskRecords: Row[]; riskEvents: Row[]; auditLogs: Row[];
  errors?: Record<string, string>; schemaReady?: boolean;
};

const ACCOUNT_LABELS: Record<string, string> = { active: "正常", restricted: "受限", suspended: "暂停", disabled: "禁用" };
const RISK_LABELS: Record<string, string> = { normal: "正常", watch: "关注", high_risk: "高风险", blocked: "拦截" };

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "用户详情加载失败。");
      setDetail(payload as UserDetail);
    } catch (loadError) {
      setDetail(null); setError(loadError instanceof Error ? loadError.message : "用户详情加载失败。");
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);
  const profile = detail?.profile;
  const relatedSearch = encodeURIComponent(profile?.email || userId);

  return (
    <AdminPageShell title="用户详情" description="只读查看账户、关联业务、风险事件与严格按用户目标过滤的后台审计记录。" actions={<Button variant="outline" onClick={() => void loadDetail()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}>
      <div className="mb-3 shrink-0"><Link href="/admin/users" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />返回用户管理</Link></div>
      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {error ? <AdminErrorState title="用户详情加载失败" description={error} onRetry={() => void loadDetail()} /> : loading && !detail ? <AdminTableSkeleton rows={10} /> : detail && profile ? (
          <div className="space-y-4">
            {detail.schemaReady === false ? <Notice>用户管理兼容合同尚未完全就绪；部分状态只能按安全兼容字段展示。</Notice> : null}
            {detail.errors && Object.keys(detail.errors).length ? <Notice>部分关联数据读取失败：{Object.values(detail.errors).join("、")}</Notice> : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Section title="基本资料"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Info label="用户 ID" value={profile.id} mono /><Info label="邮箱" value={profile.email ?? "—"} /><Info label="显示名称" value={profile.displayName ?? "—"} /><Info label="角色" value={profile.role} /><Info label="注册时间" value={formatDate(profile.createdAt)} /><Info label="最近活动" value={formatDate(profile.lastLoginAt)} /><Info label="资料更新时间" value={formatDate(profile.updatedAt)} /></div></Section>
              <Section title="账户摘要"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Info label="充值金额（最近记录）" value={money(detail.summary.totalRecharge)} /><Info label="消费金额（最近记录）" value={money(detail.summary.totalSpend)} /><Info label="当前余额" value={money(detail.summary.balance)} /><Info label="账户 / 风险状态" value={`${ACCOUNT_LABELS[profile.accountStatus] ?? profile.accountStatus} / ${RISK_LABELS[profile.riskStatus] ?? profile.riskStatus}`} /></div></Section>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <RelatedLink icon={ShoppingBag} label="关联订单" href={`/admin/orders?search=${relatedSearch}`} />
              <RelatedLink icon={CreditCard} label="关联支付" href={`/admin/payments?search=${relatedSearch}`} />
              <RelatedLink icon={WalletCards} label="关联充值" href={`/admin/recharges?search=${relatedSearch}`} />
              <RelatedLink icon={ShieldAlert} label="关联风险" href={`/admin/risk?search=${encodeURIComponent(userId)}`} />
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <Section title="账户状态"><div className="grid gap-3 sm:grid-cols-2"><Info label="当前状态" value={ACCOUNT_LABELS[profile.accountStatus] ?? profile.accountStatus} /><Info label="状态原因" value={profile.statusReason ?? "—"} /></div><RecordList rows={detail.statusHistory} columns={[["old_status", "原状态"], ["new_status", "新状态"], ["reason", "原因"], ["admin_email", "管理员"], ["created_at", "时间"]]} /></Section>
              <Section title="风险状态"><div className="grid gap-3 sm:grid-cols-2"><Info label="当前标记" value={RISK_LABELS[profile.riskStatus] ?? profile.riskStatus} /><Info label="标记原因" value={profile.riskReason ?? "—"} /></div><RecordList rows={detail.riskRecords} columns={[["old_risk_status", "原状态"], ["new_risk_status", "新状态"], ["reason", "原因"], ["admin_email", "管理员"], ["created_at", "时间"]]} /></Section>
            </div>

            <Section title="最近风险事件"><RecordList rows={detail.riskEvents} columns={[["ruleCode", "规则"], ["riskLevel", "等级"], ["riskScore", "分数"], ["businessType", "业务"], ["summary", "摘要"], ["status", "状态"], ["lastSeenAt", "最后发现"]]} detailBase="/admin/risk" /></Section>
            <Section title="最近订单"><RecordList rows={detail.orders} columns={[["orderNo", "订单号"], ["status", "订单状态"], ["paymentStatus", "支付状态"], ["totalAmount", "金额"], ["createdAt", "创建时间"]]} moneyKeys={["totalAmount"]} /></Section>
            <Section title="最近充值"><RecordList rows={detail.recharges} columns={[["rechargeNo", "充值单号"], ["channelName", "渠道"], ["amount", "申请金额"], ["creditedAmount", "入账金额"], ["status", "状态"], ["createdAt", "创建时间"]]} moneyKeys={["amount", "creditedAmount"]} /></Section>
            <Section title="余额流水"><RecordList rows={detail.balanceTransactions} columns={[["transactionNo", "流水号"], ["businessType", "业务"], ["direction", "方向"], ["amount", "金额"], ["balanceBefore", "变更前"], ["balanceAfter", "变更后"], ["status", "状态"], ["createdAt", "时间"]]} moneyKeys={["amount", "balanceBefore", "balanceAfter"]} /></Section>
            <Section title="后台审计历史" action={<Link href={`/admin/audit-logs?targetId=${encodeURIComponent(userId)}`} className="text-sm font-medium text-primary hover:underline">查看全部</Link>}><RecordList rows={detail.auditLogs} columns={[["admin_email", "管理员"], ["action", "操作"], ["result", "结果"], ["request_id", "请求编号"], ["created_at", "时间"]]} icon={<ScrollText className="h-5 w-5" />} /></Section>

            <Notice>本页面不提供余额调整、账户禁用、风险标记、角色修改、密码重置或删除用户操作；这些动作尚未全部满足 V1 安全开放标准。</Notice>
          </div>
        ) : <AdminEmptyState title="用户不存在" />}
      </div>
    </AdminPageShell>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-950">{title}</h2>{action}</div>{children}</section>; }
function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className={cn("mt-1 break-all text-sm font-medium text-slate-900", mono && "font-mono text-xs")}>{value}</div></div>; }
function RelatedLink({ icon: Icon, label, href }: { icon: typeof ShoppingBag; label: string; href: string }) { return <Link href={href} className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/30 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-center gap-3"><span className="rounded-lg bg-slate-100 p-2 text-slate-500 group-hover:text-primary"><Icon className="h-4 w-4" /></span><span className="font-medium text-slate-900">{label}</span></div><span className="text-sm text-slate-500">查看</span></Link>; }
function RecordList({ rows, columns, moneyKeys = [], detailBase, icon }: { rows: Row[]; columns: [string, string][]; moneyKeys?: string[]; detailBase?: string; icon?: React.ReactNode }) { if (!rows.length) return <AdminEmptyState icon={icon} title="暂无记录" className="min-h-[160px]" />; return <div className="overflow-auto rounded-lg border border-slate-200"><table className="min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{columns.map(([, label]) => <th key={label} className="h-9 whitespace-nowrap px-3 font-medium">{label}</th>)}{detailBase ? <th className="h-9 px-3 font-medium">操作</th> : null}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(([key]) => <td key={key} className="max-w-[280px] truncate whitespace-nowrap px-3 py-2 text-xs" title={safeText(row[key])}>{renderValue(key, row[key], moneyKeys)}</td>)}{detailBase ? <td className="px-3 py-2"><Link href={`${detailBase}/${String(row.id)}`} className="text-xs font-medium text-primary hover:underline">查看</Link></td> : null}</tr>)}</tbody></table></div>; }
function Notice({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{children}</div>; }
function renderValue(key: string, value: unknown, moneyKeys: string[]) { if (moneyKeys.includes(key)) return money(value); if (/(?:At|_at)$/.test(key)) return formatDate(typeof value === "string" ? value : null); return safeText(value); }
function safeText(value: unknown) { if (value === null || value === undefined || value === "") return "—"; return typeof value === "string" ? value : String(value); }
function money(value: unknown) { const parsed = Number(value); return `¥${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
