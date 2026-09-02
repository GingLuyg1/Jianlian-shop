"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, LayoutDashboard, User } from "lucide-react";

import AdminGlobalSearch from "./AdminGlobalSearch";
import {
  adminNavigationItems,
  getAdminNavigationGroup,
  isAdminNavigationGroupActive,
  isAdminNavigationLinkActive,
  type AdminNavigationGroupKey,
} from "./admin-navigation";
import { toggleNavigationGroup } from "./admin-navigation-state.mjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function AdminTopBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeGroup = getAdminNavigationGroup(pathname);
  const [openSection, setOpenSection] = useState<AdminNavigationGroupKey | null>(routeGroup);

  useEffect(() => {
    setOpenSection(routeGroup);
  }, [pathname, routeGroup]);

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
                  {adminNavigationItems.map((item) => {
                    const Icon = item.icon;
                    if (item.type === "group") {
                      const active = isAdminNavigationGroupActive(pathname, item);
                      const open = openSection === item.key;
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => setOpenSection((current) => toggleNavigationGroup(current, item.key) as AdminNavigationGroupKey | null)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                              active
                                ? "bg-slate-100 font-medium text-slate-900"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                          </button>
                          {open && (
                            <ul className="mt-1 space-y-1 pl-7">
                              {item.children.map((child) => (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={cn(
                                      "block rounded-md px-3 py-2 text-sm transition-colors",
                                      isAdminNavigationLinkActive(pathname, child.href, searchParams.get("view"))
                                        ? "bg-slate-800 font-medium text-white"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    const active = isAdminNavigationLinkActive(pathname, item.href, searchParams.get("view"));
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
