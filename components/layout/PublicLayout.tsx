"use client";

import { ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock3, Copy, ExternalLink, Headphones, Mail, Monitor, Send, Smartphone } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { SettingsProvider, usePublicSettings } from "@/components/settings/SettingsProvider";
import { AuthProfileProvider } from "@/components/auth/AuthProfileProvider";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import MobileMenu from "./MobileMenu";
import MobileTopBarAuth from "./MobileTopBarAuth";
import PublicSidebar from "./PublicSidebar";
import PublicTopInfoBar from "./PublicTopInfoBar";
import RouteLoadingIndicator from "./RouteLoadingIndicator";
import { OPEN_PUBLIC_SUPPORT_EVENT } from "@/lib/support/open-public-support";
import { clearCatalogRoutePending, getCatalogRoutePending, rebaseCatalogRoutePending, startCatalogPopstate } from "@/lib/motion/catalog-route-exit";
import {
  clearStorefrontPageExit,
  getStorefrontPageTransitionGroup,
  isAnimatedStorefrontPagePath,
} from "@/lib/motion/storefront-page-transition";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { clearPublicProductPages } from "@/lib/catalog/public-product-query-cache";
import { invalidatePublicRechargeChannels, schedulePublicRechargeChannelsPrefetch } from "@/lib/catalog/public-recharge-channels";
import { ensureAccountRecordPreload } from "@/lib/account/record-auth";

interface PublicLayoutProps {
  children: ReactNode;
  contentClassName?: string;
  viewportLocked?: boolean;
  mobileNavigationUntilLg?: boolean;
}

export default function PublicLayout({
  children,
  contentClassName,
  viewportLocked = false,
  mobileNavigationUntilLg = false,
}: PublicLayoutProps) {
  const resolvedContentClassName = contentClassName
    ?? cn("p-4 md:p-6 max-w-7xl mx-auto", mobileNavigationUntilLg ? "lg:mt-0" : "md:mt-0");
  return (
    <SettingsProvider>
      <AuthProfileProvider>
        <PublicLayoutContent
          contentClassName={resolvedContentClassName}
          viewportLocked={viewportLocked}
          mobileNavigationUntilLg={mobileNavigationUntilLg}
        >
          {children}
        </PublicLayoutContent>
      </AuthProfileProvider>
    </SettingsProvider>
  );
}

// Approved storefront support card defaults. Live values are read from
// public site_settings (/admin/settings -> contact) with safe fallback.
const SUPPORT_TELEGRAM_URL = "https://t.me/Ezeasl";
const SUPPORT_EMAIL = "Yac0000189@gmail.com";
const SUPPORT_HOURS = "12:00 - 24:00 (GMT+8)";
const SUPPORT_NOTE = "有问题均可留言，客服会在24小时内处理并留言。";
const FALLBACK_COPYRIGHT_YEAR = 2026;

function resolveSupportTelegramUrl(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return /^https:\/\/[^\s]+$/i.test(trimmed) ? trimmed : SUPPORT_TELEGRAM_URL;
}

function MobileSupportFab({
  isMobile,
  mobilePreview,
  previewWidth,
  mobileNavigationUntilLg,
  onSupportOpen,
}: {
  isMobile: boolean;
  mobilePreview: boolean;
  previewWidth: number | null;
  mobileNavigationUntilLg: boolean;
  onSupportOpen: () => void;
}) {
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    let scrollTimer: number | null = null;
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        setIsScrolling(false);
      }, 360);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimer) window.clearTimeout(scrollTimer);
    };
  }, [isMobile]);

  return (
    <button
      type="button"
      onClick={onSupportOpen}
      data-testid="floating-support-btn"
      style={
        mobilePreview && previewWidth
          ? { right: `calc(50% - ${previewWidth / 2}px + 10px)`, bottom: "14px" }
          : { right: "10px", bottom: "14px" }
      }
      className={cn(
        "fixed z-40 flex h-9 w-9 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-md shadow-orange-500/25 backdrop-blur-xs transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isScrolling ? "translate-x-5 opacity-45" : "translate-x-0 opacity-90 hover:opacity-100",
        mobileNavigationUntilLg ? "lg:hidden" : "md:hidden",
        isMobile && "!flex",
      )}
      aria-label="在线客服"
      title="在线客服"
    >
      <Headphones className="h-4 w-4" />
    </button>
  );
}

