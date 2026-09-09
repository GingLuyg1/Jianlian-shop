"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, Menu, User } from "lucide-react";

import AdminGlobalSearch from "./AdminGlobalSearch";
import {
  adminNavigationItems,
  getAdminNavigationGroup,
  isAdminNavigationGroupActive,
  isAdminNavigationLinkActive,
  type AdminNavigationGroupKey,
} from "./admin-navigation";
import { toggleNavigationGroup } from "./admin-navigation-state.mjs";
import v2Styles from "./v2/AdminV2.module.css";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function AdminTopBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeGroup = getAdminNavigationGroup(pathname);
  const [openSection, setOpenSection] = useState<AdminNavigationGroupKey | null>(routeGroup);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    setOpenSection(routeGroup);
    setMobileNavigationOpen(false);
  }, [pathname, routeGroup]);

  return (
    <div className="sticky top-0 z-30 flex h-[var(--admin-header-height)] min-w-0 shrink-0 items-center border-b border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] px-3 sm:px-4 lg:px-5">
      <div className="flex min-w-0 w-full items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
            <SheetTrigger asChild>
              <button type="button" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--admin-v2-control-radius)] text-[var(--admin-v2-text-secondary)] transition-colors duration-150 hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] lg:hidden" aria-label="打开后台导航">
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className={cn(v2Styles.scope, "w-64 border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] p-0 text-[var(--admin-v2-text-primary)]")}>
              <SheetTitle className="sr-only">后台导航</SheetTitle>
              <div className="flex h-[var(--admin-header-height)] items-center border-b border-[var(--admin-v2-border)] px-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[var(--admin-v2-control-radius)] bg-[var(--admin-v2-text-primary)] text-xs font-bold text-white">
                    JL
                  </div>
                  <div>
                    <div className="text-sm font-semibold leading-5 text-[var(--admin-v2-text-primary)]">
                      Jianlian Admin
                    </div>
                    <div className="text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">管理后台</div>
                  </div>
                </div>
              </div>
              <nav className="max-h-[calc(100dvh-var(--admin-header-height))] overflow-y-auto px-2.5 py-3" aria-label="移动端后台导航">
                <ul className="space-y-0.5">
                  {adminNavigationItems.map((item) => {
                    const Icon = item.icon;
                    if (item.type === "group") {
                      const active = isAdminNavigationGroupActive(pathname, item);
                      const open = openSection === item.key;
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={`admin-mobile-group-${item.key}`}
                            onClick={() => setOpenSection((current) => toggleNavigationGroup(current, item.key) as AdminNavigationGroupKey | null)}
                            className={cn(
                              "flex min-h-10 w-full items-center gap-2.5 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                              active
                                ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)]"
                                : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0 stroke-[1.75]" />
                            <span className="flex-1">{item.label}</span>
                            <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", open && "rotate-180")} />
                          </button>
                          {open && (
                            <ul className="mt-1 space-y-0.5 border-l border-[var(--admin-v2-border)] pl-6" id={`admin-mobile-group-${item.key}`}>
                              {item.children.map((child) => (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    aria-current={isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view")) ? "page" : undefined}
                                    onClick={() => setMobileNavigationOpen(false)}
                                    className={cn(
                                      "block min-h-10 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-[13px] leading-6 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                                      isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view"))
                                        ? "bg-[var(--admin-v2-selected)] font-medium text-[var(--admin-v2-primary)]"
                                        : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    const active = isAdminNavigationLinkActive(pathname, item.href, searchParams.get("view"));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMobileNavigationOpen(false)}
                          className={cn(
                            "flex min-h-10 items-center gap-2.5 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                            active
                              ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)]"
                              : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 stroke-[1.75]" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </SheetContent>
          </Sheet>

          <AdminGlobalSearch />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden h-9 w-9 cursor-default items-center justify-center text-[var(--admin-v2-text-muted)] sm:flex" role="img" aria-label="通知功能未接入" title="通知功能未接入">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-v2-surface-muted)]">
              <User className="h-4 w-4 text-[var(--admin-v2-text-muted)]" />
            </div>
            <span className="hidden text-xs text-[var(--admin-v2-text-muted)] sm:inline">管理员</span>
          </div>
        </div>
      </div>
    </div>
  );
}
