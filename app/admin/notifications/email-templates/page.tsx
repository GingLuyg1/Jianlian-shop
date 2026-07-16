import Link from "next/link";
import { redirect } from "next/navigation";
import { MailPlus } from "lucide-react";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { summarizeEmailError } from "@/lib/email/jobs";

type TemplateRow = {
  id: string;
  template_code: string;
  version: number;
  name: string | null;
  subject_template: string;
  status: string;
  is_current: boolean;
  updated_at: string | null;
  published_at: string | null;
};

export default async function EmailTemplatesPage() {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) redirect("/login");
  const service = getSupabaseServiceRoleClient();
  if (!service) return <AdminEmailPageState title="服务未配置" message="缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取邮件模板。" />;

  const { data, error } = await service
    .from("email_templates")
    .select("id,template_code,version,name,subject_template,status,is_current,updated_at,published_at")
    .order("template_code", { ascending: true })
    .order("version", { ascending: false })
    .limit(80);

  const templates = (data ?? []) as TemplateRow[];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">邮件模板</h1>
          <p className="mt-1 text-sm text-slate-500">管理邮件模板版本。发布操作请通过后台 API，发布后模板内容视为不可变。</p>
        </div>
        <Link href="/admin/notifications/email-deliveries" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          发送记录
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
          <MailPlus className="h-4 w-4 text-orange-500" />
          模板版本列表
        </div>
        {error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{summarizeEmailError(error)}</div>
        ) : templates.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center text-sm text-slate-500">
            <div className="text-base font-semibold text-slate-800">暂无邮件模板</div>
            <div className="mt-1">执行邮件通知 migration 后，可创建草稿模板并发布。</div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">模板代码</th>
                  <th className="px-4 py-3">版本</th>
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">主题</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">当前版本</th>
                  <th className="px-4 py-3">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{template.template_code}</td>
                    <td className="px-4 py-3">v{template.version}</td>
                    <td className="px-4 py-3">{template.name || "—"}</td>
                    <td className="max-w-[420px] truncate px-4 py-3" title={template.subject_template}>{template.subject_template}</td>
                    <td className="px-4 py-3">{renderStatus(template.status)}</td>
                    <td className="px-4 py-3">{template.is_current ? "是" : "否"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatTime(template.updated_at ?? template.published_at)}</td>
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
  const map: Record<string, string> = { draft: "草稿", published: "已发布", archived: "已归档" };
  return map[status] ?? status;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
