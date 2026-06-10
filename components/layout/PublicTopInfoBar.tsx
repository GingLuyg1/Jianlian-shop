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

const highlightedAnnouncementParts = [
  "24小时内",
  "拿到账号第一时间检查账号",
  "本站产品拒绝任何违法行为，不提供任何教程（仅限登录），不为任何非法行业提供任何支持，仅提供电商拓客服务。",
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
    <div className="sticky top-0 z-30 border-b border-border bg-[#fcf8f3]/90 backdrop-blur-sm">
      <div className="mx-auto grid h-[62px] max-w-[1540px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 md:px-3 xl:grid-cols-[minmax(0,1fr)_142px_170px]">
        {announcementText && (
          <div className="min-w-0 overflow-hidden">
            <div className="flex h-9 items-center gap-2 rounded-xl border border-orange-100 bg-white px-3 shadow-sm shadow-orange-100/60">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-primary">
                <Megaphone className="h-3.5 w-3.5" />
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-orange-700">
                公告
              </span>
              <span className="h-3.5 w-px shrink-0 bg-orange-200" />
              <div className="flex-1 overflow-hidden whitespace-nowrap">
                <div className="animate-marquee-track inline-flex min-w-max">
                  <span className="pr-10 text-[13px] text-orange-700/90">
                    {renderAnnouncementText(announcementText)}
                  </span>
                  <span
                    className="pr-10 text-[13px] text-orange-700/90"
                    aria-hidden="true"
                  >
                    {renderAnnouncementText(announcementText)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex h-9 min-w-[132px] translate-x-[13px] items-center justify-center gap-1.5 justify-self-center rounded-xl border border-orange-100 bg-white px-3 shadow-sm shadow-orange-100/60 xl:w-[142px]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-primary">
            <CreditCard className="h-3.5 w-3.5" />
          </span>
          <span className="whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
            余额
          </span>
          <span className="whitespace-nowrap text-[13px] font-bold text-primary">
            ¥{balance.toFixed(2)}
          </span>
        </div>

        <div className="flex h-9 w-auto items-center justify-end gap-1.5 xl:w-[170px]">
          {!authReady ? (
            <div className="flex h-9 items-center gap-2" aria-hidden="true">
              <div className="h-9 w-20 animate-pulse rounded-xl bg-orange-100/70" />
              <div className="h-9 w-20 animate-pulse rounded-xl bg-orange-100/70" />
            </div>
          ) : user ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl border-orange-100 bg-white px-4 text-[13px] font-semibold text-orange-700 shadow-sm shadow-orange-100/60 hover:bg-orange-50"
                asChild
              >
                <Link href="/products/account-recharge">
                  <CreditCard className="mr-1 h-3 w-3" />
                  充值
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 max-w-[138px] rounded-xl border-orange-100 bg-white px-3 text-[13px] font-semibold shadow-sm shadow-orange-100/60 hover:bg-orange-50"
                  >
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
              <Button
                variant="outline"
                size="sm"
                className="h-9 min-w-[72px] rounded-xl border-orange-100 bg-white px-3 text-[13px] font-semibold shadow-sm shadow-orange-100/60 hover:bg-orange-50"
                asChild
              >
                <Link href="/login">
                  <LogIn className="mr-1 h-3 w-3" />
                  登录
                </Link>
              </Button>
              <Button
                size="sm"
                className="h-9 min-w-[72px] rounded-xl px-3 text-[13px] font-semibold shadow-sm shadow-orange-200/70"
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
