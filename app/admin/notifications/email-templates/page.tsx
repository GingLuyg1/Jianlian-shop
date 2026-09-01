import { redirect } from "next/navigation";

import AdminEmailTemplatesWorkspace from "@/components/admin/email/AdminEmailTemplatesWorkspace";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export default async function EmailTemplatesPage() {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) redirect("/login");

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return (
      <AdminPageShell title="邮件模板" description="创建、维护和发布邮件模板版本。">
        <AdminErrorState title="服务未配置" description="缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取邮件模板。" />
      </AdminPageShell>
    );
  }

  return <AdminEmailTemplatesWorkspace />;
}
