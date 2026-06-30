"use client";

import { ReactNode } from "react";
import AdminGuard from "@/components/auth/AdminGuard";
import AdminSidebar from "./AdminSidebar";
import AdminTopBar from "./AdminTopBar";

interface AdminLayoutProps {
  children: ReactNode;
  guard?: boolean;
}

function AdminShell({ children }: AdminLayoutProps) {
  return (
    <div className="fixed inset-0 flex h-screen max-h-screen min-h-0 w-full overflow-hidden bg-slate-100 text-slate-950 [--admin-header-height:62px] [--admin-sidebar-width:235px]">
      <div className="hidden h-full lg:flex">
        <AdminSidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function AdminLayoutSkeleton() {
  return (
    <AdminShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
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
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-slate-100 px-4 py-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-lg bg-slate-100"
              />
            ))}
          </div>
          <div className="min-h-0 flex-1 p-4">
            <div className="min-h-[260px] flex-1 animate-pulse rounded-lg bg-slate-50" />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

export default function AdminLayout({ children, guard = true }: AdminLayoutProps) {
  const shell = <AdminShell>{children}</AdminShell>;

  if (!guard) return shell;

  return <AdminGuard loadingFallback={<AdminLayoutSkeleton />}>{shell}</AdminGuard>;
}
