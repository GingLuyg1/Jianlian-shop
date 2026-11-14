"use client";

/**
 * MobileMenu - Drawer navigation for mobile devices
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Home,
  CreditCard,
  Gift,
  KeyRound,
  Sparkles,
  Wallet,
  Share2,
  ClipboardList,
  BookOpen,
  HelpCircle,
  Headphones,
  UserCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import selectionMotion from "@/components/ui/SelectionMotion.module.css";
import { fallbackCategoriesByPath, simRegionCode } from "@/lib/catalog/storefront-category-visuals";
import { findVisibleStorefrontPrimaryCategory } from "@/lib/catalog/visible-storefront-category-routes";
import { isCatalogCategoryHref, useVisibleStorefrontCategoryHrefs } from "@/hooks/use-visible-storefront-categories";
import { refreshPublicCategories } from "@/lib/catalog/public-category-snapshot";
import { prefetchDefaultPublicProductPage } from "@/lib/catalog/public-product-query-cache";
import { getCatalogRoutePending, getServerCatalogRoutePending, startCatalogRouteExit, subscribeCatalogRoutePending } from "@/lib/motion/catalog-route-exit";
import { getChildCategories, normalizeText } from "@/lib/supabase/public-catalog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

const menuItems = [
  { label: "首页", href: "/", icon: Home },
  { label: "国际电话卡", href: "/products/sim-cards", icon: CreditCard },
  { label: "礼品卡 / 充值卡", href: "/products/gift-cards", icon: Gift },
  { label: "数字账号", href: "/products/digital-accounts", icon: KeyRound },
  { label: "AI会员充值", href: "/products/ai-membership", icon: Sparkles },
  { label: "账号充值", href: "/products/account-recharge", icon: Wallet },
  { label: "推广赚钱", href: "/promotion", icon: Share2 },
  { label: "我的订单", href: "/account/orders", icon: ClipboardList },
  { label: "个人中心", href: "/account", icon: UserCircle },
];

const helpItems = [
  { label: "使用教程", href: "/tutorials", icon: BookOpen },
  { label: "常见问题", href: "/faq", icon: HelpCircle },
];

type MobileMenuProps = {
  onSupportOpen: () => void;
  mobileNavigationUntilLg?: boolean;
};

export default function MobileMenu({ onSupportOpen, mobileNavigationUntilLg = false }: MobileMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expandedPrimaryHref, setExpandedPrimaryHref] = useState<string>("");
  const { isMobile } = useMobileStorefront();
  const pendingRoute = useSyncExternalStore(subscribeCatalogRoutePending, getCatalogRoutePending, getServerCatalogRoutePending);
  const pendingCategoryHref = pendingRoute?.source === pathname ? pendingRoute.target : "";
  const { visibleHrefs, confirmed, status, rows } = useVisibleStorefrontCategoryHrefs();
  const visibleMenuItems = menuItems.filter(
    (item) => !isCatalogCategoryHref(item.href) || !confirmed || visibleHrefs.has(item.href)
  );
  const navigationGroups = [
    { title: "", items: visibleMenuItems.filter((item) => item.href === "/") },
    { title: "资源中心", items: visibleMenuItems.filter((item) => isCatalogCategoryHref(item.href)) },
    { title: "帮助中心", items: helpItems },
    { title: "我的", items: visibleMenuItems.filter((item) => item.href !== "/" && !isCatalogCategoryHref(item.href)) },
  ];

  const secondaryByPrimaryHref = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; name: string; slug: string; image?: string; code?: string }>
    >();
    if (!rows) return map;
    for (const item of menuItems) {
      if (!isCatalogCategoryHref(item.href)) continue;
      const primary = findVisibleStorefrontPrimaryCategory(item.href, rows);
      if (!primary) continue;
      const children = getChildCategories(rows, primary.id);
      if (children.length === 0) continue;
      const visuals = fallbackCategoriesByPath[item.href] ?? [];
      map.set(
        item.href,
        children.map((child) => {
          const normalizedSlug = normalizeText(child.slug);
          const normalizedName = normalizeText(child.name);
          const visual = visuals.find((v) => {
            const aliases = [v.slug, v.name, ...(v.aliases ?? [])].map(normalizeText);
            return aliases.some(
              (alias) => alias === normalizedSlug || normalizedName.includes(alias) || alias.includes(normalizedName)
            );
          });
          return {
            id: child.id,
            name: child.name,
            slug: child.slug,
            image: visual?.image,
            code: item.href === "/products/sim-cards" ? simRegionCode(child.slug, child.name) : undefined,
          };
        })
      );
    }
    return map;
  }, [rows]);

  const expandedSecondaries = expandedPrimaryHref ? secondaryByPrimaryHref.get(expandedPrimaryHref) ?? [] : [];
  const expandedPrimaryLabel = menuItems.find((item) => item.href === expandedPrimaryHref)?.label ?? "分类直达";

  const isActive = (href: string) => {
    if (pendingCategoryHref) return pendingCategoryHref === href;
    if (href === "/") return pathname === "/";
    if (href === "/account") return pathname === "/account" || (pathname.startsWith("/account/") && !pathname.startsWith("/account/orders"));
    return pathname.startsWith(href);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setExpandedPrimaryHref("");
      }}
    >
      <SheetTrigger asChild>
        <Button
          data-storefront-menu-trigger
          variant="ghost"
          size="icon"
          className={cn(mobileNavigationUntilLg ? "lg:hidden" : "md:hidden", isMobile && "!inline-flex")}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        style={{ width: expandedSecondaries.length > 0 ? "328px" : "160px" }}
        className={cn(
          "flex h-full max-w-none flex-row p-0 transition-[width] duration-200",
          expandedSecondaries.length > 0
            ? "w-[328px]"
            : "w-[var(--storefront-sidebar-width,160px)]"
        )}
      >
        <SheetTitle className="sr-only">导航菜单</SheetTitle>
        <div className="flex h-full w-[var(--storefront-sidebar-width,160px)] shrink-0 flex-col">
          <div className="flex shrink-0 items-center border-b border-border px-2.5 py-3.5 pr-7">
            <div className="flex min-w-0 items-center gap-2">
              <img
                src="/assets/jianlian-brand-logo.png"
                alt="Jianlian"
                className="h-7 w-7 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0">
                <div className="whitespace-nowrap text-[13px] font-semibold leading-tight text-foreground">
                  Jianlian
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                  数字商品服务
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-1.5 py-2.5">
            {navigationGroups.map((group) => group.items.length > 0 ? (
            <section key={group.title || "home"} aria-label={group.title || "首页"}>
            {group.title ? <h2 className="mb-1.5 mt-4 px-2 text-[11px] font-medium text-muted-foreground">{group.title}</h2> : null}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const subItems = secondaryByPrimaryHref.get(item.href) ?? [];
                const hasSubItems = subItems.length > 0;
                const isExpanded = expandedPrimaryHref === item.href;
                if (isCatalogCategoryHref(item.href) && !confirmed) {
                  return <li key={item.href} className="flex h-[39px] items-center rounded-md px-2" aria-hidden={status !== "error"}>
                    {status === "error" && item.href === "/products/sim-cards" ? (
                      <button type="button" onClick={() => void refreshPublicCategories().catch(() => undefined)} className="text-left text-xs text-muted-foreground underline">分类读取失败，重试</button>
                    ) : <span className="h-3 w-3/4 rounded bg-slate-100" />}
                  </li>;
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      data-expanded={isExpanded ? "true" : undefined}
                      onFocus={() => { if (rows && isCatalogCategoryHref(item.href)) void prefetchDefaultPublicProductPage(item.href, rows, true); }}
                      onClick={(event) => {
                        if (rows && isCatalogCategoryHref(item.href)) void prefetchDefaultPublicProductPage(item.href, rows);
                        if (hasSubItems) {
                          event.preventDefault();
                          setExpandedPrimaryHref((prev) => (prev === item.href ? "" : item.href));
                          return;
                        }
                        setExpandedPrimaryHref("");
                        startCatalogRouteExit(event, pathname, item.href, () => router.push(item.href));
                        setOpen(false);
                      }}
                      className={cn(
                        selectionMotion.item,
                        "flex items-center justify-between gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-[12px] transition-colors duration-150",
                        isExpanded
                          ? "border border-primary/30 bg-orange-50 font-semibold text-primary"
                          : active
                            ? "border border-primary/20 bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {hasSubItems ? (
                        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isExpanded && "translate-x-0.5 text-primary")} />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            </section>
            ) : null)}
          </nav>

          <div className="border-t border-border px-2 py-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setExpandedPrimaryHref("");
                onSupportOpen();
              }}
              className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary/90 px-2 py-2 text-[12px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary"
            >
              <Headphones className="h-3.5 w-3.5 shrink-0" />
              <span>在线客服</span>
            </button>
          </div>
        </div>

        {expandedSecondaries.length > 0 ? (
          <div
            data-testid="mobile-menu-secondary-panel"
            className="flex h-full w-[168px] shrink-0 flex-col border-l border-border bg-background"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-3.5 pr-8">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold leading-tight text-foreground">
                  {expandedPrimaryLabel}
                </div>
                <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                  选择分类 ({expandedSecondaries.length})
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-2.5">
              <ul className="space-y-1">
                {expandedSecondaries.map((sub) => {
                  const queryKey = expandedPrimaryHref === "/products/sim-cards" ? "country" : "category";
                  const targetHref = `${expandedPrimaryHref}?${queryKey}=${encodeURIComponent(sub.slug)}`;
                  const currentSub = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(queryKey) : null;
                  const subActive = pathname === expandedPrimaryHref && currentSub === sub.slug;
                  return (
                    <li key={sub.id}>
                      <Link
                        href={targetHref}
                        data-testid={`mobile-menu-secondary-${sub.slug}`}
                        onClick={(event) => {
                          if (pathname === expandedPrimaryHref) {
                            event.preventDefault();
                            window.history.replaceState(window.history.state, "", targetHref);
                            window.dispatchEvent(new PopStateEvent("popstate"));
                            router.replace(targetHref, { scroll: false });
                          } else {
                            startCatalogRouteExit(event, pathname, targetHref, () => router.push(targetHref));
                          }
                          setOpen(false);
                          setExpandedPrimaryHref("");
                        }}
                        className={cn(
                          selectionMotion.item,
                          "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-[12px] transition-colors duration-150",
                          subActive
                            ? "border border-primary/20 bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {sub.code ? (
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                            {sub.code}
                          </span>
                        ) : sub.image ? (
                          <img
                            src={sub.image}
                            alt={sub.name}
                            className="h-6 w-6 shrink-0 rounded-md bg-white object-cover ring-1 ring-slate-200/80"
                          />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <KeyRound className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{sub.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
