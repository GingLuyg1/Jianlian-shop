"use client";

import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Code2, Copy, FileLock2, LogOut, Shield, UserCircle, WalletCards } from "lucide-react";
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
  { label: "账号资料", description: "账户余额与基础信息", href: "/account", icon: WalletCards },
  { label: "个人资料", description: "联系信息与常用地址", href: "/account/profile", icon: UserCircle },
  { label: "账号安全", description: "登录密码与安全验证", href: "/account/security", icon: Shield },
  { label: "隐私设置", description: "个人数据与隐私请求", href: "/account/privacy", icon: FileLock2 },
  { label: "API 接口", description: "接口服务 · 暂未开放", href: "/account/api", icon: Code2 },
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

        <div className={`${center.workspace} grid min-w-0 flex-1 grid-cols-1 gap-5 overflow-visible md:min-h-0 md:grid-cols-[248px_minmax(0,1fr)] md:overflow-hidden`}>
          <aside className={`${glass.surface} ${center.panel} ${center.nav} sidebar-scroll hidden h-full min-h-0 flex-col overflow-y-auto p-3 md:flex`}>
            <AccountIdentity email={email} verified={emailVerified} />
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
            <div className={`${glass.surface} ${center.panel} overflow-hidden p-2`}>
              <AccountIdentity email={email} verified={emailVerified} compact />
              <div className="flex gap-2 overflow-x-auto">
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
          </div>

          <main ref={contentRef} className={`${center.content} ${center.contentFrame} min-w-0 overflow-visible md:min-h-0 md:overflow-y-auto`}>{children}</main>
        </div>
      </div>
    </PublicLayout>
  );
}

function AccountIdentity({ email, verified, compact = false }: { email: string; verified: boolean; compact?: boolean }) {
  const name = email.split("@")[0] || "我的账号";
  return <div className={cn(center.identity, compact && center.identityCompact)}>
    <span className={center.identityAvatar} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-slate-500">个人中心</p>
      <p className="mt-1 truncate text-base font-semibold text-slate-900" title={name}>{name}</p>
      <div className="mt-1 flex min-w-0 items-center gap-1"><span className="truncate text-xs text-slate-500" title={email}>{email}</span><button type="button" disabled={!email} aria-label="复制登录邮箱" className="shrink-0 rounded-md p-1 text-orange-500 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={async () => { try { await navigator.clipboard.writeText(email); toast.success("邮箱已复制"); } catch { toast.error("复制失败，请手动复制邮箱"); } }}><Copy className="h-3 w-3" /></button></div>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500"><CheckCircle2 className={cn("h-3 w-3", verified ? "text-emerald-500" : "text-orange-500")} />{verified ? "邮箱已验证" : "邮箱待验证"}</span>
    </div>
    {!compact ? <div className={center.membership}><span>会员权益</span><span className="text-slate-400">暂未开放</span></div> : null}
  </div>;
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
          ><span className={center.navIcon}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block">{item.label}</span>{!compact ? <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{item.description}</span> : null}</span></Link>
        );
      })}
    </div>
  );
}
