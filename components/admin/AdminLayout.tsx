"use client";

import { ReactNode } from "react";
import AdminGuard from "@/components/auth/AdminGuard";
import AdminSidebar from "./AdminSidebar";
import AdminTopBar from "./AdminTopBar";

interface AdminLayoutProps {
  children: ReactNode;
}

function AdminShell({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 [--admin-header-height:62px] [--admin-sidebar-width:235px]">
      <AdminSidebar />
      <main className="min-h-screen min-w-0 md:ml-[var(--admin-sidebar-width)]">
        <AdminTopBar />
        <div className="w-full px-5 py-5 xl:px-7 2xl:px-8">{children}</div>
      </main>
    </div>
  );
}

function AdminLayoutSkeleton() {
  return (
    <AdminShell>
      <div className="space-y-5">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-3 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
      </div>
    </AdminShell>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminGuard loadingFallback={<AdminLayoutSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
