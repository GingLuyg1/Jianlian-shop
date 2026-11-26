import { businessTypeLabel, statusLabel } from "@/lib/admin/display-labels";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { AdminListSurface, AdminTableViewport, adminListRowClass, adminListTableHeadClass } from "@/components/admin/v2/AdminList";
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

export default async function EmailDeliveriesPage(props: { searchParams?: Promise<{ status?: string; q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?redirect=/admin/notifications/email-deliveries");
    return <AdminEmailPageState title="无访问权限" message={admin.message || "仅超级管理员可查看邮件发送记录。"} />;
  }
  const service = getSupabaseServiceRoleClient();
  if (!service) return <AdminEmailPageState title="服务未配置" message="缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取邮件发送记录。" />;

  const statusFilter = (searchParams?.status ?? "").trim();
  const keyword = (searchParams?.q ?? "").trim().slice(0, 80);
  const pageSize = 30;
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const provider = getEmailProviderStatus();
  let query = service
    .from("email_delivery_jobs")
    .select("id,template_code,template_version,recipient_summary,business_type,business_no,status,attempts,max_attempts,provider,provider_message_id,last_error_code,last_error_message,created_at,sent_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (keyword) {
    const safeKeyword = keyword.replace(/[\\%*(),]/g, " ").trim();
    if (safeKeyword) {
      query = query.or(`business_no.ilike.%${safeKeyword}%,recipient_summary.ilike.%${safeKeyword}%,template_code.ilike.%${safeKeyword}%`);
    }
  }
  const { data, error, count } = await query;
  const deliveries = (data ?? []) as DeliveryRow[];
  const total = count ?? deliveries.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function buildHref(next: { status?: string; q?: string; page?: number }) {
    const params = new URLSearchParams();
    const s = next.status !== undefined ? next.status : statusFilter;
    const q = next.q !== undefined ? next.q : keyword;
    const p = next.page !== undefined ? next.page : 1;
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/notifications/email-deliveries?${qs}` : "/admin/notifications/email-deliveries";
  }

  return (
    <AdminPageShell
      variant="v2"
      title="邮件发送记录"
      description="查询邮件任务、发送状态、失败原因和邮件服务商状态；页面不展示完整邮箱或邮件正文。"
      actions={<Button asChild variant="outline"><Link href="/admin/notifications/email-templates">邮件模板</Link></Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className={cn("shrink-0 rounded-[var(--admin-v2-control-radius)] border px-3 py-2 shadow-none", provider.configured ? "border-[var(--admin-v2-success-foreground)]/20 bg-[var(--admin-v2-success-background)]" : "border-[var(--admin-v2-warning-foreground)]/20 bg-[var(--admin-v2-warning-background)]")}>
          <div className="flex items-center gap-2.5">
            {provider.configured ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">邮件服务商</span>
                <AdminStatusBadge tone="neutral">{statusLabel(provider.provider)}</AdminStatusBadge>
                <AdminStatusBadge tone={provider.configured ? "success" : "warning"}>{provider.configured ? "已配置" : "未配置"}</AdminStatusBadge>
              </div>
              <p className="text-xs text-[var(--admin-v2-text-secondary)]">
                {provider.configured ? provider.message : `缺少配置：${provider.missing.join("、") || "邮件服务商配置"}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <nav aria-label="邮件状态筛选" className="shrink-0 overflow-x-auto">
            <div className="inline-flex min-w-max items-center gap-1 rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] p-1">
              {STATUS_OPTIONS.map(([value, label]) => {
                const active = statusFilter === value;
                return <Link key={value || "all"} href={buildHref({ status: value, page: 1 })} aria-current={active ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-[var(--admin-v2-control-radius)] border border-transparent px-3 text-sm transition-colors", active ? "border-blue-200 bg-[var(--admin-v2-selected)] font-medium text-[var(--admin-v2-primary)]" : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)]")}>{label}</Link>;
              })}
            </div>
          </nav>
          <form action="/admin/notifications/email-deliveries" method="get" className="flex items-center gap-2">
            {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
            <input
              name="q"
              defaultValue={keyword}
              placeholder="搜单号 / 收件人摘要 / 模板"
              className="h-9 w-56 rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] bg-white px-3 text-sm text-slate-800 focus:border-primary focus:outline-none"
            />
            <Button type="submit" size="sm" variant="outline">搜索</Button>
            {keyword ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={buildHref({ q: "", page: 1 })}>清除</Link>
              </Button>
            ) : null}
          </form>
        </div>

        <AdminListSurface>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--admin-v2-border)] px-4 py-3 text-sm font-medium text-[var(--admin-v2-text-primary)]">
          <div className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-[var(--admin-v2-primary)]" />
            最近发送任务
          </div>
          <span className="text-xs font-normal text-[var(--admin-v2-text-muted)]">共 {total} 条 · 第 {page}/{totalPages} 页</span>
        </div>
        {error ? (
          <AdminErrorState
            title="邮件发送记录读取失败"
            description={summarizeEmailError(error)}
            action={<Button asChild variant="outline" size="sm"><Link href={buildHref({ page })}>重新加载</Link></Button>}
          />
        ) : deliveries.length === 0 ? (
          <AdminEmptyState
            icon={<MailCheck className="h-5 w-5" />}
            title={statusFilter || keyword ? "没有符合条件的发送记录" : "暂无邮件发送记录"}
            description={statusFilter || keyword ? "请调整状态或搜索关键词后再试。" : "业务事件创建邮件任务后，发送记录会显示在这里。"}
          />
        ) : (
          <>
          <AdminTableViewport>
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className={adminListTableHeadClass}>
                <tr>
                  <th className="whitespace-nowrap px-3 py-3 text-center">时间</th>
                  <th className="whitespace-nowrap px-3 py-3">模板</th>
                  <th className="whitespace-nowrap px-3 py-3">业务</th>
                  <th className="whitespace-nowrap px-3 py-3">收件人</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center">状态</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center">尝试</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center">邮件服务商</th>
                  <th className="whitespace-nowrap px-3 py-3">错误摘要</th>
                  <th className="sticky right-0 whitespace-nowrap bg-[var(--admin-v2-surface-muted)] px-3 py-3 text-center shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.08)]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-v2-border)]">
                {deliveries.map((row) => (
                  <tr key={row.id} className={adminListRowClass}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs text-[var(--admin-v2-text-muted)]">{formatTime(row.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-[var(--admin-v2-text-primary)]" title={row.template_code}>
                      {statusLabel(row.template_code)}{row.template_version ? <span className="ml-1 text-xs font-normal text-slate-400">v{row.template_version}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{businessTypeLabel(row.business_type)}<div className="font-mono text-xs text-[var(--admin-v2-text-muted)]">{row.business_no || "—"}</div></td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.recipient_summary}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">{renderStatus(row.status)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center tabular-nums">{row.attempts}/{row.max_attempts}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">{row.provider ? statusLabel(row.provider) : "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-[var(--admin-v2-text-muted)]" title={row.last_error_message || ""}>{row.last_error_code || row.last_error_message || "—"}</td>
                    <td className="sticky right-0 whitespace-nowrap bg-white px-3 py-2.5 text-center shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.08)]"><EmailDeliveryActions jobId={row.id} status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableViewport>
          {totalPages > 1 ? (
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--admin-v2-border)] px-4 py-2.5 text-xs text-slate-500">
              <span>共 {total} 条，每页 {pageSize} 条</span>
              <div className="flex items-center gap-2">
                {page > 1 ? <Button asChild size="sm" variant="outline"><Link href={buildHref({ page: page - 1 })}>上一页</Link></Button> : <Button size="sm" variant="outline" disabled>上一页</Button>}
                <span>第 {page} / {totalPages} 页</span>
                {page < totalPages ? <Button asChild size="sm" variant="outline"><Link href={buildHref({ page: page + 1 })}>下一页</Link></Button> : <Button size="sm" variant="outline" disabled>下一页</Button>}
              </div>
            </div>
          ) : null}
          </>
        )}
        </AdminListSurface>
      </div>
    </AdminPageShell>
  );
}

function AdminEmailPageState({ title, message }: { title: string; message: string }) {
  return (
    <AdminPageShell variant="v2" title="邮件发送记录" description="查询邮件任务、发送状态和邮件服务商状态。">
      <AdminErrorState title={title} description={message} />
    </AdminPageShell>
  );
}

function renderStatus(status: string) {
  const map: Record<string, string> = { pending: "待发送", processing: "发送中", sent: "已发送", retrying: "待重试", failed: "失败", cancelled: "已取消" };
  const tone: AdminStatusTone = status === "sent" ? "success" : status === "failed" ? "danger" : status === "cancelled" ? "neutral" : "warning";
  return <AdminStatusBadge tone={tone}>{map[status] ?? statusLabel(status)}</AdminStatusBadge>;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}
