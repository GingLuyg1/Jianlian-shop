import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { summarizeEmailError } from "@/lib/email/jobs";
import { getEmailProviderStatus } from "@/lib/email/provider";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

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
  const admin = await getServerAdminContext();
  if (!admin.ok) redirect("/login");
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return <AdminEmailPageState title="无权访问" message="只有超级管理员可以查看邮件发送记录。" />;
  }
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">邮件发送记录</h1>
          <p className="mt-1 text-sm text-slate-500">查询邮件任务、发送状态、失败原因和 Provider 状态，不展示完整收件邮箱或敏感内容。</p>
        </div>
        <Link href="/admin/notifications/email-templates" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          邮件模板
        </Link>
      </div>

      <div className="mb-3 shrink-0 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-800">
        Provider：{provider.provider}；状态：{provider.configured ? "已配置，等待真实适配启用" : `未配置（缺少 ${provider.missing.join(", ") || "配置"}）`}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
          <MailCheck className="h-4 w-4 text-orange-500" />
          最近发送任务
        </div>
        {error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{summarizeEmailError(error)}</div>
        ) : deliveries.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center text-sm text-slate-500">
            <div className="text-base font-semibold text-slate-800">暂无邮件发送记录</div>
            <div className="mt-1">业务事件创建邮件任务后，发送记录会显示在这里。</div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">模板</th>
                  <th className="px-4 py-3">业务</th>
                  <th className="px-4 py-3">收件人</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">尝试</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">错误摘要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatTime(row.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{row.template_code} {row.template_version ? `v${row.template_version}` : ""}</td>
                    <td className="px-4 py-3">{row.business_type || "—"}<div className="text-xs text-slate-500">{row.business_no || "—"}</div></td>
                    <td className="whitespace-nowrap px-4 py-3">{row.recipient_summary}</td>
                    <td className="px-4 py-3">{renderStatus(row.status)}</td>
                    <td className="px-4 py-3">{row.attempts}/{row.max_attempts}</td>
                    <td className="px-4 py-3">{row.provider || "—"}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-slate-500" title={row.last_error_message || ""}>{row.last_error_code || row.last_error_message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminEmailPageState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-lg font-semibold text-slate-950">{title}</div>
        <div className="mt-2 text-sm text-slate-500">{message}</div>
      </div>
    </div>
  );
}

function renderStatus(status: string) {
  const map: Record<string, string> = { pending: "待发送", processing: "发送中", sent: "已发送", retrying: "待重试", failed: "失败", cancelled: "已取消" };
  return map[status] ?? status;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
