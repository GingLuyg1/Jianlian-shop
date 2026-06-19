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
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-950 [--admin-header-height:62px] [--admin-sidebar-width:235px]">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:ml-[var(--admin-sidebar-width)]">
        <AdminTopBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function AdminLayoutSkeleton() {
  return (
    <AdminShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 xl:px-6 2xl:px-7">
        <div className="mb-3 shrink-0">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="grid shrink-0 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
            />
          ))}
        </div>
        <div className="mt-3 min-h-0 flex-1 animate-pulse rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
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
