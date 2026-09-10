"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, ScrollText, ShieldAlert, ShoppingBag, WalletCards } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { AdminDetailBackLink, AdminRelatedLink, AdminTimeline } from "@/components/admin/v2/AdminDetail";
import { AdminInfoGrid, AdminInfoItem } from "@/components/admin/v2/AdminInfoGrid";
import AdminReadOnlyBadge from "@/components/admin/v2/AdminReadOnlyBadge";
import AdminSection from "@/components/admin/v2/AdminSection";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import v2Styles from "@/components/admin/v2/AdminV2.module.css";
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
    <AdminPageShell title="用户详情" description="只读查看账户、关联业务、风险事件与严格按用户目标过滤的后台审计记录。" actions={<><AdminReadOnlyBadge /><Button className={v2Styles.control} variant="outline" onClick={() => void loadDetail()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button></>}>
      <div className="mb-3 shrink-0"><AdminDetailBackLink href="/admin/users">返回用户管理</AdminDetailBackLink></div>
      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {error ? <AdminErrorState title="用户详情加载失败" description={error} onRetry={() => void loadDetail()} /> : loading && !detail ? <AdminTableSkeleton rows={10} /> : detail && profile ? (
          <div className="space-y-4">
            {detail.schemaReady === false ? <Notice>用户管理兼容合同尚未完全就绪；部分状态只能按安全兼容字段展示。</Notice> : null}
            {detail.errors && Object.keys(detail.errors).length ? <Notice>部分关联数据读取失败：{Object.values(detail.errors).join("、")}</Notice> : null}

            <AdminSection title={profile.email || profile.displayName || "用户账户"} description={profile.id} action={<div className="flex flex-wrap gap-2"><AdminStatusBadge tone={accountTone(profile.accountStatus)}>{ACCOUNT_LABELS[profile.accountStatus] ?? profile.accountStatus}</AdminStatusBadge><AdminStatusBadge tone={riskTone(profile.riskStatus)}>{RISK_LABELS[profile.riskStatus] ?? profile.riskStatus}</AdminStatusBadge></div>}>
              <AdminInfoGrid columns={3}><AdminInfoItem label="当前余额" value={money(detail.summary.balance)} className="tabular-nums" /><AdminInfoItem label="角色" value={profile.role} /><AdminInfoItem label="最近活动" value={formatDate(profile.lastLoginAt)} /></AdminInfoGrid>
            </AdminSection>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                <AdminSection title="基本资料" description="用户身份与账户事实"><AdminInfoGrid columns={3}><AdminInfoItem label="用户 ID" value={profile.id} mono /><AdminInfoItem label="邮箱" value={profile.email ?? "—"} /><AdminInfoItem label="显示名称" value={profile.displayName ?? "—"} /><AdminInfoItem label="角色" value={profile.role} /><AdminInfoItem label="注册时间" value={formatDate(profile.createdAt)} /><AdminInfoItem label="资料更新时间" value={formatDate(profile.updatedAt)} /></AdminInfoGrid></AdminSection>

                <AdminSection title="关联资源" description="使用现有列表筛选查看相关业务"><div className="divide-y divide-[var(--admin-v2-border)] px-4 pb-1 sm:px-5"><AdminRelatedLink icon={<ShoppingBag className="h-4 w-4" />} label="关联订单" detail={profile.email || userId} href={`/admin/orders?search=${relatedSearch}`} /><AdminRelatedLink icon={<CreditCard className="h-4 w-4" />} label="关联支付" detail={profile.email || userId} href={`/admin/payments?search=${relatedSearch}`} /><AdminRelatedLink icon={<WalletCards className="h-4 w-4" />} label="关联充值" detail={profile.email || userId} href={`/admin/recharges?search=${relatedSearch}`} /><AdminRelatedLink icon={<ShieldAlert className="h-4 w-4" />} label="关联风险" detail={userId} href={`/admin/risk?search=${encodeURIComponent(userId)}`} /></div></AdminSection>

                <AdminSection title="最近风险事件" description="最近返回记录 · 非历史总数"><RecordList rows={detail.riskEvents} columns={[["ruleCode", "规则"], ["riskLevel", "等级"], ["riskScore", "分数"], ["businessType", "业务"], ["summary", "摘要"], ["status", "状态"], ["lastSeenAt", "最后发现"]]} detailBase="/admin/risk" /></AdminSection>
                <AdminSection title="最近订单" description="最近 50 条以内 · 非历史总数"><RecordList rows={detail.orders} columns={[["orderNo", "订单号"], ["status", "订单状态"], ["paymentStatus", "支付状态"], ["totalAmount", "金额"], ["createdAt", "创建时间"]]} moneyKeys={["totalAmount"]} /></AdminSection>
                <AdminSection title="最近充值" description="最近 50 条以内 · 非历史总数"><RecordList rows={detail.recharges} columns={[["rechargeNo", "充值单号"], ["channelName", "渠道"], ["amount", "申请金额"], ["creditedAmount", "入账金额"], ["status", "状态"], ["createdAt", "创建时间"]]} moneyKeys={["amount", "creditedAmount"]} /></AdminSection>
                <AdminSection title="最近交付" description="最近 50 条以内 · 只读"><RecordList rows={detail.deliveries} columns={[["deliveryNo", "交付编号"], ["deliveryStatus", "状态"], ["deliveryType", "类型"], ["attemptCount", "尝试次数"], ["createdAt", "创建时间"]]} /></AdminSection>
                <AdminSection title="余额流水" description="最近 50 条以内 · 非历史总数"><RecordList rows={detail.balanceTransactions} columns={[["transactionNo", "流水号"], ["businessType", "业务"], ["direction", "方向"], ["amount", "金额"], ["balanceBefore", "变更前"], ["balanceAfter", "变更后"], ["status", "状态"], ["createdAt", "时间"]]} moneyKeys={["amount", "balanceBefore", "balanceAfter"]} /></AdminSection>
                <AdminSection title="后台审计历史" description="严格限定当前用户目标 · 最近 30 条" action={<Link href={`/admin/audit-logs?targetId=${encodeURIComponent(userId)}`} className="text-sm font-medium text-[var(--admin-v2-primary)] hover:underline">查看全部</Link>}><RecordList rows={detail.auditLogs} columns={[["admin_email", "管理员"], ["action", "操作"], ["result", "结果"], ["request_id", "请求编号"], ["created_at", "时间"]]} icon={<ScrollText className="h-5 w-5" />} /></AdminSection>
              </div>

              <aside className="min-w-0 space-y-4">
                <AdminSection title="账户摘要" description="金额仅汇总当前接口返回的最近记录"><AdminInfoGrid><AdminInfoItem label="充值金额（最近记录）" value={money(detail.summary.totalRecharge)} className="tabular-nums" /><AdminInfoItem label="消费金额（最近记录）" value={money(detail.summary.totalSpend)} className="tabular-nums" /><AdminInfoItem label="当前余额" value={money(detail.summary.balance)} className="tabular-nums" /><AdminInfoItem label="账户 / 风险状态" value={`${ACCOUNT_LABELS[profile.accountStatus] ?? profile.accountStatus} / ${RISK_LABELS[profile.riskStatus] ?? profile.riskStatus}`} /></AdminInfoGrid></AdminSection>
                <AdminSection title="账户状态时间线" description="最近状态变更"><AdminTimeline items={detail.statusHistory.map((row, index) => ({ id: String(row.id ?? index), title: `${safeText(row.old_status)} → ${safeText(row.new_status)}`, time: formatDate(typeof row.created_at === "string" ? row.created_at : null), actor: safeText(row.admin_email), message: safeText(row.reason) }))} empty={<AdminEmptyState title="暂无状态记录" className="min-h-[140px]" />} /></AdminSection>
                <AdminSection title="风险状态时间线" description="最近风险标记变更"><AdminTimeline items={detail.riskRecords.map((row, index) => ({ id: String(row.id ?? index), title: `${safeText(row.old_risk_status)} → ${safeText(row.new_risk_status)}`, time: formatDate(typeof row.created_at === "string" ? row.created_at : null), actor: safeText(row.admin_email), message: safeText(row.reason) }))} empty={<AdminEmptyState title="暂无风险状态记录" className="min-h-[140px]" />} /></AdminSection>
              </aside>
            </div>

            <Notice>本页面不提供余额调整、账户禁用、风险标记、角色修改、密码重置或删除用户操作；这些动作尚未全部满足 V1 安全开放标准。</Notice>
          </div>
        ) : <AdminEmptyState title="用户不存在" />}
      </div>
    </AdminPageShell>
  );
}

