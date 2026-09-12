"use client";

import { ReactNode } from "react";
import AdminGuard from "@/components/auth/AdminGuard";
import AdminSidebar from "./AdminSidebar";
import AdminTopBar from "./AdminTopBar";
import v2Styles from "./v2/AdminV2.module.css";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: ReactNode;
  guard?: boolean;
}

function AdminShell({ children }: AdminLayoutProps) {
  return (
    <div className={cn(v2Styles.scope, "fixed inset-0 flex h-screen max-h-screen min-h-0 w-full overflow-hidden bg-[var(--admin-v2-background)] text-[var(--admin-v2-text-primary)] [--admin-content-padding-x:16px] [--admin-header-height:62px] [--admin-main-offset:204px] [--admin-sidebar-width:204px]")}>
      <div className="hidden h-full w-[var(--admin-main-offset)] shrink-0 lg:flex">
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:[padding-inline:var(--admin-content-padding-x)] lg:py-4">
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
