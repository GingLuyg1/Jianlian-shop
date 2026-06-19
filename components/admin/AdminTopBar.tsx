"use client";

/**
 * AdminTopBar - Sticky top bar for admin dashboard
 *
 * Contains: search input, notification icon, admin avatar.
 * Separate from PublicTopInfoBar.
 */

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Bell,
  User,
  LayoutDashboard,
  Package,
  ClipboardList,
  Users,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const adminMenuItems = [
  { label: "控制台", href: "/admin", icon: LayoutDashboard },
  { label: "商品管理", href: "/admin/products", icon: Package },
  { label: "订单管理", href: "/admin/orders", icon: ClipboardList },
  { label: "用户管理", href: "/admin/users", icon: Users },
  { label: "系统设置", href: "/admin/settings", icon: Settings },
];

export default function AdminTopBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="sticky top-0 z-30 flex h-[var(--admin-header-height)] items-center border-b border-border bg-white px-5 xl:px-7 2xl:px-8">
      <div className="flex w-full items-center justify-between gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                <LayoutDashboard className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">后台导航</SheetTitle>
              <div className="px-5 py-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-white font-bold text-lg">
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
              <nav className="py-3 px-3">
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
            </SheetContent>
          </Sheet>
          <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索订单、商品..." className="h-9 pl-9 text-sm" />
          </div>
        </div>

        {/* Right: notification and avatar */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
              3
            </Badge>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200">
              <User className="h-4 w-4 text-slate-500" />
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              管理员
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
