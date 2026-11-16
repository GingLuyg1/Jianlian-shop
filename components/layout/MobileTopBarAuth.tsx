"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, CreditCard, LogIn, LogOut, UserPlus } from "lucide-react";
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

function getDisplayName(user: User | null) {
  if (!user?.email) return "我的账号";
  const email = user.email;
  const at = email.indexOf("@");
  if (at <= 3) return email;
  return `${email.slice(0, 3)}***${email.slice(at)}`;
}

export default function MobileTopBarAuth() {
  const router = useRouter();
  const pathname = usePathname();
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

      if (session?.user) {
        const nextProfile = await getCurrentProfile().catch(() => null);
        setUser(session.user);
        setProfile(nextProfile);
      } else {
        setUser(null);
        setProfile(null);
      }
      setAuthReady(true);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setAuthReady(true);
      } else {
        setUser(session.user);
        getCurrentProfile()
          .then((nextProfile) => {
            setProfile(nextProfile);
            setAuthReady(true);
          })
          .catch(() => setAuthReady(true));
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
      if (!user) return;
      void getCurrentProfile()
        .then((nextProfile) => {
          if (active) setProfile(nextProfile);
        })
        .catch(() => {});
    };
    window.addEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, refreshBalance);
    return () => {
      active = false;
      window.removeEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, refreshBalance);
    };
  }, [user]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.push("/");
    router.refresh();
  };

  if (!authReady) {
    return (
      <div className="flex h-7 items-center gap-1.5" aria-hidden="true">
        <div className="h-7 w-14 animate-pulse rounded-lg bg-orange-100/70" />
      </div>
    );
  }

  const balance = profile?.balance ?? 0;

  if (user) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href="/products/account-recharge"
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-orange-200/80 bg-orange-50/70 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-orange-100/70"
          title="账户余额"
        >
          <CreditCard className="h-3 w-3 shrink-0" />
          <span>¥{balance.toFixed(2)}</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 max-w-[130px] justify-between rounded-lg border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-none hover:bg-slate-50"
            >
              <span className="truncate">{getDisplayName(user)}</span>
              <ChevronDown className="ml-0.5 h-3 w-3 shrink-0 text-slate-400" />
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
                    className={active ? "bg-orange-50 font-medium text-primary" : undefined}
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
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] font-medium text-slate-700 hover:bg-orange-50 hover:text-primary"
        asChild
      >
        <Link href="/login">
          <LogIn className="mr-1 h-3 w-3" />
          登录
        </Link>
      </Button>
      <Button
        size="sm"
        className="h-7 rounded-lg bg-primary px-2.5 text-[11px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        asChild
      >
        <Link href="/register">
          <UserPlus className="mr-1 h-3 w-3" />
          注册
        </Link>
      </Button>
    </div>
  );
}
