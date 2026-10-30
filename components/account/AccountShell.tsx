"use client";

import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, Code2, FileLock2, LogOut, Shield, UserCircle, WalletCards } from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import glass from "@/components/account/AccountGlass.module.css";
import center from "@/components/account/AccountCenter.module.css";
import { isAccountDataPage } from "@/lib/motion/account-page-ready";

const navItems = [
  { label: "账户概览", href: "/account", icon: WalletCards },
  { label: "个人资料", href: "/account/profile", icon: UserCircle },
  { label: "账号安全", href: "/account/security", icon: Shield },
  { label: "隐私设置", href: "/account/privacy", icon: FileLock2 },
  { label: "API 接口", href: "/account/api", icon: Code2 },
];

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ordersLoginRequired, setOrdersLoginRequired] = useState(false);
  const isOrdersPage = pathname === "/account/orders";
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [resendSeconds, setResendSeconds] = useState(0);
  const redirectPath = useMemo(() => pathname || "/account", [pathname]);
  const contentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const main = contentRef.current;
    if (!main || !isAccountDataPage(pathname)) return;
    const syncContent = () => {
      const page = main.querySelector<HTMLElement>("[data-account-page]");
      const settled = page?.dataset.accountPage === pathname && page.getAttribute("aria-busy") === "false";
      const failed = main.querySelector('[data-page-error="true"]');
      // Keep intermediate route titles/skeletons behind the loading layer.
      // Publish real content (or its error) in the same commit as readiness.
      main.style.visibility = settled || failed ? "visible" : "hidden";
    };
    syncContent();
    const observer = new MutationObserver(syncContent);
    observer.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-account-page", "aria-busy", "data-page-error"] });
    return () => { observer.disconnect(); main.style.removeProperty("visibility"); };
  }, [pathname, checking]);

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
        if (isOrdersPage) { setOrdersLoginRequired(true); setChecking(false); return; }
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
        if (isOrdersPage) { setOrdersLoginRequired(true); setChecking(false); return; }
        toast.error("登录状态已失效，请重新登录。");
        router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
        return;
      }

      setEmail(user.email ?? "");
      setOrdersLoginRequired(false);
      setEmailVerified(Boolean(user.email_confirmed_at));
      setChecking(false);
    }

    checkSession();

    const supabase = hasSupabaseConfig() ? getSupabaseBrowserClient() : null;
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_OUT" || !session) && active) {
        if (isOrdersPage) { setOrdersLoginRequired(true); setChecking(false); setEmail(""); return; }
        router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      }
      if (isOrdersPage && session?.user && active) {
        setOrdersLoginRequired(false);
        setEmail(session.user.email ?? "");
        setEmailVerified(Boolean(session.user.email_confirmed_at));
        setChecking(false);
      }
    }).data.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [redirectPath, router, isOrdersPage]);

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

  if (isOrdersPage && (checking || ordersLoginRequired)) {
    return <PublicLayout contentClassName="max-w-none px-4 py-3 md:px-6">
      <div data-account-orders-ready={!checking} className={`mx-auto flex w-full max-w-[1540px] flex-col ${publicMainPanelHeightClassName}`}>
        <section className={cn(glass.surface, "relative flex min-h-[440px] flex-1 flex-col overflow-hidden")}>
          <div className={cn(glass.hero, "px-6 py-6")}><h1 className="text-xl font-semibold">我的订单</h1><p className="mt-2 text-sm text-muted-foreground">订单记录与卡密信息</p></div>
          <div className="absolute inset-0 flex items-center justify-center bg-white/55 p-6 backdrop-blur-[3px]">
            <div role="status" className={cn(glass.inset, "w-full max-w-sm rounded-2xl px-7 py-8 text-center shadow-lg")}>
              <span className={cn(glass.icon, "mx-auto mb-4 h-12 w-12")}><FileLock2 className="h-6 w-6" strokeWidth={1.6} /></span>
              <h2 className="text-lg font-semibold">{checking ? "正在加载" : "暂未登录"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{checking ? "正在读取账户信息…" : "请登录后查看订单和卡密信息。"}</p>
              {!checking ? <div className="mt-6 flex justify-center gap-3"><Button asChild><Link href="/login?redirect=%2Faccount%2Forders">登录</Link></Button><Button asChild variant="outline"><Link href="/register?redirect=%2Faccount%2Forders">注册</Link></Button></div> : null}
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>;
  }

  if (checking) {
    return (
      <PublicLayout contentClassName="px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-[1640px] space-y-4">
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
        <div className={`mx-auto flex w-full max-w-[1640px] flex-col gap-3 overflow-visible md:min-h-0 md:overflow-hidden ${publicMainPanelHeightClassName}`}>
          {emailNotice}
          {children}
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout contentClassName="w-full max-w-none px-4 py-3 md:px-6">
      <div className={`mx-auto flex w-full max-w-[1640px] flex-col gap-4 overflow-visible md:min-h-0 md:overflow-hidden ${publicMainPanelHeightClassName}`}>
        {emailNotice}

        <div className={`${center.workspace} grid min-w-0 flex-1 grid-cols-1 gap-5 overflow-visible md:min-h-0 md:grid-cols-[212px_minmax(0,1fr)] md:overflow-hidden`}>
          <aside className={`${glass.surface} ${center.panel} ${center.nav} hidden h-full min-h-0 flex-col overflow-hidden p-3 md:flex`}>
            <div className="mb-3 flex items-center gap-2.5 border-b border-white/80 px-2 pb-4 pt-1">
              <span className={`${glass.icon} h-9 w-9`}><UserCircle className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
              <div><p className="text-sm font-semibold text-slate-800">我的账户</p><p className="mt-0.5 text-xs text-slate-500">资料与服务</p></div>
            </div>
            <AccountNav pathname={pathname || "/account"} />
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-auto flex w-full items-center gap-2 rounded-xl border-t border-white/80 px-3 py-3 text-sm text-slate-500 hover:bg-white/70 hover:text-slate-950"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </aside>

          <div className="min-w-0 md:hidden">
            <div className={`${glass.surface} ${center.panel} flex gap-2 overflow-x-auto p-2`}>
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

          <main ref={contentRef} className={`${center.content} ${center.contentFrame} min-w-0 overflow-visible md:min-h-0 md:overflow-y-auto`}>{children}</main>
        </div>
      </div>
    </PublicLayout>
  );
}

function AccountNav({ compact, pathname }: { compact?: boolean; pathname: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const pendingRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const update = () => {
      const target = pendingRef.current ?? pathname;
      // Commit the visual selection only after the requested route AND its
      // own initial data have settled; stale route/data commits cannot win.
      if (target !== pathname || window.location.pathname !== pathname) return;
      const page = Array.from(document.querySelectorAll<HTMLElement>("[data-account-page]")).find(node => node.dataset.accountPage === target);
      if (!page || page.dataset.accountReady !== "true") return;
      const link = Array.from(list.querySelectorAll<HTMLElement>("[data-account-nav]")).find(node => node.dataset.accountNav === target);
      if (!link || list.getBoundingClientRect().width === 0) return;
      const item = link.getBoundingClientRect(), box = list.getBoundingClientRect();
      indicator.style.width = `${item.width}px`;
      indicator.style.height = `${item.height}px`;
      indicator.style.transform = `translate3d(${item.left - box.left}px, ${item.top - box.top}px, 0)`;
      if (indicator.dataset.ready !== "true") indicator.getBoundingClientRect();
      indicator.dataset.ready = "true";
      pendingRef.current = null;
      setSelected(target);
    };
    update();
    const mutation = new MutationObserver(update);
    mutation.observe(document.querySelector("main") ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy", "data-account-page", "data-account-ready"] });
    const resize = new ResizeObserver(update);
    resize.observe(list);
    const onPopState = () => { pendingRef.current = null; };
    window.addEventListener("popstate", onPopState);
    return () => { mutation.disconnect(); resize.disconnect(); window.removeEventListener("popstate", onPopState); };
  }, [pathname]);

  return (
    <div ref={listRef} className={cn(center.slidingNav, compact && center.compactNav)}>
      <span ref={indicatorRef} className={center.navIndicator} data-testid="account-nav-indicator" aria-hidden="true" />
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = selected === item.href;
        return (
          <Link key={item.href} href={item.href} data-account-nav={item.href} aria-current={active ? "page" : undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
              pendingRef.current = item.href;
            }}
            className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", center.navLink, compact && "shrink-0", active ? "font-medium text-primary" : "text-slate-500")}
          ><Icon className="h-4 w-4" />{item.label}</Link>
        );
      })}
    </div>
  );
}
