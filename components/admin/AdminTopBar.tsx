"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileLock2,
  ImageIcon,
  LayoutDashboard,
  Package,
  PackageCheck,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  User,
  Users,
  WalletCards,
} from "lucide-react";

import AdminGlobalSearch from "./AdminGlobalSearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const adminMenuItems = [
  { label: "控制台", href: "/admin", icon: LayoutDashboard },
  { label: "商品列表", href: "/admin/products", icon: Package },
  { label: "分类管理", href: "/admin/categories", icon: Package },
  { label: "数字库存", href: "/admin/inventory", icon: PackageCheck },
  { label: "媒体资源", href: "/admin/media", icon: ImageIcon },
  { label: "支付管理", href: "/admin/payments", icon: WalletCards },
  { label: "充值管理", href: "/admin/recharges", icon: WalletCards },
  { label: "订单管理", href: "/admin/orders", icon: ClipboardList },
  { label: "售后退款", href: "/admin/refunds", icon: RotateCcw },
  { label: "用户管理", href: "/admin/users", icon: Users },
  { label: "隐私请求", href: "/admin/privacy-requests", icon: FileLock2 },
  { label: "系统设置", href: "/admin/settings", icon: Settings },
  { label: "异常中心", href: "/admin/system-errors", icon: AlertTriangle },
  { label: "项目验收", href: "/admin/system/project-status", icon: ClipboardCheck },
  { label: "数据库状态", href: "/admin/system/database", icon: ShieldCheck },
  { label: "生产封板", href: "/admin/system/production-readiness", icon: ShieldCheck },
  { label: "操作日志", href: "/admin/audit-logs", icon: ScrollText },
];

export default function AdminTopBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="sticky top-0 z-30 flex h-[var(--admin-header-height)] shrink-0 items-center border-b border-border bg-white px-4 lg:px-5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" aria-label="打开后台导航">
                <LayoutDashboard className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">后台导航</SheetTitle>
              <div className="border-b border-border px-5 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white">
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
              <nav className="max-h-[calc(100dvh-82px)] overflow-y-auto px-3 py-3">
                <ul className="space-y-1">
                  {adminMenuItems.map((item) => {
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
            </SheetContent>
          </Sheet>

          <AdminGlobalSearch />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center p-0 text-[10px]">
              3
            </Badge>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200">
              <User className="h-4 w-4 text-slate-500" />
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">管理员</span>
          </div>
        </div>
      </div>
    </div>
  );
}
