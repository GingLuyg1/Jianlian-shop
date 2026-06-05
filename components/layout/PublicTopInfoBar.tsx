"use client";

/**
 * PublicTopInfoBar - Compact top information bar for public pages
 *
 * This is NOT a navigation menu. It sits inside the main content area
 * (after the sidebar) and shows:
 * - Left: scrolling announcement
 * - Right: balance, login/register buttons (guest) or account info (logged in)
 *
 * Mock login state: uses a simple React state toggle to demonstrate
 * guest vs logged-in UI. Future authentication logic should replace this
 * with real Supabase auth state.
 */

import { useState } from "react";
import Link from "next/link";
import {
  LogIn,
  UserPlus,
  CreditCard,
  ChevronDown,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Props: allow parent to pass announcement text
interface PublicTopInfoBarProps {
  announcementText?: string;
}

export default function PublicTopInfoBar({
  announcementText,
}: PublicTopInfoBarProps) {
  // Mock login state - toggle between guest and logged-in views
  // Future Supabase auth integration: replace with useUser() from Supabase
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balance] = useState(0.0);

  return (
    <div className="sticky top-0 z-30 bg-white/88 backdrop-blur-sm border-b border-border">
      <div className="h-[82px] flex items-center justify-between px-4 gap-4">
        {/* Left: scrolling announcement */}
        {announcementText && (
          <div className="flex-1 overflow-hidden">
            <div className="h-11 flex items-center gap-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-lg px-4 shadow-sm shadow-orange-100/50">
              <span className="h-7 w-7 rounded-md bg-white text-primary flex items-center justify-center shrink-0 border border-orange-100">
                <Megaphone className="h-4 w-4" />
              </span>
              <span className="text-orange-700 text-sm font-semibold shrink-0">
                公告
              </span>
              <span className="h-4 w-px bg-orange-200 shrink-0" />
              <div className="overflow-hidden flex-1 whitespace-nowrap">
                <div className="animate-marquee-track inline-flex min-w-max">
                  <span className="text-sm text-orange-700/90 pr-12">
                    {announcementText}
                  </span>
                  <span
                    className="text-sm text-orange-700/90 pr-12"
                    aria-hidden="true"
                  >
                    {announcementText}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right: balance and auth buttons */}
        <div className="flex items-center gap-2 shrink-0 h-11">
          <span className="text-sm text-muted-foreground">
            当前余额：<span className="font-medium text-foreground">¥{balance.toFixed(2)}</span>
          </span>

          {isLoggedIn ? (
            <>
              <Button variant="outline" size="sm" className="h-9 text-sm">
                <CreditCard className="h-3 w-3 mr-1" />
                充值
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 text-sm gap-1">
                    138****5678
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem asChild>
                    <Link href="/account">账号中心</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account/orders">我的订单</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsLoggedIn(false)}
                    className="text-red-600"
                  >
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-9 text-sm" asChild>
                <Link href="/login">
                  <LogIn className="h-3 w-3 mr-1" />
                  登录
                </Link>
              </Button>
              <Button size="sm" className="h-9 text-sm" asChild>
                <Link href="/register">
                  <UserPlus className="h-3 w-3 mr-1" />
                  注册
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
