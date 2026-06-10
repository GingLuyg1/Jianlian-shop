"use client";

/**
 * PublicSidebar - Fixed left sidebar for all public customer pages
 *
 * This is the main navigation for the public-facing website.
 * Fixed at left-0 top-0, full height, 240px wide.
 * Contains: logo, brand, menu items, and contact links.
 *
 * On mobile (below md breakpoint), the sidebar is hidden and
 * replaced by MobileMenu (a drawer component).
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  CreditCard,
  Gift,
  KeyRound,
  Sparkles,
  Wallet,
  Share2,
  ClipboardList,
  Search,
  BookOpen,
  HelpCircle,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Sidebar menu items definition
const menuItems = [
  { label: "首页", href: "/", icon: Home },
  { label: "国际电话卡", href: "/products/sim-cards", icon: CreditCard },
  { label: "礼品卡 / 充值卡", href: "/products/gift-cards", icon: Gift },
  { label: "数字账号服务", href: "/products/digital-accounts", icon: KeyRound },
  { label: "AI会员充值", href: "/products/ai-membership", icon: Sparkles },
  { label: "账号充值", href: "/products/account-recharge", icon: Wallet },
  { label: "推广赚钱", href: "/promotion", icon: Share2 },
  { label: "我的订单", href: "/account/orders", icon: ClipboardList },
  { label: "订单查询", href: "/order-tracking", icon: Search },
  { label: "使用教程", href: "/tutorials", icon: BookOpen },
  { label: "常见问题", href: "/faq", icon: HelpCircle },
];

export default function PublicSidebar() {
  const pathname = usePathname();

  // Check if a menu item is active by matching the current path
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[270px] bg-white/90 border-r border-border z-40 flex flex-col hidden md:flex backdrop-blur">
      {/* Logo and brand section */}
      <div className="h-[83px] px-6 flex items-center justify-center">
        <Link
          href="/"
          className="flex items-center justify-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="h-12 w-12 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
            <img
              src="/assets/jianlian-logo.jpg"
              alt="Jianlian"
              className="h-12 w-12 object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-xl text-foreground leading-tight">
              Jianlian
            </div>
            <div className="text-sm text-muted-foreground leading-tight mt-1">
              数字商品服务
            </div>
          </div>
        </Link>
      </div>

      {/* Scrollable menu section */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll pt-0 pb-4 px-4">
        <ul className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-md text-[15px] transition-all duration-150 hover:scale-[1.015] active:scale-[1.03]",
                    active
                      ? "scale-[1.01] border border-primary/20 bg-primary/10 text-primary font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom contact section */}
      <div className="px-4 py-4 border-t border-border">
        <button
          type="button"
          className="w-full flex items-center justify-start gap-3 px-4 py-2.5 rounded-md text-[15px] bg-primary/90 text-primary-foreground font-medium hover:bg-primary hover:scale-[1.015] active:scale-[1.03] transition-all duration-150 select-none shadow-sm"
          {...({ popovertarget: "support-popover" } as Record<string, string>)}
        >
          <Headphones className="h-[18px] w-[18px] shrink-0" />
          <span>在线客服</span>
        </button>
      </div>
    </aside>
  );
}
