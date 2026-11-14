"use client";

import { ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Copy, ExternalLink, Headphones, Mail, Monitor, Send, Smartphone } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { SettingsProvider, usePublicSettings } from "@/components/settings/SettingsProvider";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import MobileMenu from "./MobileMenu";
import PublicSidebar from "./PublicSidebar";
import PublicTopInfoBar from "./PublicTopInfoBar";
import RouteLoadingIndicator from "./RouteLoadingIndicator";
import { OPEN_PUBLIC_SUPPORT_EVENT } from "@/lib/support/open-public-support";
import { clearCatalogRoutePending, getCatalogRoutePending, rebaseCatalogRoutePending, startCatalogPopstate } from "@/lib/motion/catalog-route-exit";
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
      <PublicLayoutContent
        contentClassName={resolvedContentClassName}
        viewportLocked={viewportLocked}
        mobileNavigationUntilLg={mobileNavigationUntilLg}
      >
        {children}
      </PublicLayoutContent>
    </SettingsProvider>
  );
}

// This dialog has an explicitly approved storefront contact card. Keep the
// admin-managed support settings intact for their other consumers.
const SUPPORT_TELEGRAM_URL = "https://t.me/Ezeasl";
const SUPPORT_EMAIL = "Yac0000189@gmail.com";
const SUPPORT_HOURS = "12:00 AM - 24:00 PM GMT+8";

