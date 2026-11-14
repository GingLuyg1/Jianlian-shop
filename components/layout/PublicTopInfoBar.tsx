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
import { Button } from "@/components/ui/button";
import { ACCOUNT_BALANCE_UPDATED_EVENT } from "@/lib/account/balance-events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getCurrentProfile,
  getSupabaseBrowserClient,
  hasSupabaseConfig,
  type UserProfile,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";

interface PublicTopInfoBarProps {
  announcementText?: string;
  mobileNavigationUntilLg?: boolean;
}

type CachedAuthState = {
  user: User | null;
  profile: UserProfile | null;
  ready: boolean;
};

let cachedAuthState: CachedAuthState = {
  user: null,
  profile: null,
  ready: false,
};

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
  const [user, setUser] = useState<User | null>(cachedAuthState.user);
  const [profile, setProfile] = useState<UserProfile | null>(
    cachedAuthState.profile
  );
  const [authReady, setAuthReady] = useState(cachedAuthState.ready);
  const [announcementDelay, setAnnouncementDelay] = useState(0);

  const updateAuthState = (
    nextUser: User | null,
    nextProfile: UserProfile | null,
    nextReady = true
  ) => {
    cachedAuthState = {
      user: nextUser,
      profile: nextProfile,
      ready: nextReady,
    };
    setUser(nextUser);
    setProfile(nextProfile);
    setAuthReady(nextReady);
  };

  useEffect(() => {
    setAnnouncementDelay(getAnnouncementAnimationDelay());
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      updateAuthState(null, null, true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        const nextProfile = await getCurrentProfile().catch(() => null);
        updateAuthState(session.user, nextProfile, true);
      } else {
        updateAuthState(null, null, true);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        updateAuthState(null, null, true);
      } else {
        getCurrentProfile()
          .then((nextProfile) =>
            updateAuthState(session.user, nextProfile, true)
          )
          .catch(() => updateAuthState(session.user, null, true));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshBalance = () => {
      const currentUser = cachedAuthState.user;
      if (!currentUser) return;
      void getCurrentProfile()
        .then((nextProfile) => {
          if (active && cachedAuthState.user?.id === currentUser.id) {
            updateAuthState(currentUser, nextProfile, true);
          }
        })
        .catch(() => {
          // Balance refresh is best-effort and must not disturb the payment result.
        });
    };
    window.addEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, refreshBalance);
    return () => {
      active = false;
      window.removeEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, refreshBalance);
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    updateAuthState(null, null, true);
    router.push("/");
    router.refresh();
  };

  const balance = profile?.balance ?? 0;

  return (
    <div
      data-storefront-topbar
      className={cn(
        "sticky top-[53px] z-30 bg-[#fcf8f3]/90 backdrop-blur-sm",
        mobileNavigationUntilLg ? "lg:top-0" : "md:top-0",
        isMobile && "relative !top-0"
      )}
    >
      <div className={cn(
        "mx-auto grid max-w-[1540px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 px-[var(--storefront-content-padding-x)]",
        !isMobile && "sm:h-[62px] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-2.5 sm:py-0 xl:grid-cols-[minmax(0,1fr)_142px_150px]"
      )}>
        {announcementText && (
          <div className={cn("col-span-2 min-w-0 overflow-hidden", !isMobile && "sm:col-span-1")}>
            <div className="flex h-8 items-center gap-2 rounded-xl border border-orange-100 bg-white px-2.5 shadow-sm shadow-orange-100/60 sm:h-9 sm:px-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-primary">
                <Megaphone className="h-3.5 w-3.5" />
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-orange-700 sm:text-[13px]">
                公告
              </span>
              <span className="h-3.5 w-px shrink-0 bg-orange-200" />
              <div className="flex-1 overflow-hidden whitespace-nowrap">
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
        )}

        <div className="flex h-8 min-w-0 items-center justify-start gap-1.5 justify-self-start rounded-xl border border-orange-100 bg-white px-2.5 shadow-sm shadow-orange-100/60 sm:h-9 sm:min-w-[132px] sm:justify-center sm:justify-self-center sm:px-3 xl:w-[142px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-primary sm:h-6 sm:w-6">
            <CreditCard className="h-3.5 w-3.5" />
          </span>
          <span className="whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
            余额
          </span>
          <span className="min-w-[44px] whitespace-nowrap text-center text-[12px] font-bold text-primary sm:min-w-[52px] sm:text-[13px]">
            ¥{balance.toFixed(2)}
          </span>
        </div>

        <div className="flex h-8 min-w-0 items-center justify-end gap-1.5 justify-self-end sm:h-9 sm:w-[150px]">
          {!authReady ? (
            <div className="flex h-8 items-center gap-2 sm:h-9" aria-hidden="true">
              <div className="h-8 w-16 animate-pulse rounded-xl bg-orange-100/70 sm:h-9 sm:w-20" />
              <div className="h-8 w-16 animate-pulse rounded-xl bg-orange-100/70 sm:h-9 sm:w-20" />
            </div>
          ) : user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 max-w-[180px] min-w-0 justify-between rounded-xl border-orange-100 bg-white px-2.5 text-[12px] font-semibold shadow-sm shadow-orange-100/60 hover:bg-orange-50 sm:h-9 sm:w-full sm:max-w-none sm:px-3 sm:text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {getDisplayName(user)}
                    </span>
                    <ChevronDown className="ml-1 h-3 w-3 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {accountNavigation.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.href === "/account"
                        ? pathname === "/account"
                        : Boolean(pathname?.startsWith(item.href));

                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={
                            active
                              ? "bg-orange-50 font-medium text-primary"
                              : undefined
                          }
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="mt-1 border-t border-border pt-2 text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
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
                <Link href="/login">
                  <LogIn className="mr-1 h-3 w-3" />
                  登录
                </Link>
              </Button>
              <Button
                size="sm"
                className="h-8 min-w-[64px] rounded-xl px-2.5 text-[12px] font-semibold shadow-sm shadow-orange-200/70 sm:h-9 sm:min-w-[72px] sm:px-3 sm:text-[13px]"
                asChild
              >
                <Link href="/register">
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
