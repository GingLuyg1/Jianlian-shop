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
  RotateCcw,
  ScrollText,
  Settings,
  Users,
  WalletCards,
} from "lucide-react";

import { cn } from "@/lib/utils";

const productLinks = [
  { label: "商品列表", href: "/admin/products" },
  { label: "分类管理", href: "/admin/categories" },
];

const adminMenuItems = [
  { label: "控制台", href: "/admin", icon: LayoutDashboard },
  { label: "数字库存", href: "/admin/inventory", icon: PackageCheck },
  { label: "支付管理", href: "/admin/payments", icon: WalletCards },
  { label: "充值管理", href: "/admin/recharges", icon: WalletCards },
  { label: "订单管理", href: "/admin/orders", icon: ClipboardList },
  { label: "售后退款", href: "/admin/refunds", icon: RotateCcw },
  { label: "用户管理", href: "/admin/users", icon: Users },
  { label: "系统设置", href: "/admin/settings", icon: Settings },
  { label: "操作日志", href: "/admin/audit-logs", icon: ScrollText },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isProductRoute = pathname.startsWith("/admin/products") || pathname.startsWith("/admin/categories");
  const isCategoryView =
    pathname.startsWith("/admin/categories") ||
    (pathname.startsWith("/admin/products") && searchParams.get("view") === "categories");
  const [productsOpen, setProductsOpen] = useState(isProductRoute);

  useEffect(() => {
    if (isProductRoute) {
      setProductsOpen(true);
    }
  }, [isProductRoute]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            JL
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Jianlian Admin</div>
            <div className="text-xs text-slate-500">后台管理</div>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        <div>
          <button
            type="button"
            onClick={() => setProductsOpen((value) => !value)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              isProductRoute
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <Package className="h-4 w-4" />
            <span className="flex-1">商品管理</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", productsOpen && "rotate-180")} />
          </button>
          {productsOpen && (
            <div className="mt-1 space-y-1 pl-7">
              {productLinks.map((item) => {
                const active = item.href === "/admin/categories" ? isCategoryView : pathname.startsWith("/admin/products") && !isCategoryView;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {adminMenuItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