function RecordList({ rows, columns, moneyKeys = [], detailBase, icon }: { rows: Row[]; columns: [string, string][]; moneyKeys?: string[]; detailBase?: string; icon?: React.ReactNode }) { if (!rows.length) return <AdminEmptyState icon={icon} title="暂无记录" className="min-h-[160px]" />; return <div className={cn(v2Styles.tableSurface, "mx-4 mb-4 sm:mx-5 sm:mb-5")}><table className="min-w-[760px] text-sm"><thead className="bg-[var(--admin-v2-surface-muted)] text-left text-xs text-[var(--admin-v2-text-muted)]"><tr>{columns.map(([, label]) => <th key={label} className="h-9 whitespace-nowrap px-3 font-medium">{label}</th>)}{detailBase ? <th className="h-9 px-3 font-medium">操作</th> : null}</tr></thead><tbody className="divide-y divide-[var(--admin-v2-border)]">{rows.map((row, index) => <tr key={String(row.id ?? index)} className="hover:bg-[var(--admin-v2-surface-muted)]">{columns.map(([key]) => <td key={key} className={cn("max-w-[320px] whitespace-normal px-3 py-2 text-xs [overflow-wrap:anywhere]", /(?:id|no|request)/i.test(key) && "font-mono")} title={safeText(row[key])}>{renderValue(key, row[key], moneyKeys)}</td>)}{detailBase ? <td className="px-3 py-2"><Link href={`${detailBase}/${String(row.id)}`} className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--admin-v2-primary)] hover:underline sm:min-h-0">查看</Link></td> : null}</tr>)}</tbody></table></div>; }
function Notice({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{children}</div>; }
function renderValue(key: string, value: unknown, moneyKeys: string[]) { if (moneyKeys.includes(key)) return money(value); if (/(?:At|_at)$/.test(key)) return formatDate(typeof value === "string" ? value : null); return safeText(value); }
function safeText(value: unknown) { if (value === null || value === undefined || value === "") return "—"; return typeof value === "string" ? value : String(value); }
function money(value: unknown) { const parsed = Number(value); return `¥${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function accountTone(status: string): AdminStatusTone { if (status === "active") return "success"; if (status === "restricted") return "warning"; if (status === "suspended" || status === "disabled") return "danger"; return "neutral"; }
function riskTone(status: string): AdminStatusTone { if (status === "normal") return "success"; if (status === "watch") return "warning"; if (status === "high_risk" || status === "blocked") return "danger"; return "neutral"; }
