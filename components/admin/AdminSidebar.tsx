"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  adminNavigationItems,
  isAdminNavigationGroup,
  isAdminNavigationGroupActive,
  isAdminNavigationLinkActive,
} from "./admin-navigation";

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const productNavigation = adminNavigationItems.find(isAdminNavigationGroup);
  const isProductRoute = productNavigation ? isAdminNavigationGroupActive(pathname, productNavigation) : false;
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
            <div className="text-xs text-slate-500">管理后台</div>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        {adminNavigationItems.map((item) => {
          const Icon = item.icon;
          if (item.type === "group") {
            const active = isAdminNavigationGroupActive(pathname, item);
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => setProductsOpen((value) => !value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", productsOpen && "rotate-180")} />
                </button>
                {productsOpen && (
                  <div className="mt-1 space-y-1 pl-7">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm transition-colors",
                          isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view"))
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const active = isAdminNavigationLinkActive(pathname, item.href, searchParams.get("view"));
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







