"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  Package,
  PackageCheck,
  Settings,
  Users,
  WalletCards,
} from "lucide-react";

import { cn } from "@/lib/utils";

const adminMenuItems = [
  { label: "控制台", href: "/admin", icon: LayoutDashboard },
  { label: "数字库存", href: "/admin/inventory", icon: PackageCheck },
  { label: "支付管理", href: "/admin/payments", icon: WalletCards },
  { label: "订单管理", href: "/admin/orders", icon: ClipboardList },
  { label: "用户管理", href: "/admin/users", icon: Users },
  { label: "系统设置", href: "/admin/settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isProductRoute =
    pathname.startsWith("/admin/products") || pathname.startsWith("/admin/categories");
  const isCategoryView =
    pathname.startsWith("/admin/categories") ||
    (pathname.startsWith("/admin/products") && searchParams.get("view") === "categories");
  const [productMenuOpen, setProductMenuOpen] = useState(isProductRoute);

  useEffect(() => {
    if (isProductRoute) setProductMenuOpen(true);
  }, [isProductRoute]);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden h-dvh w-[var(--admin-sidebar-width)] shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="flex h-[var(--admin-header-height)] shrink-0 items-center border-b border-border px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-base font-bold text-white">
            JL
          </div>
          <div>
            <div className="text-base font-semibold leading-tight text-foreground">
              Jianlian Admin
            </div>
            <div className="mt-0.5 text-xs leading-tight text-muted-foreground">管理后台</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-1">
          <li>
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                pathname === "/admin"
                  ? "bg-slate-800 font-medium text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span>控制台</span>
            </Link>
          </li>

          <li>
            <button
              type="button"
              onClick={() => setProductMenuOpen((open) => !open)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                isProductRoute
                  ? "bg-slate-800 font-medium text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Package className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">商品管理</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  productMenuOpen && "rotate-180"
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-200 ease-out",
                productMenuOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <div className="ml-7 mt-1 space-y-1 border-l border-slate-200 pl-2">
                  <Link
                    href="/admin/products"
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      isProductRoute && !isCategoryView
                        ? "bg-orange-50 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    商品列表
                  </Link>
                  <Link
                    href="/admin/categories"
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      isCategoryView
                        ? "bg-orange-50 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    分类管理
                  </Link>
                </div>
              </div>
            </div>
          </li>

          {adminMenuItems.slice(1).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-slate-800 font-medium text-white"
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

      <div className="shrink-0 border-t border-border bg-white px-4 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          返回前台
        </Link>
      </div>
    </aside>
  );
}
