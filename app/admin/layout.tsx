import { ReactNode } from "react";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { getServerAdminContext } from "@/lib/auth/require-admin";

export default async function Layout({ children }: { children: ReactNode }) {
  const admin = await getServerAdminContext();

  if (!admin.ok) {
    if (admin.status === 401) {
      redirect("/login?redirect=/admin");
    }

    return <AdminAccessDenied message={admin.message} />;
  }

  return <AdminLayout guard={false}>{children}</AdminLayout>;
}

function AdminAccessDenied({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-medium text-red-600">无后台访问权限</p>
        <h1 className="mt-3 text-xl font-bold text-slate-950">无法进入管理后台</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {message || "当前账号没有管理员权限。"}
        </p>
        <a
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          返回首页
        </a>
      </div>
    </div>
  );
}
