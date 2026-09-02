"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  adminNavigationItems,
  getAdminNavigationGroup,
  isAdminNavigationGroupActive,
  isAdminNavigationLinkActive,
  type AdminNavigationGroupKey,
} from "./admin-navigation";
import { toggleNavigationGroup } from "./admin-navigation-state.mjs";

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeGroup = getAdminNavigationGroup(pathname);
  const [openSection, setOpenSection] = useState<AdminNavigationGroupKey | null>(routeGroup);

  useEffect(() => {
    setOpenSection(routeGroup);
  }, [pathname, routeGroup]);

  return (
    <aside className="flex h-full w-[var(--admin-sidebar-width)] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-4">
        <Link href="/admin" className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
            JL
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">Jianlian Admin</div>
            <div className="text-xs text-slate-500">管理后台</div>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {adminNavigationItems.map((item) => {
          const Icon = item.icon;
          if (item.type === "group") {
            const active = isAdminNavigationGroupActive(pathname, item);
            const open = openSection === item.key;
            return (
              <div key={item.key}>
                <button
                  type="button"
                  onClick={() => setOpenSection((current) => toggleNavigationGroup(current, item.key) as AdminNavigationGroupKey | null)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="mt-1 space-y-1 pl-6">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-2.5 py-2 text-sm transition-colors",
                          isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view"))
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const active = isAdminNavigationLinkActive(pathname, item.href, searchParams.get("view"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}







