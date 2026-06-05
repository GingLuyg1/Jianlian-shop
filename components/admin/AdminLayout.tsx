"use client";

/**
 * AdminLayout - Separate layout for admin dashboard pages
 *
 * Uses AdminSidebar and AdminTopBar instead of public layout components.
 * Main content uses ml-60 offset. Clean SaaS admin dashboard style.
 *
 * Important: Admin should NOT use PublicSidebar, PublicTopInfoBar,
 * or any public layout components.
 */

import { ReactNode } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopBar from "./AdminTopBar";
import AdminGuard from "@/components/auth/AdminGuard";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50">
        {/* Fixed left admin sidebar */}
        <AdminSidebar />

        {/* Main admin content area */}
        <main className="md:ml-60 min-w-0 min-h-screen">
          <AdminTopBar />
          <div className="p-4 md:p-6 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </AdminGuard>
  );
}
