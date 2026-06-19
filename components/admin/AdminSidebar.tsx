"use client";

/**
 * AdminSidebar - Fixed left sidebar for admin dashboard
 *
 * Separate from PublicSidebar. Uses its own menu items.
 * Never shown in public navigation. Admin pages should not
 * use PublicSidebar or PublicTopInfoBar.
 *
 * Menu: 控制台, 商品管理, 订单管理, 用户管理, 系统设置
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const adminMenuItems = [
  { label: "控制台", href: "/admin", icon: LayoutDashboard },
  { label: "商品管理", href: "/admin/products", icon: Package },
  { label: "订单管理", href: "/admin/orders", icon: ClipboardList },
  { label: "用户管理", href: "/admin/users", icon: Users },
  { label: "系统设置", href: "/admin/settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[var(--admin-sidebar-width)] flex-col border-r border-border bg-white md:flex">
      {/* Admin logo */}
      <div className="flex h-[var(--admin-header-height)] items-center border-b border-border px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-base font-bold text-white">
            JL
          </div>
          <div>
            <div className="font-semibold text-base text-foreground leading-tight">
              Jianlian Admin
            </div>
            <div className="text-xs text-muted-foreground leading-tight mt-0.5">
              管理后台
            </div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 px-3">
        <ul className="space-y-1">
          {adminMenuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-slate-800 text-white font-medium"
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

      {/* Back to site */}
      <div className="px-4 py-4 border-t border-border">
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          返回前台
        </Link>
      </div>
    </aside>
  );
}
