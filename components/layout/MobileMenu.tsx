"use client";

/**
 * MobileMenu - Drawer navigation for mobile devices
 *
 * On mobile (below md breakpoint), the fixed left sidebar is hidden.
 * This component provides a slide-out drawer menu with all the same
 * navigation items as PublicSidebar.
 *
 * Triggered by a hamburger button in the mobile header.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Search,
  BookOpen,
  HelpCircle,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  { label: "数字账号服务", href: "/products/digital-accounts", icon: KeyRound },
  { label: "AI会员充值", href: "/products/ai-membership", icon: Sparkles },
  { label: "账号充值", href: "/products/account-recharge", icon: Wallet },
  { label: "推广赚钱", href: "/promotion", icon: Share2 },
  { label: "我的订单", href: "/account/orders", icon: ClipboardList },
  { label: "订单查询", href: "/order-tracking", icon: Search },
  { label: "使用教程", href: "/tutorials", icon: BookOpen },
  { label: "常见问题", href: "/faq", icon: HelpCircle },
];

export default function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">导航菜单</SheetTitle>
        {/* Mobile header */}
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/jianlian-logo.jpg"
              alt="Jianlian"
              className="h-12 w-12 rounded-lg object-cover"
            />
            <div>
              <div className="font-semibold text-base text-foreground leading-tight">
                Jianlian
              </div>
              <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                数字商品服务
              </div>
            </div>
          </div>
        </div>

        {/* Menu items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 hover:scale-[1.015] active:scale-[1.03]",
                      active
                        ? "scale-[1.01] border border-primary/20 bg-primary/10 text-primary font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom contact */}
        <div className="px-4 py-4 border-t border-border">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md text-sm bg-primary/90 text-primary-foreground font-medium hover:bg-primary hover:scale-[1.015] active:scale-[1.03] transition-all duration-150 shadow-sm"
            {...({ popovertarget: "support-popover" } as Record<string, string>)}
          >
            <Headphones className="h-4 w-4 shrink-0" />
            <span>在线客服</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
