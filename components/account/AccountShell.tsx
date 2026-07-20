"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, FileLock2, LogOut, Shield, UserCircle, WalletCards } from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "账户概览", href: "/account", icon: WalletCards },
  { label: "个人资料", href: "/account/profile", icon: UserCircle },
  { label: "账号安全", href: "/account/security", icon: Shield },
  { label: "隐私设置", href: "/account/privacy", icon: FileLock2 },
];

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [resendSeconds, setResendSeconds] = useState(0);
  const redirectPath = useMemo(() => pathname || "/account", [pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;

    const syncViewportOverflow = () => {
      const overflow = desktopQuery.matches ? "hidden" : bodyOverflow;
      document.body.style.overflow = overflow;
      document.documentElement.style.overflow = desktopQuery.matches ? "hidden" : htmlOverflow;
    };

    syncViewportOverflow();
    desktopQuery.addEventListener("change", syncViewportOverflow);

    return () => {
      desktopQuery.removeEventListener("change", syncViewportOverflow);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const urlText = `${window.location.search}${window.location.hash}`;
      if (urlText.includes("error") || urlText.includes("error_code")) {
        toast.error("邮箱确认失败或链接已失效，请重新发送验证邮件。");
        window.history.replaceState(null, "", window.location.pathname);
      }

      if (!hasSupabaseConfig()) {
        router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !user) {
        toast.error("登录状态已失效，请重新登录。");
        router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
        return;
      }

      setEmail(user.email ?? "");
      setEmailVerified(Boolean(user.email_confirmed_at));
      setChecking(false);
    }

    checkSession();

    const supabase = hasSupabaseConfig() ? getSupabaseBrowserClient() : null;
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_OUT" || !session) && active) {
        router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      }
    }).data.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [redirectPath, router]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function handleSignOut() {
    if (!window.confirm("确认退出当前账号？")) return;
    try {
      await getSupabaseBrowserClient().auth.signOut({ scope: "global" });
      setEmail("");
      setEmailVerified(true);
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("退出登录失败，请稍后重试。");
    }
  }

  async function resendVerification() {
    if (!email || resendSeconds > 0) return;
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; alreadyVerified?: boolean } | null;
      if (!response.ok) throw new Error(payload?.error || "验证邮件发送失败，请稍后重试。");
      setResendSeconds(60);
      toast.success(payload?.alreadyVerified ? "邮箱已经完成验证。" : "验证邮件已发送，请检查邮箱。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证邮件发送失败，请稍后重试。");
    }
  }

  if (checking) {
    return (
      <PublicLayout contentClassName="px-4 py-6 md:px-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-12 animate-pulse rounded-xl bg-orange-100" />
          <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="h-72 animate-pulse rounded-xl bg-white" />
            <div className="h-96 animate-pulse rounded-xl bg-white" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  const emailNotice = !emailVerified ? (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>你的邮箱尚未验证。完成验证后可提升账号安全性。</span>
      </div>
      <Button variant="outline" size="sm" disabled={resendSeconds > 0} onClick={resendVerification}>
        {resendSeconds > 0 ? `${resendSeconds}s 后重发` : "重新发送验证邮件"}
      </Button>
    </div>
  ) : null;

  if (pathname === "/account/orders") {
    return (
      <PublicLayout contentClassName="max-w-none px-4 py-3 md:px-6">
        <div className={`mx-auto flex w-full max-w-[1540px] flex-col gap-3 overflow-visible md:min-h-0 md:overflow-hidden ${publicMainPanelHeightClassName}`}>
          {emailNotice}
          {children}
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout contentClassName="w-full max-w-none px-4 py-3 md:px-6">
      <div className={`mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-visible md:min-h-0 md:overflow-hidden ${publicMainPanelHeightClassName}`}>
        {emailNotice}

        <div className="grid min-w-0 flex-1 gap-4 overflow-visible md:min-h-0 md:grid-cols-[220px_minmax(0,1fr)] md:overflow-hidden">
          <aside className="hidden h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white p-2 shadow-sm md:flex">
            <AccountNav pathname={pathname || "/account"} />
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-auto flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-950"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </aside>

          <div className="md:hidden">
            <div className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2 shadow-sm">
              <AccountNav pathname={pathname || "/account"} compact />
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-500"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          </div>

          <main className="min-w-0 overflow-visible md:min-h-0 md:overflow-y-auto">{children}</main>
        </div>
      </div>
    </PublicLayout>
  );
}

function AccountNav({ compact, pathname }: { compact?: boolean; pathname: string }) {
  return (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              compact && "shrink-0",
              active
                ? "bg-orange-50 font-medium text-primary"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

