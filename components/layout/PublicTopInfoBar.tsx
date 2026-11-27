"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  CreditCard,
  LogIn,
  LogOut,
  Megaphone,
  UserPlus,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { accountNavigation } from "@/components/account/account-navigation";
import { usePublicAuthProfile } from "@/components/auth/AuthProfileProvider";
import { isGuestAuthUser } from "@/lib/auth/guest-user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { triggerWaterRippleTransition } from "@/lib/motion/water-ripple-transition";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";

interface PublicTopInfoBarProps {
  announcementText?: string;
  mobileNavigationUntilLg?: boolean;
}

const ANNOUNCEMENT_DURATION_MS = 35000;
const ANNOUNCEMENT_START_KEY = "jianlian_announcement_started_at";
let fallbackAnnouncementStart = Date.now();

const highlightedAnnouncementParts = [
  "24小时内",
  "拿到账号第一时间检查账号",
  "严禁用于违法犯罪活动",
];

function renderAnnouncementText(text: string) {
  const pattern = new RegExp(
    `(${highlightedAnnouncementParts
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "g"
  );

  return text.split(pattern).map((part, index) =>
    highlightedAnnouncementParts.includes(part) ? (
      <span key={`${part}-${index}`} className="font-semibold text-red-600">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function getDisplayName(user: User | null) {
  if (!user?.email) return "我的账号";
  return user.email;
}



function getAnnouncementAnimationDelay() {
  if (typeof window === "undefined") return 0;

  try {
    const storedStart = Number(
      window.localStorage.getItem(ANNOUNCEMENT_START_KEY)
    );
    const start =
      Number.isFinite(storedStart) && storedStart > 0 ? storedStart : Date.now();

    if (!storedStart) {
      window.localStorage.setItem(ANNOUNCEMENT_START_KEY, String(start));
    }

    const elapsed = (Date.now() - start) % ANNOUNCEMENT_DURATION_MS;
    return -(elapsed / 1000);
  } catch {
    const elapsed =
      (Date.now() - fallbackAnnouncementStart) % ANNOUNCEMENT_DURATION_MS;
    return -(elapsed / 1000);
  }
}

export default function PublicTopInfoBar({
  announcementText,
  mobileNavigationUntilLg = false,
}: PublicTopInfoBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile } = useMobileStorefront();
  const { user: rawUser, profile, authReady, balance, signOut } = usePublicAuthProfile();
  const user = rawUser && !isGuestAuthUser(rawUser) ? rawUser : null;
  const displayBalance = user ? balance : 0;
  const [announcementDelay, setAnnouncementDelay] = useState(0);

  useEffect(() => {
    setAnnouncementDelay(getAnnouncementAnimationDelay());
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div
      data-storefront-topbar
      className={cn(
        pathname === "/" && !isMobile
          ? "relative z-0 bg-transparent"
          : "sticky top-[53px] z-30 bg-[#fcf8f3]/90 backdrop-blur-sm",
        mobileNavigationUntilLg ? "lg:top-0" : "md:top-0",
        isMobile && "relative !top-0"
      )}
    >
      <div className={cn(
        "mx-auto grid max-w-[1540px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 px-[var(--storefront-content-padding-x)]",
        isMobile && "!flex !py-1.5",
        !isMobile && pathname === "/" && "sm:h-[62px] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-2.5 sm:py-0 xl:grid-cols-[minmax(0,1fr)_142px_150px]",
        !isMobile && pathname !== "/" && "sm:h-[52px] sm:items-start sm:pt-[13px] sm:pb-[3px] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-2.5 xl:grid-cols-[minmax(0,1fr)_142px_150px]"
      )}>
        {announcementText ? (
          <div className={cn("relative z-10 col-span-2 min-w-0 flex-1 overflow-hidden", !isMobile && "sm:col-span-1")}>
            <div className="flex h-8 items-center gap-2 rounded-xl border border-orange-100 bg-white px-2.5 shadow-sm shadow-orange-100/60 sm:h-9 sm:px-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-primary">
                <Megaphone className="h-3.5 w-3.5" />
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-orange-700 sm:text-[13px]">
                公告
              </span>
              <span className="h-3.5 w-px shrink-0 bg-orange-200" />
              <div className="flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,transparent_0%,black_12px,black_calc(100%-36px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_12px,black_calc(100%-36px),transparent_100%)]">
                <div
                  className="animate-marquee-track inline-flex min-w-max"
                  style={{ animationDelay: `${announcementDelay}s` }}
                >
                  <span className="pr-10 text-[12px] text-orange-700/90 sm:text-[13px]">
                    {renderAnnouncementText(announcementText)}
                  </span>
                  <span
                    className="pr-10 text-[12px] text-orange-700/90 sm:text-[13px]"
                    aria-hidden="true"
                  >
                    {renderAnnouncementText(announcementText)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden sm:block" aria-hidden="true" />
        )}

        <div className={cn("hidden h-8 min-w-0 items-center justify-start gap-1.5 justify-self-start rounded-xl border border-orange-100 bg-white px-2.5 shadow-sm shadow-orange-100/60 sm:flex sm:h-9 sm:min-w-[132px] sm:justify-center sm:justify-self-center sm:px-3 xl:w-[142px]", isMobile && "!hidden")}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-primary sm:h-6 sm:w-6">
            <CreditCard className="h-3.5 w-3.5" />
          </span>
          <span className="whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
            余额
          </span>
          {!authReady || (user && !profile) ? (
            <div className="h-4 w-12 animate-pulse rounded bg-orange-100/70" />
          ) : (
            <span className="min-w-[44px] whitespace-nowrap text-center text-[12px] font-bold text-primary sm:min-w-[52px] sm:text-[13px]">
              ¥{displayBalance.toFixed(2)}
            </span>
          )}
        </div>

        <div className={cn("hidden h-8 min-w-0 items-center justify-end gap-1.5 justify-self-end sm:flex sm:h-9 sm:w-[150px]", isMobile && "!hidden")}>
          {!authReady ? (
            <div className="flex h-8 w-full items-center justify-end gap-1.5 sm:h-9" aria-hidden="true">
              <div className="h-8 w-[68px] animate-pulse rounded-xl bg-orange-100/70 sm:h-9 sm:w-[70px]" />
              <div className="h-8 w-[68px] animate-pulse rounded-xl bg-orange-100/70 sm:h-9 sm:w-[70px]" />
            </div>
          ) : user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="group h-8 max-w-[180px] min-w-0 justify-between rounded-xl border-orange-100 bg-white px-2.5 text-[12px] font-semibold shadow-sm shadow-orange-100/60 transition-all hover:border-orange-200 hover:bg-orange-50/70 data-[state=open]:border-orange-300 data-[state=open]:bg-orange-50/80 sm:h-9 sm:w-full sm:max-w-none sm:px-3 sm:text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-left text-slate-800">
                      {getDisplayName(user)}
                    </span>
                    <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-2xl border border-orange-100/90 bg-white/95 p-1.5 shadow-[0_18px_42px_-12px_rgba(124,72,32,0.18),0_4px_12px_-4px_rgba(15,23,42,0.06)] ring-1 ring-white/90 backdrop-blur-xl"
                >
                  <div className="space-y-0.5">
                    {accountNavigation.map((item) => {
                      const Icon = item.icon;
                      const active =
                        item.href === "/account"
                          ? pathname === "/account"
                          : Boolean(pathname?.startsWith(item.href));

                      return (
                        <DropdownMenuItem
                          key={item.href}
                          asChild
                          className="cursor-pointer rounded-xl px-2.5 py-2 text-[13px] font-medium text-slate-700 transition-all focus:bg-orange-50/90 focus:text-primary"
                        >
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-2.5",
                              active && "bg-orange-50/95 font-bold text-primary shadow-2xs"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                                active
                                  ? "border-orange-200 bg-white text-primary shadow-2xs"
                                  : "border-orange-100/70 bg-orange-50/50 text-slate-600"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                  <div className="my-1.5 h-px bg-gradient-to-r from-transparent via-orange-100 to-transparent" />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="group cursor-pointer rounded-xl px-2.5 py-2 text-[13px] font-semibold text-rose-600 transition-all focus:bg-rose-50/90 focus:text-rose-700"
                  >
                    <span className="mr-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-rose-50/70 text-rose-600 transition-colors group-focus:border-rose-200 group-focus:bg-rose-100/80">
                      <LogOut className="h-3.5 w-3.5" />
                    </span>
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 min-w-[64px] rounded-xl border-orange-100 bg-white px-2.5 text-[12px] font-semibold shadow-sm shadow-orange-100/60 hover:bg-orange-50 sm:h-9 sm:min-w-[72px] sm:px-3 sm:text-[13px]"
                asChild
              >
                <Link
                  href="/login"
                  onMouseEnter={() => router.prefetch("/login")}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    triggerWaterRippleTransition({ originEl: event.currentTarget });
                    router.push("/login");
                  }}
                >
                  <LogIn className="mr-1 h-3 w-3" />
                  登录
                </Link>
              </Button>
              <Button
                size="sm"
                className="h-8 min-w-[64px] rounded-xl px-2.5 text-[12px] font-semibold shadow-sm shadow-orange-200/70 sm:h-9 sm:min-w-[72px] sm:px-3 sm:text-[13px]"
                asChild
              >
                <Link
                  href="/register"
                  onMouseEnter={() => router.prefetch("/register")}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    triggerWaterRippleTransition({ originEl: event.currentTarget });
                    router.push("/register");
                  }}
                >
                  <UserPlus className="mr-1 h-3 w-3" />
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