function PublicLayoutContent({ children, contentClassName, viewportLocked = false, mobileNavigationUntilLg = false }: PublicLayoutProps) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [copyrightYear, setCopyrightYear] = useState(FALLBACK_COPYRIGHT_YEAR);
  const supportTrigger = useRef<HTMLElement | null>(null);
  const openSupport = useCallback(() => {
    supportTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSupportOpen(true);
  }, []);
  useEffect(() => {
    const nowYear = new Date().getFullYear();
    if (nowYear > FALLBACK_COPYRIGHT_YEAR) setCopyrightYear(nowYear);
  }, []);
  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    // Public listings contain no account data; still discard them across
    // account changes so one browser session cannot reuse another's snapshot.
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
        clearPublicProductPages();
        invalidatePublicRechargeChannels();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const pathname = usePathname();
  useEffect(() => {
    if (
      pathname.startsWith("/products/account-recharge") ||
      pathname.startsWith("/checkout") ||
      pathname.startsWith("/payment") ||
      pathname.startsWith("/account")
    ) {
      return schedulePublicRechargeChannelsPrefetch();
    }
  }, [pathname]);
  useEffect(() => {
    if (
      pathname.startsWith("/account") ||
      pathname.startsWith("/checkout") ||
      pathname.startsWith("/payment") ||
      pathname.startsWith("/products/account-recharge") ||
      pathname.startsWith("/promotion")
    ) {
      ensureAccountRecordPreload();
    }
  }, [pathname]);
  useEffect(() => {
    window.addEventListener(OPEN_PUBLIC_SUPPORT_EVENT, openSupport);
    return () => window.removeEventListener(OPEN_PUBLIC_SUPPORT_EVENT, openSupport);
  }, [openSupport]);
  const router = useRouter();
  useEffect(() => {
    clearStorefrontPageExit();
    const pending = getCatalogRoutePending();
    const targetPath = pending?.target ? pending.target.split("?")[0] : "";
    if (!pending || targetPath === pathname) {
      clearCatalogRoutePending();
    } else if (rebaseCatalogRoutePending(pathname)) {
      router.replace(pending.target, { scroll: false });
    } else {
      clearCatalogRoutePending();
    }
  }, [pathname, router]);
  useEffect(() => {
    const onPopstate = () => startCatalogPopstate(pathname, window.location.pathname);
    window.addEventListener("popstate", onPopstate);
    return () => window.removeEventListener("popstate", onPopstate);
  }, [pathname]);
  const { settings } = usePublicSettings();
  const { isMobile, previewWidth, mobilePreview, showToggle, setMobilePreviewSize, cycleMobilePreviewSize } = useMobileStorefront();
  const pagePlacement = pathname === "/" ? "home" : pathname.startsWith("/checkout") ? "checkout" : pathname.startsWith("/account") ? "account" : null;
  const pageAnnouncement = pagePlacement ? settings.announcements?.find((item) => item.placement === pagePlacement) : undefined;
  const globalAnnouncement = settings.announcements?.find((item) => item.placement === "global_top");
  const homeAnnouncement = settings.announcements?.find((item) => item.placement === "home");
  const announcement =
    pageAnnouncement?.content.trim() ||
    globalAnnouncement?.content.trim() ||
    homeAnnouncement?.content.trim() ||
    settings.top_announcement.trim();
  const subtitle = settings.site_description || settings.site_subtitle || "数字商品服务";
  const supportTelegramUrl = resolveSupportTelegramUrl(settings.support_telegram);
  const supportEmail = settings.support_email?.trim() || SUPPORT_EMAIL;
  const supportHours = settings.support_hours?.trim() || SUPPORT_HOURS;
  const supportNote = settings.support_note?.trim() || SUPPORT_NOTE;
  const hideMobileSupportFab =
    pathname.startsWith("/tutorials") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/payment") ||
    pathname.startsWith("/products/account-recharge");

  return (
    <div
      data-storefront-ui
      data-mobile-active={isMobile ? "true" : undefined}
      style={{ maxWidth: previewWidth ? `${previewWidth}px` : undefined }}
      className={cn(
        viewportLocked && !isMobile ? "h-[100dvh] overflow-hidden" : isMobile ? "min-h-screen overflow-x-clip" : "min-h-screen overflow-x-hidden",
        "bg-background [--storefront-content-padding-x:16px] [--storefront-main-offset:0px] [--storefront-sidebar-width:160px] lg:[--storefront-main-offset:252px] lg:[--storefront-sidebar-width:232px]",
        !mobileNavigationUntilLg && !isMobile && "md:[--storefront-main-offset:252px] md:[--storefront-sidebar-width:232px]",
        isMobile && "[--storefront-content-padding-x:12px] lg:[--storefront-main-offset:0px]",
        mobilePreview && "mx-auto w-full border-x border-orange-200/80 shadow-[0_0_0_1px_rgba(214,180,148,0.45),0_20px_50px_-12px_rgba(89,56,30,0.28)]",
      )}
    >
      <Suspense fallback={null}>
        <RouteLoadingIndicator />
      </Suspense>
      <PublicSidebar onSupportOpen={openSupport} mobileNavigationUntilLg={mobileNavigationUntilLg} />

      <div
        data-testid="mobile-top-brand-bar"
        style={{ maxWidth: previewWidth ? `${previewWidth}px` : undefined }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-1.5 border-b border-border bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur-sm",
          mobileNavigationUntilLg ? "lg:hidden" : "md:hidden",
          isMobile && "!flex",
          mobilePreview && "mx-auto w-full border-x border-orange-200/80",
        )}
      >
        <div className="flex shrink-0 items-center gap-1.5">
          <MobileMenu onSupportOpen={openSupport} mobileNavigationUntilLg={mobileNavigationUntilLg} />
          <Link href="/" className="flex shrink-0 items-center gap-1.5">
            <img
              src="/assets/jianlian-brand-logo-96.webp"
              alt="Jianlian"
              width={26}
              height={26}
              className="h-6.5 w-6.5 shrink-0 rounded-md object-cover"
            />
            <div className="shrink-0">
              <div className="whitespace-nowrap text-[13px] font-black leading-tight text-slate-900">{settings.site_name || "Jianlian"}</div>
              <div className="whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{subtitle}</div>
            </div>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showToggle ? (
            <button
              type="button"
              data-testid="mobile-preview-header-toggle"
              onClick={cycleMobilePreviewSize}
              className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-orange-200 bg-orange-50/70 px-1.5 text-[10px] font-semibold text-primary transition-colors hover:bg-orange-100"
              title="点击在 390px 标屏 / 430px 大屏 / 360px 小屏 / 全宽 之间切换"
            >
              {mobilePreview ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              <span>{previewWidth ? `${previewWidth}px` : "全宽"}</span>
            </button>
          ) : null}
          <MobileTopBarAuth />
        </div>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "h-[53px] shrink-0",
          mobileNavigationUntilLg ? "lg:hidden" : "md:hidden",
          isMobile && "!block",
        )}
      />

      <main className={cn(
        viewportLocked && !isMobile ? "flex h-[calc(100dvh-57px)] min-w-0 flex-col overflow-hidden md:h-[100dvh]" : "flex min-h-[100dvh] min-w-0 flex-col",
        mobileNavigationUntilLg ? "lg:ml-[var(--storefront-main-offset)]" : "md:ml-[var(--storefront-main-offset)]",
        pathname === "/" && !isMobile && "lg:pt-[10px]",
        isMobile && "!ml-0 !h-auto !overflow-visible pb-24",
      )}>
        <PublicTopInfoBar announcementText={announcement || undefined} mobileNavigationUntilLg={mobileNavigationUntilLg} />
        <div
          data-storefront-page-stage="true"
          className={cn(
            "w-full",
            pathname === "/" && !isMobile && "relative z-30",
            viewportLocked && !isMobile ? "min-h-0 flex-1 md:!pb-[20px]" : "flex-1 md:!pb-0",
            contentClassName,
          )}
          style={{ paddingInline: "var(--storefront-content-padding-x)" }}
        >
          {isAnimatedStorefrontPagePath(pathname) ? (
            <div
              key={getStorefrontPageTransitionGroup(pathname)}
              className={cn(
                "storefront-page-enter w-full",
                viewportLocked && !isMobile && "flex h-full min-h-0 flex-col",
              )}
            >
              {children}
            </div>
          ) : (
            children
          )}
        </div>
        <footer
          data-testid="public-site-footer"
          className="mt-auto w-full shrink-0 bg-transparent px-[var(--storefront-content-padding-x)] py-1.5 text-[11px] leading-none text-[#8c7a6b] md:fixed md:bottom-0 md:left-0 md:right-0 md:z-20 md:mt-0 md:flex md:h-[20px] md:w-full md:items-center md:bg-[#fbf7f1]/95 md:px-[20px] md:py-0 lg:px-[calc(var(--storefront-main-offset)+var(--storefront-content-padding-x))]"
        >
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="truncate">
              © {copyrightYear} {settings.site_name || "Jianlian"} · 7×24h 自动发货与售后质保
            </span>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link href="/account/orders" className="transition-colors hover:text-primary">
                订单查询
              </Link>
              <span aria-hidden="true" className="text-[#c9b8a8]">·</span>
              <Link href="/terms" className="transition-colors hover:text-primary">
                用户协议
              </Link>
              <span aria-hidden="true" className="text-[#c9b8a8]">·</span>
              <Link href="/privacy" className="transition-colors hover:text-primary">
                隐私政策
              </Link>
              <span aria-hidden="true" className="text-[#c9b8a8]">·</span>
              <button
                type="button"
                onClick={openSupport}
                className="font-medium text-primary transition-colors hover:underline"
              >
                在线客服
              </button>
            </div>
          </div>
        </footer>
      </main>

      {/* Floating preview controls on localhost / preview */}
      {showToggle ? (
        <div className="fixed bottom-20 left-4 z-50 flex flex-wrap items-center gap-1 rounded-2xl border border-orange-200/90 bg-white/95 p-1 shadow-lg shadow-slate-900/10 backdrop-blur-md">
          <span className="flex items-center gap-1 px-1.5 text-[11px] font-bold text-slate-500">
            <Smartphone className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">视口</span>
          </span>
          <button
            type="button"
            onClick={() => setMobilePreviewSize(375)}
            className={cn(
              "rounded-xl px-2 py-1 text-xs font-semibold transition-colors",
              previewWidth === 375 ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-orange-50"
            )}
            title="375px 小屏适配 (iPhone SE / 4.7寸)"
          >
            375 小屏
          </button>
          <button
            type="button"
            onClick={() => setMobilePreviewSize(390)}
            className={cn(
              "rounded-xl px-2 py-1 text-xs font-semibold transition-colors",
              previewWidth === 390 ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-orange-50"
            )}
            title="390px 标屏适配 (iPhone 13/14/15 6.1寸)"
          >
            390 标屏
          </button>
          <button
            type="button"
            onClick={() => setMobilePreviewSize(430)}
            className={cn(
              "rounded-xl px-2 py-1 text-xs font-semibold transition-colors",
              previewWidth === 430 ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-orange-50"
            )}
            title="430px 大屏适配 (iPhone Pro Max 6.7寸)"
          >
            430 大屏
          </button>
          <button
            type="button"
            onClick={() => setMobilePreviewSize(1366)}
            className={cn(
              "rounded-xl px-2 py-1 text-xs font-semibold transition-colors",
              previewWidth === 1366 ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:bg-amber-50"
            )}
            title="1366px 经典笔记本视口"
          >
            1366 笔记本
          </button>
          <button
            type="button"
            onClick={() => setMobilePreviewSize(null)}
            className={cn(
              "rounded-xl px-2 py-1 text-xs font-semibold transition-colors",
              previewWidth === null ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            )}
            title="恢复桌面全宽"
          >
            全宽
          </button>
          <Link
            href="/preview"
            className="flex items-center gap-1 rounded-xl bg-orange-500 px-2 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
            title="打开全尺寸响应式模拟工作室 (支持 375/390/430手机、1366/1440笔记本、1K/2K屏幕)"
          >
            <Monitor className="h-3 w-3" />
            <span>多端模拟器</span>
          </Link>
        </div>
      ) : null}

      {/* Floating customer service FAB for mobile: 右下角轻量圆形图标，结算/支付/充值/教程页隐藏，滚动时向右侧缩进半隐藏 */}
      {!hideMobileSupportFab ? (
        <MobileSupportFab
          isMobile={isMobile}
          mobilePreview={mobilePreview}
          previewWidth={previewWidth}
          mobileNavigationUntilLg={mobileNavigationUntilLg}
          onSupportOpen={openSupport}
        />
      ) : null}

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent overlayClassName="z-[100] bg-stone-950/45 backdrop-blur-[3px]" onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = supportTrigger.current?.isConnected ? supportTrigger.current : document.querySelector<HTMLElement>("[data-storefront-menu-trigger]");
          trigger?.focus();
        }} className="z-[101] max-h-[85dvh] w-[calc(100%-32px)] max-w-[460px] overflow-y-auto rounded-2xl border-slate-200 bg-white p-5 shadow-2xl sm:rounded-2xl">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 pr-6 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary"><Headphones className="h-5 w-5" /></div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>客服联系方式</DialogTitle>
              <DialogDescription>请选择以下方式联系我们</DialogDescription>
            </div>
          </DialogHeader>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/50 px-3">
            <div className="flex min-w-0 items-center gap-3 py-3">
              <Send className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Telegram</div>
                <a href={supportTelegramUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block max-w-full break-all text-xs text-muted-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{supportTelegramUrl}</a>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 shrink-0"><a href={supportTelegramUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />打开</a></Button>
            </div>
            <div className="flex min-w-0 items-center gap-3 py-3">
              <Mail className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Email</div>
                <p className="mt-1 break-all text-xs text-muted-foreground">{supportEmail}</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={async () => {
                try { await navigator.clipboard.writeText(supportEmail); toast.success("邮箱已复制"); }
                catch { toast.error("复制失败，请手动复制邮箱"); }
              }}><Copy className="mr-1 h-3.5 w-3.5" />复制</Button>
            </div>
            <div className="flex min-w-0 items-start gap-3 py-3">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium">上班时间</div>
                <p className="mt-1 text-xs text-muted-foreground">{supportHours}</p>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">{supportNote}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
