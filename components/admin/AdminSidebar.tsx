"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import glass from "./v2/AdminPremiumGlass.module.css";
import {
  adminNavigationItems,
  getAdminNavigationGroup,
  isAdminNavigationGroupActive,
  isAdminNavigationLinkActive,
  type AdminNavigationGroupKey,
} from "./admin-navigation";
import { toggleNavigationGroup } from "./admin-navigation-state.mjs";

const DEMO_APP_IDS = new Set(["APP_1732204801", "APP_1732203920", "APP_1732198000"]);

let lastAdminSliderGeometry: { top: number; left: number; width: number; height: number } | null = null;

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const productView = searchParams.get("view");
  const agentTab = searchParams.get("tab");
  const routeGroup = getAdminNavigationGroup(pathname);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    routeGroup ? { [routeGroup]: true } : {}
  );
  const [pendingBadges, setPendingBadges] = useState<{
    apiApplications: number;
    tickets: number;
  }>({
    apiApplications: 0,
    tickets: 0,
  });

  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  const syncPendingBadges = useCallback(() => {
    if (typeof window === "undefined") return;
    let apiPending = 0;
    let ticketPending = 0;
    try {
      const rawApps = window.localStorage.getItem("jianlian_admin_api_applications");
      if (rawApps) {
        const parsed = JSON.parse(rawApps);
        if (Array.isArray(parsed)) {
          apiPending = parsed.filter(
            (item: any) => item && !DEMO_APP_IDS.has(item.id) && item.status === "pending"
          ).length;
        }
      }
    } catch {}

    try {
      const rawTickets = window.localStorage.getItem("jianlian_shop_tickets_v1");
      if (rawTickets) {
        const parsed = JSON.parse(rawTickets);
        if (Array.isArray(parsed)) {
          ticketPending = parsed.filter(
            (t: any) => t && t.status !== "completed" && t.status !== "replied"
          ).length;
        }
      }
    } catch {}

    setPendingBadges({
      apiApplications: apiPending,
      tickets: ticketPending,
    });
  }, []);

  useEffect(() => {
    syncPendingBadges();
    const onStorage = () => syncPendingBadges();
    window.addEventListener("storage", onStorage);
    window.addEventListener("jianlian-admin-badges-updated", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("jianlian-admin-badges-updated", onStorage);
    };
  }, [syncPendingBadges, pathname, agentTab]);

  useEffect(() => {
    if (routeGroup) {
      setOpenSections((prev) => ({ ...prev, [routeGroup]: true }));
    }
  }, [pathname, routeGroup]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;

    const updateIndicator = () => {
      const activeLink =
        nav.querySelector<HTMLElement>('[aria-current="page"]') ??
        nav.querySelector<HTMLElement>('[data-group-active="true"]');
      if (!activeLink) {
        indicator.dataset.visible = "false";
        delete nav.dataset.slidingReady;
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const linkBox = activeLink.getBoundingClientRect();
      if (navBox.width === 0 || linkBox.width === 0) return;

      const target = {
        top: linkBox.top - navBox.top + nav.scrollTop,
        left: linkBox.left - navBox.left + nav.scrollLeft,
        width: linkBox.width,
        height: linkBox.height,
      };

      const applyGeo = (geo: typeof target) => {
        indicator.style.transform = `translate3d(${geo.left}px, ${geo.top}px, 0)`;
        indicator.style.width = `${geo.width}px`;
        indicator.style.height = `${geo.height}px`;
      };

      if (indicator.dataset.ready !== "true") {
        indicator.style.transition = "none";
        applyGeo(lastAdminSliderGeometry ?? target);
        indicator.getBoundingClientRect();
        indicator.style.transition = "";
        indicator.dataset.ready = "true";
      }

      applyGeo(target);
      indicator.dataset.visible = "true";
      nav.dataset.slidingReady = "true";
      lastAdminSliderGeometry = target;
    };

    updateIndicator();
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(nav);
    return () => {
      ro.disconnect();
    };
  }, [pathname, productView, agentTab, openSections]);

  const getGroupBadgeCount = (key: AdminNavigationGroupKey) => {
    if (key === "agents") return pendingBadges.apiApplications;
    if (key === "users") return pendingBadges.tickets;
    return 0;
  };

  const getChildBadgeCount = (href: string) => {
    if (href === "/admin/agents?tab=applications") return pendingBadges.apiApplications;
    if (href === "/admin/tickets") return pendingBadges.tickets;
    return 0;
  };

  return (
    <aside data-admin-shell-sidebar className="flex h-full w-[var(--admin-sidebar-width)] shrink-0 flex-col overflow-hidden border-r border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)]">
      <div className="flex h-[var(--admin-header-height)] items-center border-b border-[var(--admin-v2-border)] px-4">
        <Link prefetch={false} href="/admin" className="flex min-w-0 items-center gap-2 rounded-[var(--admin-v2-control-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-offset-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--admin-v2-control-radius)] bg-[var(--admin-v2-text-primary)] text-xs font-bold text-white">
            JL
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--admin-v2-text-primary)]">Jianlian 运营后台</div>
            <div className="text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">管理后台</div>
          </div>
        </Link>
      </div>

      <nav ref={navRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="后台主导航">
        <span ref={indicatorRef} aria-hidden="true" className={glass.sidebarSlideIndicator} />
        {adminNavigationItems.map((item) => {
          const Icon = item.icon;
          if (item.type === "group") {
            const active = isAdminNavigationGroupActive(pathname, item);
            const openSection = openSections[item.key] ? item.key : null;
            const open = openSection === item.key;
            const groupBadge = getGroupBadgeCount(item.key);
            return (
              <div key={item.key}>
                <button
                  type="button"
                  aria-expanded={open}
                  data-group-active={active && !open ? "true" : undefined}
                  aria-controls={`admin-sidebar-group-${item.key}`}
                  onClick={() =>
                    setOpenSections((prev) => {
                      const current = prev[item.key] ? item.key : null;
                      const nextGroup = toggleNavigationGroup(current, item.key);
                      return {
                        ...prev,
                        [item.key]: Boolean(nextGroup),
                      };
                    })
                  }
                  className={cn(
                    "mx-auto flex min-h-[43px] w-[calc(100%-5px)] min-w-0 items-center gap-2.5 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                    active
                      ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)]"
                      : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 stroke-[1.75]" />
                  <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
                  {groupBadge > 0 && (
                    <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 font-mono text-[10px] font-bold leading-none text-white">
                      {groupBadge}
                    </span>
                  )}
                  <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform duration-150", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="mt-1 space-y-0.5 border-l border-[var(--admin-v2-border)] pl-6" id={`admin-sidebar-group-${item.key}`}>
                    {item.children.map((child) => {
                      const childActive = isAdminNavigationLinkActive(pathname, child.href, productView, agentTab);
                      const childBadge = getChildBadgeCount(child.href);
                      return (
                        <Link
                          key={child.href}
                          prefetch={false} href={child.href}
                          aria-current={childActive ? "page" : undefined}
                          className={cn(
                            "mx-auto flex items-center justify-between min-h-[43px] w-[calc(100%-5px)] min-w-0 truncate rounded-[var(--admin-v2-control-radius)] px-2.5 py-[9.5px] text-[13px] leading-6 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
                            childActive
                              ? "bg-[var(--admin-v2-selected)] font-medium text-[var(--admin-v2-primary)]"
                              : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                          )}
                        >
                          <span className="truncate">{child.label}</span>
                          {childBadge > 0 && (
                            <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 font-mono text-[10px] font-bold leading-none text-white">
                              {childBadge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = isAdminNavigationLinkActive(pathname, item.href, productView, agentTab);
          return (
            <Link
              key={item.href}
              prefetch={false} href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mx-auto flex min-h-[43px] w-[calc(100%-5px)] min-w-0 items-center gap-2.5 rounded-[var(--admin-v2-control-radius)] px-2.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-inset",
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







