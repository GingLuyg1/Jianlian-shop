"use client";

/**
 * MobileMenu - Drawer navigation for mobile devices
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
  MessageCircle,
  Sparkles,
  Wallet,
  Share2,
  ClipboardList,
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

type MobileMenuProps = {
  supportHref?: string;
};

export default function MobileMenu({ supportHref }: MobileMenuProps) {
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
      <SheetContent side="left" className="w-[var(--storefront-sidebar-width)] max-w-none p-0">
        <SheetTitle className="sr-only">导航菜单</SheetTitle>
        <div className="flex items-center border-b border-border px-3 py-4 pr-8">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/assets/jianlian-brand-logo.png"
              alt="Jianlian"
              className="h-8 w-8 shrink-0 rounded-md object-cover"
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

        <nav className="flex-1 overflow-y-auto px-2 py-3">
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
                      "flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-[13px] transition-colors duration-150",
                      active
                        ? "border border-primary/20 bg-primary/10 font-medium text-primary"
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

        <div className="px-2 pb-3">
          <ul className="space-y-1">
            {helpItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-[13px] transition-colors duration-150",
                      active
                        ? "border border-primary/20 bg-primary/10 font-medium text-primary"
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
        </div>

        <div className="border-t border-border px-2 py-4">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (!supportHref) return;
              if (supportHref.startsWith("mailto:")) {
                window.location.href = supportHref;
              } else {
                window.open(supportHref, "_blank", "noopener,noreferrer");
              }
            }}
            className="flex w-full items-center justify-start gap-2 whitespace-nowrap rounded-md bg-primary/90 px-2 py-2 text-[13px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary"
            {...(!supportHref
              ? ({ popovertarget: "support-popover" } as Record<string, string>)
              : {})}
          >
            <Headphones className="h-4 w-4 shrink-0" />
            <span>在线客服</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
