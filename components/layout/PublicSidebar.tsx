"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  CreditCard,
  Gift,
  Headphones,
  HelpCircle,
  Home,
  KeyRound,
  MessageCircle,
  Share2,
  Sparkles,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { isCatalogCategoryHref, useVisibleStorefrontCategoryHrefs } from "@/hooks/use-visible-storefront-categories";
import { refreshPublicCategories } from "@/lib/catalog/public-category-snapshot";
import { prefetchDefaultPublicProductPage } from "@/lib/catalog/public-product-query-cache";
import { prefetchPublicProductCounts } from "@/lib/catalog/public-product-count-cache";
import { startCatalogRouteExit } from "@/lib/motion/catalog-route-exit";
import SidebarSlidingList from "./SidebarSlidingList";

const menuItems = [
  { label: "首页", href: "/", icon: Home },
  { label: "国际电话卡", href: "/products/sim-cards", icon: CreditCard },
  { label: "礼品卡 / 充值卡", href: "/products/gift-cards", icon: Gift },
  { label: "数字账号", href: "/products/digital-accounts", icon: KeyRound },
  { label: "AI会员充值", href: "/products/ai-membership", icon: Sparkles },
  { label: "接码服务", href: "/products/sms-code", icon: MessageCircle },
  { label: "账号充值", href: "/products/account-recharge", icon: Wallet },
  { label: "推广赚钱", href: "/promotion", icon: Share2 },
  { label: "我的订单", href: "/account/orders", icon: ClipboardList },
];

const helpItems = [
  { label: "使用教程", href: "/tutorials", icon: BookOpen },
  { label: "常见问题", href: "/faq", icon: HelpCircle },
];

type PublicSidebarProps = {
  onSupportOpen: () => void;
  mobileNavigationUntilLg?: boolean;
};

export default function PublicSidebar({ onSupportOpen, mobileNavigationUntilLg = false }: PublicSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { visibleHrefs, confirmed, status, rows } = useVisibleStorefrontCategoryHrefs();
  useEffect(() => {
    if (!rows) return;
    // Idle visits prepare lightweight counts, not every category's SKU/stock.
    const run = () => { void prefetchPublicProductCounts(); };
    const idle = window.requestIdleCallback?.(run);
    if (idle === undefined) run();
    return () => { if (idle !== undefined) window.cancelIdleCallback(idle); };
  }, [pathname, rows]);
  const visibleMenuItems = menuItems.filter(
    (item) => !isCatalogCategoryHref(item.href) || !confirmed || visibleHrefs.has(item.href)
  );

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderLink = (item: (typeof menuItems)[number]) => {
    const Icon = item.icon;
    const active = isActive(item.href);

    if (isCatalogCategoryHref(item.href) && !confirmed) {
      return (
        <li key={item.href} className="mx-auto flex h-[42px] w-full items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground" aria-hidden={status !== "error"}>
          {status === "error" && item.href === "/products/sim-cards" ? (
            <button type="button" onClick={() => void refreshPublicCategories().catch(() => undefined)} className="text-left underline">分类读取失败，重试</button>
          ) : <span className="h-3 w-3/4 rounded bg-slate-100" />}
        </li>
      );
    }

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          data-sidebar-link={item.href}
          data-sidebar-active={active ? "true" : undefined}
          aria-current={active ? "page" : undefined}
          onMouseEnter={() => { if (rows && isCatalogCategoryHref(item.href)) void prefetchDefaultPublicProductPage(item.href, rows, true); }}
          onFocus={() => { if (rows && isCatalogCategoryHref(item.href)) void prefetchDefaultPublicProductPage(item.href, rows, true); }}
          onClick={(event) => {
            if (rows && isCatalogCategoryHref(item.href)) void prefetchDefaultPublicProductPage(item.href, rows);
            startCatalogRouteExit(event, pathname, item.href, () => router.push(item.href));
          }}
          className={cn(
            "relative mx-auto flex h-[42px] w-[calc(100%-6px)] items-center justify-start gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-sm transition-colors duration-150",
            "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 hidden h-screen w-[var(--storefront-sidebar-width)] flex-col border-r border-border bg-white/95",
      mobileNavigationUntilLg ? "lg:flex" : "md:flex",
    )}>
      <div className="flex h-[83px] items-center px-3">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white lg:h-10 lg:w-10">
            <img
              src="/assets/jianlian-brand-logo.png"
              alt="Jianlian"
              width={48}
              height={48}
              className="h-9 w-9 object-cover lg:h-10 lg:w-10"
            />
          </div>
          <div className="min-w-0">
            <div className="whitespace-nowrap text-base font-semibold leading-tight text-foreground lg:text-lg">
              Jianlian
            </div>
            <div className="mt-0.5 whitespace-nowrap text-[11px] leading-tight text-muted-foreground lg:text-xs">
              数字商品服务
            </div>
          </div>
        </Link>
      </div>

      <SidebarSlidingList activeKey={pathname} layoutKey={`${confirmed}:${visibleMenuItems.map((item) => item.href).join(",")}`}>
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-2 pb-4 pt-0">
          <ul className="space-y-1.5">{visibleMenuItems.map(renderLink)}</ul>
        </nav>
        <div className="px-2 pb-3">
          <ul className="space-y-1.5">{helpItems.map(renderLink)}</ul>
        </div>
      </SidebarSlidingList>

      <div className="border-t border-border px-2 py-4">
        <button
          type="button"
          onClick={onSupportOpen}
          className="mx-auto flex w-[calc(100%-6px)] select-none items-center justify-start gap-2.5 whitespace-nowrap rounded-md bg-primary/90 px-3 py-2.5 text-left text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary"
        >
          <Headphones className="h-[18px] w-[18px] shrink-0" />
          <span>在线客服</span>
        </button>
      </div>
    </aside>
  );
}
