import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { AdminFilterBar, AdminListSurface, AdminTableViewport, adminListRowClass, adminListTableHeadClass } from "@/components/admin/v2/AdminList";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { summarizeEmailError } from "@/lib/email/jobs";
import { getEmailProviderStatus } from "@/lib/email/provider";
import { EmailDeliveryActions } from "@/components/admin/EmailDeliveryActions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  ["", "全部"],
  ["pending", "待发送"],
  ["processing", "发送中"],
  ["sent", "已发送"],
  ["retrying", "待重试"],
  ["failed", "失败"],
  ["cancelled", "已取消"],
] as const;

type DeliveryRow = {
  id: string;
  template_code: string;
  template_version: number | null;
  recipient_summary: string;
  business_type: string | null;
  business_no: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  provider: string | null;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  sent_at: string | null;
};

export default async function EmailDeliveriesPage({ searchParams }: { searchParams?: { status?: string } }) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) redirect("/login");
  const service = getSupabaseServiceRoleClient();
  if (!service) return <AdminEmailPageState title="服务未配置" message="缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取邮件发送记录。" />;

  const provider = getEmailProviderStatus();
  let query = service
    .from("email_delivery_jobs")
    .select("id,template_code,template_version,recipient_summary,business_type,business_no,status,attempts,max_attempts,provider,provider_message_id,last_error_code,last_error_message,created_at,sent_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (searchParams?.status) query = query.eq("status", searchParams.status);
  const { data, error } = await query;
  const deliveries = (data ?? []) as DeliveryRow[];

  return (
    <AdminPageShell
      variant="v2"
      title="邮件发送记录"
      description="查询邮件任务、发送状态、失败原因和 Provider 状态；页面不展示完整邮箱或邮件正文。"
      actions={<Button asChild variant="outline"><Link href="/admin/notifications/email-templates">邮件模板</Link></Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className={cn("shrink-0 rounded-[var(--admin-v2-surface-radius)] border p-4 shadow-none", provider.configured ? "border-[var(--admin-v2-success-foreground)]/20 bg-[var(--admin-v2-success-background)]" : "border-[var(--admin-v2-warning-foreground)]/20 bg-[var(--admin-v2-warning-background)]")}>
          <div className="flex items-start gap-3">
            {provider.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">邮件 Provider</span>
                <AdminStatusBadge tone="neutral">{provider.provider}</AdminStatusBadge>
                <AdminStatusBadge tone={provider.configured ? "success" : "warning"}>{provider.configured ? "已配置" : "未配置"}</AdminStatusBadge>
              </div>
              <p className="mt-1 text-xs text-[var(--admin-v2-text-secondary)]">
                {provider.configured ? provider.message : `缺少配置：${provider.missing.join("、") || "Provider 配置"}`}
              </p>
            </div>
          </div>
        </div>

        <nav aria-label="邮件状态筛选">
        <AdminFilterBar className="flex-row flex-wrap">
          {STATUS_OPTIONS.map(([value, label]) => {
            const active = (searchParams?.status ?? "") === value;
            const href = value ? `/admin/notifications/email-deliveries?status=${value}` : "/admin/notifications/email-deliveries";
            return <Link key={value || "all"} href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-11 items-center rounded-[var(--admin-v2-control-radius)] px-3 text-sm transition-colors sm:h-9", active ? "bg-[var(--admin-v2-primary)] font-medium text-white" : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)]")}>{label}</Link>;
          })}
        </AdminFilterBar>
        </nav>

        <AdminListSurface>
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--admin-v2-border)] px-4 py-3 text-sm font-medium text-[var(--admin-v2-text-primary)]">
          <MailCheck className="h-4 w-4 text-[var(--admin-v2-primary)]" />
          最近发送任务
        </div>
        {error ? (
          <AdminErrorState
            title="邮件发送记录读取失败"
            description={summarizeEmailError(error)}
            action={<Button asChild variant="outline" size="sm"><Link href={searchParams?.status ? `/admin/notifications/email-deliveries?status=${searchParams.status}` : "/admin/notifications/email-deliveries"}>重新加载</Link></Button>}
          />
        ) : deliveries.length === 0 ? (
          <AdminEmptyState
            icon={<MailCheck className="h-5 w-5" />}
            title={searchParams?.status ? "当前状态暂无发送记录" : "暂无邮件发送记录"}
            description={searchParams?.status ? "请选择其他状态查看邮件任务。" : "业务事件创建邮件任务后，发送记录会显示在这里。"}
          />
        ) : (
          <AdminTableViewport>
            <table className="min-w-full text-left text-sm">
              <thead className={adminListTableHeadClass}>
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">模板</th>
                  <th className="px-4 py-3">业务</th>
                  <th className="px-4 py-3">收件人</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">尝试</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">错误摘要</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-v2-border)]">
                {deliveries.map((row) => (
                  <tr key={row.id} className={adminListRowClass}>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--admin-v2-text-muted)]">{formatTime(row.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--admin-v2-text-primary)]">{row.template_code} {row.template_version ? `v${row.template_version}` : ""}</td>
                    <td className="px-4 py-3">{row.business_type || "—"}<div className="text-xs text-[var(--admin-v2-text-muted)]">{row.business_no || "—"}</div></td>
                    <td className="whitespace-nowrap px-4 py-3">{row.recipient_summary}</td>
                    <td className="px-4 py-3">{renderStatus(row.status)}</td>
                    <td className="px-4 py-3">{row.attempts}/{row.max_attempts}</td>
                    <td className="px-4 py-3">{row.provider || "—"}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-[var(--admin-v2-text-muted)]" title={row.last_error_message || ""}>{row.last_error_code || row.last_error_message || "—"}</td>
                    <td className="px-4 py-3"><EmailDeliveryActions jobId={row.id} status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableViewport>
        )}
        </AdminListSurface>
      </div>
    </AdminPageShell>
  );
}

function AdminEmailPageState({ title, message }: { title: string; message: string }) {
  return (
    <AdminPageShell title="邮件发送记录" description="查询邮件任务、发送状态和 Provider 状态。">
      <AdminErrorState title={title} description={message} />
    </AdminPageShell>
  );
}

function renderStatus(status: string) {
  const map: Record<string, string> = { pending: "待发送", processing: "发送中", sent: "已发送", retrying: "待重试", failed: "失败", cancelled: "已取消" };
  const tone: AdminStatusTone = status === "sent" ? "success" : status === "failed" ? "danger" : status === "cancelled" ? "neutral" : "warning";
  return <AdminStatusBadge tone={tone}>{map[status] ?? status}</AdminStatusBadge>;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
