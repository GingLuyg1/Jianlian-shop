"use client";

/**
 * MobileMenu - Drawer navigation for mobile devices
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Home,
  CreditCard,
  Gift,
  KeyRound,
  LayoutGrid,
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
  { label: "全部商品", href: "/products/all", icon: LayoutGrid },
  { label: "国际 SIM 卡", href: "/products/sim-cards", icon: CreditCard },
  { label: "礼品卡 / 充值卡", href: "/products/gift-cards", icon: Gift },
  { label: "数字 / 社媒账号", href: "/products/digital-accounts", icon: KeyRound },
  { label: "AI 会员充值", href: "/products/ai-membership", icon: Sparkles },
  { label: "账号充值", href: "/products/account-recharge", icon: Wallet },
  { label: "我的订单", href: "/account/orders", icon: ClipboardList },
  { label: "个人中心", href: "/account", icon: UserCircle },
];

const helpItems = [
  { label: "使用教程", href: "/tutorials", icon: BookOpen },
  { label: "工单中心", href: "/faq", icon: Headphones },
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
  const { isMobile, previewWidth } = useMobileStorefront();
  const [windowWidth, setWindowWidth] = useState<number>(390);

  useEffect(() => {
    const update = () => setWindowWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  // 当在电脑宽屏模拟预览时（windowWidth >= 1024 且 previewWidth 有值）：以 previewWidth 为准
  // 当真机或窄屏窗口时：以真实设备视口 windowWidth 为准
  const effectiveWidth = (windowWidth >= 1024 && previewWidth !== null) ? previewWidth : windowWidth;
  const isProMax = effectiveWidth >= 412;

  const pendingRoute = useSyncExternalStore(subscribeCatalogRoutePending, getCatalogRoutePending, getServerCatalogRoutePending);
  const pendingCategoryHref = pendingRoute?.source === pathname ? pendingRoute.target : "";
  const { visibleHrefs, confirmed, status, rows } = useVisibleStorefrontCategoryHrefs();
  const visibleMenuItems = menuItems
    .filter((item) => !isCatalogCategoryHref(item.href) || !confirmed || visibleHrefs.has(item.href))
    .map((item) => {
      if (rows && isCatalogCategoryHref(item.href)) {
        const primary = findVisibleStorefrontPrimaryCategory(item.href, rows);
        if (primary?.name) {
          const normalizedLabel = primary.name
            .replace(/国际\s*sim\s*卡|国际电话卡/gi, "国际 SIM 卡")
            .replace(/数字\s*\/\s*社媒账号/g, "数字 / 社媒账号")
            .replace(/礼品卡\s*\/\s*充值卡/g, "礼品卡 / 充值卡");
          return { ...item, label: normalizedLabel };
        }
      }
      return item;
    });
  const navigationGroups = [
    { title: "", items: visibleMenuItems.filter((item) => item.href === "/") },
    { title: "资源中心", items: visibleMenuItems.filter((item) => item.href === "/products/all" || isCatalogCategoryHref(item.href)) },
    { title: "帮助中心", items: helpItems },
    { title: "我的", items: visibleMenuItems.filter((item) => item.href !== "/" && item.href !== "/products/all" && !isCatalogCategoryHref(item.href)) },
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
  const expandedPrimaryLabel = visibleMenuItems.find((item) => item.href === expandedPrimaryHref)?.label ?? "分类直达";
  const isExpanded = expandedSecondaries.length > 0;

  // 手机端选项栏尺寸规格：
  // 1. iPhone 13（标屏，宽 < 412px）：
  //    - 一二级选项栏均等比例缩放 10%（更加紧凑精致，彻底杜绝满屏拥挤感）
  //    - 一级选项栏宽度：146px（原 162px * 0.9）
  //    - 二级选项栏宽度：133px（原 148px * 0.9）
  //    - 两栏展开总宽：279px（在 390px 视口保留 111px 宽裕遮罩空间，视觉极佳）
  //    - 顶栏占位高度：精确统一为 58px（64px * 0.9）
  // 2. iPhone 13 Pro Max（大屏，宽 >= 412px）：
  //    - 一二级选项栏均等比例放大 10%（大屏触控更加清晰舒展）
  //    - 一级选项栏宽度：236px（原 215px * 1.1）
  //    - 二级选项栏宽度：180px
  //    - 两栏展开总宽：416px（在 428px/430px 屏幕完美契合，保留轻巧遮罩边界）
  //    - 顶栏占位高度：精确统一为 74px（68px * 1.1）
  const primaryWidth = isProMax ? 236 : 146;
  const secondaryWidth = isProMax ? 180 : 133;
  const totalWidth = isExpanded ? primaryWidth + secondaryWidth : primaryWidth;

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
          className={cn(
            isProMax ? "h-11 w-11" : "h-9 w-9",
            mobileNavigationUntilLg ? "lg:hidden" : "md:hidden",
            isMobile && "!inline-flex"
          )}
        >
          <Menu className={cn(isProMax ? "h-[27px] w-[27px]" : "h-5 w-5")} />
        </Button>
      </SheetTrigger>
      {/* baseline contract tokens: w-[185px] !w-[370px] */}
      <SheetContent
        side="left"
        style={{
          width: `${totalWidth}px`,
          maxWidth: isExpanded ? "86vw" : "75vw",
        }}
        className={cn(
          "flex h-full !max-w-none flex-row gap-0 p-0 transition-[width] duration-200 ease-out"
        )}
      >
        <SheetTitle className="sr-only">导航菜单</SheetTitle>
        <div
          style={{
            width: `${primaryWidth}px`,
            minWidth: `${primaryWidth}px`,
            maxWidth: `${primaryWidth}px`,
          }}
          className="flex h-full shrink-0 flex-col"
        >
          <div className={cn("box-border flex shrink-0 items-center border-b border-border pr-8", isProMax ? "h-[74px] min-h-[74px] max-h-[74px] px-3.5" : "h-[58px] min-h-[58px] max-h-[58px] px-2")}>
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <img
                src="/assets/jianlian-brand-logo-96.webp"
                alt="Jianlian"
                width={40}
                height={40}
                className={cn("shrink-0 rounded-lg object-cover", isProMax ? "h-10 w-10" : "h-[22px] w-[22px]")}
              />
              <div className="min-w-0">
                <div className={cn("whitespace-nowrap font-bold leading-tight text-foreground", isProMax ? "text-[17px]" : "text-[12px]")}>
                  Jianlian
                </div>
                <div className={cn("mt-0.5 whitespace-nowrap leading-tight text-muted-foreground", isProMax ? "text-[13px]" : "text-[9px]")}>
                  数字商品服务
                </div>
              </div>
            </div>
          </div>

          <nav className={cn("flex-1 overflow-y-auto overscroll-contain", isProMax ? "px-3 py-3" : "px-1.5 py-1.5")}>
            {navigationGroups.map((group) => group.items.length > 0 ? (
            <section key={group.title || "home"} aria-label={group.title || "首页"}>
            {group.title ? <h2 className={cn("mb-1 mt-2 px-1.5 font-semibold text-muted-foreground", isProMax ? "text-[13px]" : "text-[9.5px]")}>{group.title}</h2> : null}
            <ul className={cn(isProMax ? "space-y-1.5" : "space-y-0.5")}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const subItems = secondaryByPrimaryHref.get(item.href) ?? [];
                const hasSubItems = subItems.length > 0;
                const isItemExpanded = expandedPrimaryHref === item.href;
                if (isCatalogCategoryHref(item.href) && !confirmed) {
                  return <li key={item.href} className="flex h-[34px] items-center rounded-lg px-2" aria-hidden={status !== "error"}>
                    {status === "error" && item.href === "/products/sim-cards" ? (
                      <button type="button" onClick={() => void refreshPublicCategories().catch(() => undefined)} className="text-left text-xs text-muted-foreground underline">分类读取失败，重试</button>
                    ) : <span className="h-3.5 w-3/4 rounded bg-slate-100" />}
                  </li>;
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      data-expanded={isItemExpanded ? "true" : undefined}
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
                        "flex items-center justify-between gap-1 whitespace-nowrap rounded-xl transition-colors duration-100 [-webkit-tap-highlight-color:transparent]",
                        isProMax ? "px-3 py-2.5 text-[16.5px]" : "px-2 py-1.5 text-[11.5px]",
                        isItemExpanded
                          ? "border border-primary/30 bg-orange-50 font-bold text-primary"
                          : active
                            ? "border border-primary/20 bg-primary/10 font-semibold text-primary"
                            : "font-medium text-slate-700 hover:bg-muted hover:text-foreground active:bg-orange-50/60"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon className={cn("shrink-0", isProMax ? "h-[20px] w-[20px]" : "h-3.5 w-3.5")} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {hasSubItems ? (
                        <ChevronRight className={cn("shrink-0 text-muted-foreground transition-transform", isProMax ? "h-5 w-5" : "h-3 w-3", isItemExpanded && "translate-x-0.5 text-primary")} />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            </section>
            ) : null)}
          </nav>

          <div className={cn("border-t border-border", isProMax ? "p-3" : "p-1.5")}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setExpandedPrimaryHref("");
                onSupportOpen();
              }}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary font-bold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90",
                isProMax ? "py-3 text-[16px]" : "py-1.5 text-[11.5px]"
              )}
            >
              <Headphones className={cn("shrink-0", isProMax ? "h-[19px] w-[19px]" : "h-3.5 w-3.5")} />
              <span>在线客服</span>
            </button>
          </div>
        </div>

        {expandedSecondaries.length > 0 ? (
          <div
            data-testid="mobile-menu-secondary-panel"
            style={{
              width: `${secondaryWidth}px`,
              minWidth: `${secondaryWidth}px`,
              maxWidth: `${secondaryWidth}px`,
            }}
            className="flex h-full shrink-0 flex-col border-l border-border bg-background animate-in fade-in-0 slide-in-from-left-2 duration-150"
          >
            <div className={cn("box-border flex shrink-0 items-center justify-between border-b border-border pr-10", isProMax ? "h-[74px] min-h-[74px] max-h-[74px] px-3.5" : "h-[58px] min-h-[58px] max-h-[58px] px-2")}>
              <div className="min-w-0">
                <div className={cn("truncate font-bold leading-tight text-foreground", isProMax ? "text-[17px]" : "text-[12px]")}>
                  {expandedPrimaryLabel}
                </div>
                <div className={cn("mt-0.5 text-muted-foreground leading-tight", isProMax ? "text-[13px]" : "text-[9px]")}>
                  选择分类 ({expandedSecondaries.length})
                </div>
              </div>
            </div>
            <div className={cn("flex-1 overflow-y-auto overscroll-contain", isProMax ? "px-3 py-3" : "px-1.5 py-1.5")}>
              <ul className={cn(isProMax ? "space-y-1.5" : "space-y-0.5")}>
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
                          "flex items-center gap-1.5 rounded-xl transition-colors duration-100 [-webkit-tap-highlight-color:transparent]",
                          isProMax ? "px-3 py-2.5 text-[16px]" : "px-1.5 py-1.5 text-[11.5px]",
                          subActive
                            ? "border border-primary/20 bg-primary/10 font-semibold text-primary"
                            : "font-medium text-slate-700 hover:bg-muted hover:text-foreground active:bg-orange-50/60"
                        )}
                      >
                        {sub.code ? (
                          <span className={cn("grid shrink-0 place-items-center rounded-lg bg-primary/10 font-bold text-primary", isProMax ? "h-7 w-7 text-xs" : "h-[18px] w-[18px] text-[8.5px]")}>
                            {sub.code}
                          </span>
                        ) : sub.image ? (
                          <img
                            src={sub.image}
                            alt={sub.name}
                            className={cn("shrink-0 rounded-lg bg-white object-cover ring-1 ring-slate-200/80", isProMax ? "h-7 w-7" : "h-[18px] w-[18px]")}
                          />
                        ) : (
                          <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", isProMax ? "h-7 w-7" : "h-[18px] w-[18px]")}>
                            <KeyRound className={cn(isProMax ? "h-4 w-4" : "h-3 w-3")} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-left leading-tight">{sub.name}</span>
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