function PublicLayoutContent({ children, contentClassName, viewportLocked = false, mobileNavigationUntilLg = false }: PublicLayoutProps) {
  const [supportOpen, setSupportOpen] = useState(false);
  const supportTrigger = useRef<HTMLElement | null>(null);
  const openSupport = useCallback(() => {
    supportTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSupportOpen(true);
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
  useEffect(() => schedulePublicRechargeChannelsPrefetch(), []);
  useEffect(() => { ensureAccountRecordPreload(); }, []);
  useEffect(() => {
    window.addEventListener(OPEN_PUBLIC_SUPPORT_EVENT, openSupport);
    return () => window.removeEventListener(OPEN_PUBLIC_SUPPORT_EVENT, openSupport);
  }, [openSupport]);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const pending = getCatalogRoutePending();
    if (!pending || pending.target === pathname) {
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
  const { isMobile, mobilePreview, showToggle, toggleMobilePreview } = useMobileStorefront();
  const pagePlacement = pathname === "/" ? "home" : pathname.startsWith("/checkout") ? "checkout" : pathname.startsWith("/account") ? "account" : null;
  const pageAnnouncement = pagePlacement ? settings.announcements?.find((item) => item.placement === pagePlacement) : undefined;
  const globalAnnouncement = settings.announcements?.find((item) => item.placement === "global_top");
  const announcement = pageAnnouncement?.content.trim() || globalAnnouncement?.content.trim() || settings.top_announcement.trim();
  const subtitle = settings.site_description || settings.site_subtitle || "数字商品服务";

  return (
    <div data-storefront-ui data-mobile-active={isMobile ? "true" : undefined} className={cn(
      viewportLocked && !isMobile ? "h-dvh overflow-hidden" : "min-h-screen overflow-x-hidden",
      "bg-background [--storefront-content-padding-x:16px] [--storefront-main-offset:0px] [--storefront-sidebar-width:160px] lg:[--storefront-main-offset:268px] lg:[--storefront-sidebar-width:248px]",
      !mobileNavigationUntilLg && !isMobile && "md:[--storefront-main-offset:268px] md:[--storefront-sidebar-width:248px]",
      isMobile && "[--storefront-content-padding-x:12px] lg:[--storefront-main-offset:0px]",
      mobilePreview && "mx-auto w-full max-w-[390px] border-x border-orange-200/80 shadow-[0_0_0_1px_rgba(214,180,148,0.45),0_20px_50px_-12px_rgba(89,56,30,0.28)]",
    )}>
      <Suspense fallback={null}>
        <RouteLoadingIndicator />
      </Suspense>
      <PublicSidebar onSupportOpen={openSupport} mobileNavigationUntilLg={mobileNavigationUntilLg} />

      <div
        data-testid="mobile-top-brand-bar"
        className={cn(
          "fixed top-0 left-0 right-0 z-50 flex items-center gap-3 border-b border-border bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm",
          mobileNavigationUntilLg ? "lg:hidden" : "md:hidden",
          isMobile && "!flex",
          mobilePreview && "mx-auto w-full max-w-[390px] border-x border-orange-200/80",
        )}
      >
        <MobileMenu onSupportOpen={openSupport} mobileNavigationUntilLg={mobileNavigationUntilLg} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img
            src="/assets/jianlian-brand-logo.png"
            alt="Jianlian"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{settings.site_name || "Jianlian"}</div>
            <div className="truncate text-[10px] leading-tight text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        {showToggle ? (
          <button
            type="button"
            data-testid="mobile-preview-header-toggle"
            onClick={toggleMobilePreview}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            title={mobilePreview ? "点击切回全宽窗口" : "点击切换为 390px 手机尺寸预览"}
          >
            {mobilePreview ? <Monitor className="h-3.5 w-3.5 text-primary" /> : <Smartphone className="h-3.5 w-3.5 text-primary" />}
            <span>{mobilePreview ? "全宽" : "手机"}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={openSupport}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-orange-200/80 bg-orange-50/70 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-orange-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Headphones className="h-3.5 w-3.5 shrink-0" />
          <span>客服</span>
        </button>
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
        viewportLocked && !isMobile ? "flex h-[calc(100dvh-57px)] min-w-0 flex-col overflow-hidden md:h-dvh" : "min-h-screen min-w-0",
        mobileNavigationUntilLg ? "lg:ml-[var(--storefront-main-offset)]" : "md:ml-[var(--storefront-main-offset)]",
        isMobile && "!ml-0 !h-auto !overflow-visible pb-16",
      )}>
        <PublicTopInfoBar announcementText={announcement || undefined} mobileNavigationUntilLg={mobileNavigationUntilLg} />
        <div
          className={viewportLocked && !isMobile ? `min-h-0 flex-1 ${contentClassName}` : contentClassName}
          style={{ paddingInline: "var(--storefront-content-padding-x)" }}
        >
          {children}
        </div>
      </main>

      {showToggle ? (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            type="button"
            data-testid="mobile-preview-toggle"
            onClick={toggleMobilePreview}
            className="flex items-center gap-2 rounded-full border border-orange-300/90 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-slate-900/25 transition-transform active:scale-95"
          >
            {mobilePreview ? (
              <>
                <Monitor className="h-4 w-4 text-orange-400" />
                <span>退出手机尺寸 (当前 390px)</span>
              </>
            ) : (
              <>
                <Smartphone className="h-4 w-4 text-orange-400" />
                <span>切换手机尺寸预览 (390px)</span>
              </>
            )}
          </button>
        </div>
      ) : null}

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = supportTrigger.current?.isConnected ? supportTrigger.current : document.querySelector<HTMLElement>("[data-storefront-menu-trigger]");
          trigger?.focus();
        }} className="max-h-[85dvh] w-[calc(100%-32px)] max-w-[460px] overflow-y-auto rounded-2xl border-slate-200 bg-white p-5 shadow-none sm:rounded-2xl">
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
                <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block max-w-full break-all text-xs text-muted-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{SUPPORT_TELEGRAM_URL}</a>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 shrink-0"><a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />打开</a></Button>
            </div>
            <div className="flex min-w-0 items-center gap-3 py-3">
              <Mail className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Email</div>
                <p className="mt-1 break-all text-xs text-muted-foreground">{SUPPORT_EMAIL}</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={async () => {
                try { await navigator.clipboard.writeText(SUPPORT_EMAIL); toast.success("邮箱已复制"); }
                catch { toast.error("复制失败，请手动复制邮箱"); }
              }}><Copy className="mr-1 h-3.5 w-3.5" />复制</Button>
            </div>
            <div className="flex min-w-0 items-start gap-3 py-3">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium">上班时间</div>
                <p className="mt-1 text-xs text-muted-foreground">{SUPPORT_HOURS}</p>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">有问题均可留言，客服会在24小时内处理并留言。</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
