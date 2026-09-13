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
    <aside className="flex h-full w-[var(--admin-sidebar-width)] shrink-0 flex-col overflow-hidden border-r border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)]">
      <div className="flex h-[var(--admin-header-height)] items-center border-b border-[var(--admin-v2-border)] px-4">
        <Link href="/admin" className="flex min-w-0 items-center gap-2 rounded-[var(--admin-v2-control-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-offset-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--admin-v2-control-radius)] bg-[var(--admin-v2-text-primary)] text-xs font-bold text-white">
            JL
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--admin-v2-text-primary)]">Jianlian Admin</div>
            <div className="text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">管理后台</div>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="后台主导航">
        {adminNavigationItems.map((item) => {
          const Icon = item.icon;
          if (item.type === "group") {
            const active = isAdminNavigationGroupActive(pathname, item);
            const open = openSection === item.key;
            return (
              <div key={item.key}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`admin-sidebar-group-${item.key}`}
                  onClick={() => setOpenSection((current) => toggleNavigationGroup(current, item.key) as AdminNavigationGroupKey | null)}
                  className={cn(
                    "flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                    active
                      ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)]"
                      : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 stroke-[1.75]" />
                  <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
                  <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform duration-150", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="mt-1 space-y-0.5 border-l border-[var(--admin-v2-border)] pl-6" id={`admin-sidebar-group-${item.key}`}>
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        aria-current={isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view")) ? "page" : undefined}
                        className={cn(
                          "block min-h-10 min-w-0 truncate rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-[13px] leading-6 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                          isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view"))
                            ? "bg-[var(--admin-v2-selected)] font-medium text-[var(--admin-v2-primary)]"
                            : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
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
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                active ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)]" : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 stroke-[1.75]" />
              <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-[var(--admin-v2-border)] px-3 py-3 text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">
        <span className="font-medium text-[var(--admin-v2-text-secondary)]">Admin V2</span>
        <span className="ml-2">运营工作台</span>
      </div>
    </aside>
  );
}







