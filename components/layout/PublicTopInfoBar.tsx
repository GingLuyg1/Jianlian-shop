"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CreditCard,
  LogIn,
  Megaphone,
  UserPlus,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
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

interface PublicTopInfoBarProps {
  announcementText?: string;
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

function getDisplayName(user: User | null) {
  if (!user?.email) return "我的账号";
  return user.email.length > 18 ? `${user.email.slice(0, 15)}...` : user.email;
}

export default function PublicTopInfoBar({
  announcementText,
}: PublicTopInfoBarProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(cachedAuthState.user);
  const [profile, setProfile] = useState<UserProfile | null>(
    cachedAuthState.profile
  );
  const [authReady, setAuthReady] = useState(cachedAuthState.ready);

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
        try {
          const nextProfile = await getCurrentProfile();
          if (mounted) updateAuthState(session.user, nextProfile, true);
        } catch {
          if (mounted) updateAuthState(session.user, null, true);
        }
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
  }, [router]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    updateAuthState(null, null, true);
    router.push("/");
    router.refresh();
  };

  const balance = profile?.balance ?? 0;

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-white/88 backdrop-blur-sm">
      <div className="grid h-[62px] grid-cols-[minmax(0,980px)_285px] items-center justify-between gap-3 px-4">
        {announcementText && (
          <div className="min-w-0 overflow-hidden">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 px-3 shadow-sm shadow-orange-100/50">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-orange-100 bg-white text-primary">
                <Megaphone className="h-3 w-3" />
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-orange-700">
                公告
              </span>
              <span className="h-3.5 w-px shrink-0 bg-orange-200" />
              <div className="flex-1 overflow-hidden whitespace-nowrap">
                <div className="animate-marquee-track inline-flex min-w-max">
                  <span className="pr-10 text-[13px] text-orange-700/90">
                    {announcementText}
                  </span>
                  <span
                    className="pr-10 text-[13px] text-orange-700/90"
                    aria-hidden="true"
                  >
                    {announcementText}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex h-9 w-[285px] items-center justify-end gap-1.5">
          <span className="whitespace-nowrap text-[13px] text-muted-foreground">
            当前余额：
            <span className="font-medium text-foreground">
              ¥{balance.toFixed(2)}
            </span>
          </span>

          {!authReady ? (
            <div className="flex h-9 items-center gap-2" aria-hidden="true">
              <div className="h-9 w-16 animate-pulse rounded-md bg-orange-100/70" />
              <div className="h-9 w-24 animate-pulse rounded-md bg-orange-100/70" />
            </div>
          ) : user ? (
            <>
              <Button variant="outline" size="sm" className="h-8 px-3 text-[13px]" asChild>
                <Link href="/products/account-recharge">
                  <CreditCard className="mr-1 h-3 w-3" />
                  充值
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[13px]">
                    {getDisplayName(user)}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem asChild>
                    <Link href="/account">账号中心</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account/orders">我的订单</Link>
                  </DropdownMenuItem>
                  {profile?.role === "admin" ? (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">后台管理</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-red-600"
                  >
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-[13px]" asChild>
                <Link href="/login">
                  <LogIn className="mr-1 h-3 w-3" />
                  登录
                </Link>
              </Button>
              <Button size="sm" className="h-8 px-3 text-[13px]" asChild>
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
