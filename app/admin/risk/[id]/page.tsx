"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  RefreshCcw,
  ScrollText,
  ShieldAlert,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { AdminDetailBackLink, AdminRelatedLink, AdminTimeline } from "@/components/admin/v2/AdminDetail";
import { AdminInfoGrid, AdminInfoItem } from "@/components/admin/v2/AdminInfoGrid";
import AdminReadOnlyBadge from "@/components/admin/v2/AdminReadOnlyBadge";
import AdminSection from "@/components/admin/v2/AdminSection";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import {
  booleanLabel,
  businessTypeLabel,
  detailLabel,
  riskActionLabel,
  riskMetadataKeyLabel,
  riskRuleLabel,
  statusLabel,
} from "@/lib/admin/display-labels";
import { cn } from "@/lib/utils";

type RiskReview = {
  id: string;
  status: string;
  decision: string;
  reason: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
type RiskDetail = {
  id: string;
  ruleCode: string;
  riskLevel: string;
  riskScore: number;
  recommendedAction: string;
  businessType: string;
  businessId: string | null;
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  requestId: string | null;
  sourceHash: string | null;
  summary: string;
  status: string;
  occurrences: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  reviews: RiskReview[];
};
type AuditLog = {
  id: string;
  target_id: string | null;
  admin_email: string | null;
  action: string;
  result: string;
  request_id: string;
  error_message: string | null;
  created_at: string;
};

export default function AdminRiskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<RiskDetail | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showRawMetadata, setShowRawMetadata] = useState(false);

  const loadEvent = useCallback(async () => {
    setLoading(true);
    setError("");
    setAuditError("");
    try {
      const [eventRes, auditRes] = await Promise.allSettled([
        fetch(`/api/admin/risk/${id}`, { cache: "no-store" }),
        fetch(`/api/admin/audit-logs?targetId=${encodeURIComponent(id)}&pageSize=50`, { cache: "no-store" }),
      ]);

      if (eventRes.status === "fulfilled") {
        const payload = await eventRes.value.json().catch(() => ({}));
        if (!eventRes.value.ok) throw new Error(payload.error || "风险事件读取失败");
        setEvent(payload.event ?? null);
      } else {
        throw eventRes.reason;
      }

      if (auditRes.status === "fulfilled") {
        const payload = await auditRes.value.json().catch(() => ({}));
        if (!auditRes.value.ok) {
          setAuditError(payload.error || "审计日志读取失败");
          setAudits([]);
        } else {
          setAudits(Array.isArray(payload.logs) ? payload.logs.filter((log: AuditLog) => log.target_id === id) : []);
        }
      } else {
        setAuditError("审计日志读取失败");
        setAudits([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "风险事件读取失败");
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1800);
    } catch {
      // Ignore clipboard failures on insecure contexts.
    }
  }

  const userSummary = event ? formatUserLabel(event) : "—";
  const metadataEntries = event ? Object.entries(event.metadata) : [];

  return (
    <AdminPageShell
      variant="v2"
      title="风险事件详情"
      description="查看风控命中原因、关联用户账号、时间线和后台审计记录。"
      actions={
        <div className="flex items-center gap-2">
          <AdminReadOnlyBadge />
          <Button variant="outline" onClick={() => void loadEvent()} disabled={loading}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "刷新中..." : "刷新"}
          </Button>
        </div>
      }
    >
      <div className="mb-3 shrink-0">
        <AdminDetailBackLink href="/admin/risk">返回风险审核中心</AdminDetailBackLink>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <AdminErrorState title="风险事件加载失败" description={error} onRetry={() => void loadEvent()} />
        ) : loading && !event ? (
          <AdminTableSkeleton rows={8} />
        ) : event ? (
          <div className="space-y-4 pb-4">
            <AdminSection
              title={riskRuleLabel(event.ruleCode)}
              description={`规则代码：${event.ruleCode} · 事件编号：${event.id}`}
              action={
                <AdminStatusBadge tone={riskTone(event.riskLevel)}>
                  {statusLabel(event.riskLevel)} · {event.riskScore} 分
                </AdminStatusBadge>
              }
            >
              <AdminInfoGrid columns={3}>
                <AdminInfoItem label="触发说明" value={event.summary} className="sm:col-span-2" />
                <AdminInfoItem
                  label="当前状态"
                  value={<AdminStatusBadge tone={statusTone(event.status)}>{statusLabel(event.status)}</AdminStatusBadge>}
                />
                <AdminInfoItem label="业务类型" value={businessTypeLabel(event.businessType)} />
                <AdminInfoItem label="命中次数" value={`${event.occurrences} 次`} className="tabular-nums" />
                <AdminInfoItem
                  label="系统建议动作"
                  value={
                    <AdminStatusBadge tone={actionTone(event.recommendedAction)}>
                      {riskActionLabel(event.recommendedAction)}
                    </AdminStatusBadge>
                  }
                />
              </AdminInfoGrid>
            </AdminSection>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                <AdminSection title="风险事实与关联用户" description="可直接核对触发该告警的用户邮箱、订单/支付号和来源信息">
                  <AdminInfoGrid columns={3}>
                    <AdminInfoItem
                      label="关联用户"
                      className="sm:col-span-2"
                      value={
                        event.userId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 break-all">{userSummary}</div>
                              <div className="mt-0.5 font-mono text-[11px] text-slate-400">ID: {event.userId}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {event.userEmail ? (
                                <button
                                  type="button"
                                  onClick={() => void copyText("email", event.userEmail!)}
                                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  {copiedKey === "email" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                  {copiedKey === "email" ? "已复制邮箱" : "复制邮箱"}
                                </button>
                              ) : null}
                              <Link
                                href={`/admin/users/${encodeURIComponent(event.userId)}`}
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              >
                                查看用户详情
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </div>
                        ) : (
                          "未登录访客 / 无关联用户"
                        )
                      }
                    />
                    <AdminInfoItem label="业务编号" value={event.businessId ?? "—"} mono />
                    <AdminInfoItem label="来源特征指纹" value={event.sourceHash ?? "—"} mono />
                    <AdminInfoItem label="请求编号" value={event.requestId ?? "—"} mono />
                    <AdminInfoItem label="限制过期时间" value={formatDate(event.expiresAt)} />
                  </AdminInfoGrid>
                </AdminSection>

                <AdminSection title="关联资源" description="一键进入对应后台详情页核查该用户、交易或请求链路">
                  <div className="divide-y divide-[var(--admin-v2-border)] px-4 pb-1 sm:px-5">
                    {event.userId ? (
                      <AdminRelatedLink
                        icon={<UserRound className="h-4 w-4" />}
                        label="查看该用户档案与订单历史"
                        detail={event.userEmail ? `${userSummary}（ID: ${shortId(event.userId)}）` : `用户 ID：${event.userId}`}
                        href={`/admin/users/${encodeURIComponent(event.userId)}`}
                      />
                    ) : null}
                    {businessHref(event) && event.businessId ? (
                      <AdminRelatedLink
                        icon={businessIcon(event.businessType)}
                        label={`查看关联${businessTypeLabel(event.businessType)}`}
                        detail={event.businessId}
                        href={businessHref(event)!}
                      />
                    ) : null}
                    {event.requestId ? (
                      <AdminRelatedLink
                        icon={<ScrollText className="h-4 w-4" />}
                        label="查看完整请求链路"
                        detail={event.requestId}
                        href={`/admin/system/request-traces/${encodeURIComponent(event.requestId)}`}
                      />
                    ) : null}
                  </div>
                </AdminSection>

                <AdminSection
                  title="安全元数据"
                  description="敏感字段已由服务端自动脱敏，仅展示风险排查所需的上下文信息。"
                  action={
                    metadataEntries.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-slate-500"
                        onClick={() => setShowRawMetadata((prev) => !prev)}
                      >
                        {showRawMetadata ? "切换可读视图" : "查看原始 JSON"}
                      </Button>
                    ) : null
                  }
                >
                  {metadataEntries.length ? (
                    showRawMetadata ? (
                      <pre className="mx-4 mb-4 max-h-80 overflow-auto rounded-[var(--admin-v2-control-radius)] bg-slate-950 p-4 text-xs leading-5 text-slate-100 sm:mx-5 sm:mb-5">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    ) : (
                      <div className="mx-4 mb-4 grid gap-2 sm:mx-5 sm:mb-5 sm:grid-cols-2">
                        {metadataEntries.map(([key, value]) => (
                          <div
                            key={key}
                            className="flex flex-col justify-between gap-1 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-sm"
                          >
                            <span className="text-xs text-slate-500">{riskMetadataKeyLabel(key)}</span>
                            <span className="break-all font-medium text-slate-900">{formatMetadataValue(key, value)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <AdminEmptyState title="暂无安全元数据" className="min-h-[160px]" />
                  )}
                </AdminSection>

                <AdminSection
                  title="后台审计日志"
                  description="严格限定当前风险事件目标 · 最近 50 条"
                  action={
                    <Link
                      href={`/admin/audit-logs?targetId=${encodeURIComponent(event.id)}`}
                      className="text-sm font-medium text-[var(--admin-v2-primary)] hover:underline"
                    >
                      查看全部
                    </Link>
                  }
                >
                  {auditError ? (
                    <AdminErrorState title="审计日志不可用" description={auditError} className="mx-4 mb-4 min-h-[160px] sm:mx-5 sm:mb-5" />
                  ) : audits.length ? (
                    <div className="mx-4 mb-4 divide-y divide-[var(--admin-v2-border)] border-y border-[var(--admin-v2-border)] sm:mx-5 sm:mb-5">
                      {audits.map((audit) => (
                        <div key={audit.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_160px]">
                          <div className="min-w-0">
                            <div className="font-medium text-[var(--admin-v2-text-primary)]">
                              {detailLabel(audit.action)} · {statusLabel(audit.result)}
                            </div>
                            <div className="mt-1 break-all text-xs text-[var(--admin-v2-text-muted)]">
                              {audit.admin_email ?? "未知管理员"} · 请求 {audit.request_id}
                            </div>
                            {audit.error_message ? (
                              <div className="mt-1 text-xs text-[var(--admin-v2-danger-foreground)]">{audit.error_message}</div>
                            ) : null}
                          </div>
                          <div className="text-xs tabular-nums text-[var(--admin-v2-text-muted)] sm:text-right">
                            {formatDate(audit.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <AdminEmptyState
                      icon={<ScrollText className="h-5 w-5" />}
                      title="暂无关联审计日志"
                      description="当前没有以该风险事件为目标的后台操作记录。"
                      className="min-h-[180px]"
                    />
                  )}
                </AdminSection>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-warning-foreground)]/20 bg-[var(--admin-v2-warning-background)] p-4">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--admin-v2-warning-foreground)]" />
                    <div>
                      <h2 className="font-semibold text-[var(--admin-v2-text-primary)]">当前为只读审核</h2>
                      <p className="mt-1 text-sm leading-6 text-[var(--admin-v2-text-secondary)]">
                        现有审核写入不具备事务原子性、幂等和并发保护，因此不开放批准、拒绝、观察或解除按钮。如需处理异常账号，请点击左侧“查看用户详情”核查后再处理。
                      </p>
                    </div>
                  </div>
                </div>
                <AdminSection title="状态时间线" description="风险生命周期与已有审核记录">
                  <AdminTimeline
                    items={riskTimeline(event)}
                    empty={<AdminEmptyState title="暂无状态记录" className="min-h-[140px]" />}
                  />
                </AdminSection>
              </aside>
            </div>
          </div>
        ) : (
          <AdminEmptyState title="风险事件不存在" />
        )}
      </div>
    </AdminPageShell>
  );
}

function formatUserLabel(event: RiskDetail) {
  if (event.userEmail && event.userDisplayName && event.userDisplayName !== event.userEmail) {
    return `${event.userDisplayName}（${event.userEmail}）`;
  }
  if (event.userEmail) return event.userEmail;
  if (event.userDisplayName) return event.userDisplayName;
  return event.userId ?? "—";
}

function formatMetadataValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return booleanLabel(value);
  if (typeof value === "string") {
    if (key.toLowerCase().includes("channel") || key.toLowerCase().includes("method")) {
      const channels: Record<string, string> = {
        alipay: "支付宝",
        wechat: "微信支付",
        usdt_bep20: "USDT-BEP20",
        usdt_trc20: "USDT-TRC20",
        balance: "余额支付",
      };
      return channels[value] ?? value;
    }
    return value;
  }
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…`;
}

function businessHref(event: RiskDetail) {
  if (!event.businessId) return undefined;
  const search = encodeURIComponent(event.businessId);
  if (event.businessType === "order") return `/admin/orders?search=${search}`;
  if (event.businessType === "payment") return `/admin/payments?search=${search}`;
  if (event.businessType === "recharge") return `/admin/recharges?search=${search}`;
  if ((event.businessType === "account" || event.businessType === "login") && event.userId) {
    return `/admin/users/${encodeURIComponent(event.userId)}`;
  }
  return undefined;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function riskTone(level: string): AdminStatusTone {
  return level === "critical" || level === "high" ? "danger" : level === "medium" ? "warning" : "success";
}

function actionTone(action: string): AdminStatusTone {
  if (action === "deny" || action === "block" || action === "temporarily_block" || action === "temporarily_restrict") return "danger";
  if (action === "require_review" || action === "allow_with_monitoring") return "warning";
  return "success";
}

function statusTone(status: string): AdminStatusTone {
  return status === "resolved" || status === "closed" ? "success" : status === "open" || status === "pending" ? "warning" : "neutral";
}

function businessIcon(type: string) {
  if (type === "order") return <ShoppingBag className="h-4 w-4" />;
  if (type === "payment") return <CreditCard className="h-4 w-4" />;
  if (type === "recharge") return <WalletCards className="h-4 w-4" />;
  return <ShieldAlert className="h-4 w-4" />;
}

function riskTimeline(event: RiskDetail) {
  return [
    { id: "created", title: "风险事件创建", time: formatDate(event.createdAt) },
    { id: "first", title: "首次发现", time: formatDate(event.firstSeenAt) },
    { id: "last", title: "最后发现", time: formatDate(event.lastSeenAt) },
    ...event.reviews.map((review) => ({
      id: review.id,
      title: `${detailLabel(review.decision)} · ${statusLabel(review.status)}`,
      time: formatDate(review.reviewedAt),
      actor: review.reviewedBy ? `管理员 ${shortId(review.reviewedBy)}` : undefined,
      message: review.reason,
    })),
    ...(event.resolvedAt ? [{ id: "resolved", title: "事件结束", time: formatDate(event.resolvedAt) }] : []),
    { id: "updated", title: "最近更新", time: formatDate(event.updatedAt) },
  ];
}
