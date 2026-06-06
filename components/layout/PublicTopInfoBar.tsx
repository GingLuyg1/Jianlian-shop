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

function getDisplayName(user: User | null) {
  if (!user?.email) return "我的账号";
  return user.email.length > 18 ? `${user.email.slice(0, 15)}...` : user.email;
}

export default function PublicTopInfoBar({
  announcementText,
}: PublicTopInfoBarProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setAuthReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      setUser(session?.user ?? null);

      if (session?.user) {
        try {
          setProfile(await getCurrentProfile());
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }

      setAuthReady(true);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
      } else {
        getCurrentProfile()
          .then(setProfile)
          .catch(() => setProfile(null));
      }
      setAuthReady(true);
      router.refresh();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.push("/");
    router.refresh();
  };

  const balance = profile?.balance ?? 0;

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-white/88 backdrop-blur-sm">
      <div className="flex h-[82px] items-center justify-between gap-4 px-4">
        {announcementText && (
          <div className="flex-1 overflow-hidden">
            <div className="flex h-11 items-center gap-3 rounded-lg border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 px-4 shadow-sm shadow-orange-100/50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-orange-100 bg-white text-primary">
                <Megaphone className="h-4 w-4" />
              </span>
              <span className="shrink-0 text-sm font-semibold text-orange-700">
                公告
              </span>
              <span className="h-4 w-px shrink-0 bg-orange-200" />
              <div className="flex-1 overflow-hidden whitespace-nowrap">
                <div className="animate-marquee-track inline-flex min-w-max">
                  <span className="pr-12 text-sm text-orange-700/90">
                    {announcementText}
                  </span>
                  <span
                    className="pr-12 text-sm text-orange-700/90"
                    aria-hidden="true"
                  >
                    {announcementText}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex h-11 shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground">
            当前余额：
            <span className="font-medium text-foreground">
              ¥{balance.toFixed(2)}
            </span>
          </span>

          {authReady && user ? (
            <>
              <Button variant="outline" size="sm" className="h-9 text-sm" asChild>
                <Link href="/products/account-recharge">
                  <CreditCard className="mr-1 h-3 w-3" />
                  充值
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 gap-1 text-sm">
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
              <Button variant="ghost" size="sm" className="h-9 text-sm" asChild>
                <Link href="/login">
                  <LogIn className="mr-1 h-3 w-3" />
                  登录
                </Link>
              </Button>
              <Button size="sm" className="h-9 text-sm" asChild>
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
