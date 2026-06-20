"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  supportHref?: string;
};

export default function PublicSidebar({ supportHref }: PublicSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderLink = (item: (typeof menuItems)[number]) => {
    const Icon = item.icon;
    const active = isActive(item.href);

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-4 py-2.5 text-[15px] transition-all duration-150 hover:scale-[1.015] active:scale-[1.03]",
            active
              ? "scale-[1.01] border border-primary/20 bg-primary/10 font-medium text-primary shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[270px] flex-col border-r border-border bg-white/90 backdrop-blur md:flex">
      <div className="flex h-[83px] items-center justify-center px-6">
        <Link
          href="/"
          className="flex -translate-x-[5px] items-center justify-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img
              src="/assets/jianlian-brand-logo.png"
              alt="Jianlian"
              width={48}
              height={48}
              className="h-12 w-12 object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-semibold leading-tight text-foreground">
              Jianlian
            </div>
            <div className="mt-1 text-sm leading-tight text-muted-foreground">
              数字商品服务
            </div>
          </div>
        </Link>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-4 pb-4 pt-0">
        <ul className="space-y-1.5">{menuItems.map(renderLink)}</ul>
      </nav>

      <div className="px-4 pb-3">
        <ul className="space-y-1.5">{helpItems.map(renderLink)}</ul>
      </div>

      <div className="border-t border-border px-4 py-4">
        <button
          type="button"
          onClick={() => {
            if (!supportHref) return;
            if (supportHref.startsWith("mailto:")) {
              window.location.href = supportHref;
            } else {
              window.open(supportHref, "_blank", "noopener,noreferrer");
            }
          }}
          className="flex w-full select-none items-center justify-start gap-3 rounded-md bg-primary/90 px-4 py-2.5 text-[15px] font-medium text-primary-foreground shadow-sm transition-all duration-150 hover:scale-[1.015] hover:bg-primary active:scale-[1.03]"
          {...(!supportHref
            ? ({ popovertarget: "support-popover" } as Record<string, string>)
            : {})}
        >
          <Headphones className="h-[18px] w-[18px] shrink-0" />
          <span>在线客服</span>
        </button>
      </div>
    </aside>
  );
}
