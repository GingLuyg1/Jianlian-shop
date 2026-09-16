"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Mail, MessageCircle, Copy, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { SettingsProvider, usePublicSettings } from "@/components/settings/SettingsProvider";
import MobileMenu from "./MobileMenu";
import PublicSidebar from "./PublicSidebar";
import PublicTopInfoBar from "./PublicTopInfoBar";
import RouteLoadingIndicator from "./RouteLoadingIndicator";
import { OPEN_PUBLIC_SUPPORT_EVENT } from "@/lib/support/open-public-support";
import { cn } from "@/lib/utils";

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
    ?? cn("p-4 md:p-6 max-w-7xl mx-auto mt-12", mobileNavigationUntilLg ? "lg:mt-0" : "md:mt-0");
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

function getSupportHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
  return "";
}

function PublicLayoutContent({ children, contentClassName, viewportLocked = false, mobileNavigationUntilLg = false }: PublicLayoutProps) {
  const [supportOpen, setSupportOpen] = useState(false);
  const supportTrigger = useRef<HTMLElement | null>(null);
  const openSupport = useCallback(() => {
    supportTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSupportOpen(true);
  }, []);
  useEffect(() => {
    window.addEventListener(OPEN_PUBLIC_SUPPORT_EVENT, openSupport);
    return () => window.removeEventListener(OPEN_PUBLIC_SUPPORT_EVENT, openSupport);
  }, [openSupport]);
  const pathname = usePathname();
  const { settings } = usePublicSettings();
  const pagePlacement = pathname === "/" ? "home" : pathname.startsWith("/checkout") ? "checkout" : pathname.startsWith("/account") ? "account" : null;
  const pageAnnouncement = pagePlacement ? settings.announcements?.find((item) => item.placement === pagePlacement) : undefined;
  const globalAnnouncement = settings.announcements?.find((item) => item.placement === "global_top");
  const announcement = pageAnnouncement?.content.trim() || globalAnnouncement?.content.trim() || settings.top_announcement.trim();
  const supportContact = settings.support_contact.trim() || settings.support_email.trim() || "客服暂未开放";
  const subtitle = settings.site_description || settings.site_subtitle || "数字商品服务";

  return (
    <div className={cn(
      viewportLocked ? "h-dvh overflow-hidden" : "min-h-screen overflow-x-hidden",
      "bg-background [--storefront-content-padding-x:16px] [--storefront-main-offset:0px] [--storefront-sidebar-width:160px] lg:[--storefront-main-offset:195px] lg:[--storefront-sidebar-width:195px]",
      !mobileNavigationUntilLg && "md:[--storefront-main-offset:176px] md:[--storefront-sidebar-width:176px]",
    )}>
      <RouteLoadingIndicator />
      <PublicSidebar onSupportOpen={openSupport} mobileNavigationUntilLg={mobileNavigationUntilLg} />

      <div className={cn(
        "fixed left-0 right-0 top-0 z-40 flex items-center gap-3 border-b border-border bg-white px-3 py-2",
        mobileNavigationUntilLg ? "lg:hidden" : "md:hidden",
      )}>
        <MobileMenu onSupportOpen={openSupport} mobileNavigationUntilLg={mobileNavigationUntilLg} />
        <div className="flex items-center gap-2">
          <img
            src="/assets/jianlian-brand-logo.png"
            alt="Jianlian"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md object-cover"
          />
          <div>
            <div className="text-sm font-semibold leading-tight">{settings.site_name || "Jianlian"}</div>
            <div className="text-[10px] leading-tight text-muted-foreground">{subtitle}</div>
          </div>
        </div>
      </div>

      <main className={cn(
        viewportLocked ? "flex h-dvh min-w-0 flex-col overflow-hidden" : "min-h-screen min-w-0",
        mobileNavigationUntilLg ? "lg:ml-[var(--storefront-main-offset)]" : "md:ml-[var(--storefront-main-offset)]",
      )}>
        <PublicTopInfoBar announcementText={announcement || undefined} />
        <div
          className={viewportLocked ? `min-h-0 flex-1 ${contentClassName}` : contentClassName}
          style={{ paddingInline: "var(--storefront-content-padding-x)" }}
        >
          {children}
        </div>
      </main>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = supportTrigger.current?.isConnected ? supportTrigger.current : document.querySelector<HTMLElement>("[data-storefront-menu-trigger]");
          trigger?.focus();
        }} className="max-h-[85dvh] w-[calc(100%-32px)] max-w-[460px] overflow-y-auto rounded-2xl border-slate-200 bg-white p-5 shadow-none sm:rounded-2xl">
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary"><Headphones className="h-5 w-5" /></div>
            <DialogTitle>在线客服</DialogTitle>
            <DialogDescription>请选择联系方式，我们会尽快协助处理。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">{supportContact.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
            const href = getSupportHref(line);
            const email = href.startsWith("mailto:");
            const telegram = /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(href);
            const Icon = email ? Mail : MessageCircle;
            return <div key={`${line}-${index}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><div className="text-sm font-medium">{email ? "邮箱" : telegram ? "Telegram" : "客服信息"}</div><p className="mt-1 break-all text-xs text-muted-foreground">{line}</p></div>
              {href && !email ? <Button asChild size="sm" variant="outline" className="h-8 shrink-0"><a href={href} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />打开</a></Button> : email ? <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={async () => {
                try { await navigator.clipboard.writeText(line.trim()); toast.success("邮箱已复制"); }
                catch { toast.error("复制失败，请手动复制邮箱"); }
              }}><Copy className="mr-1 h-3.5 w-3.5" />复制</Button> : null}
            </div>;
          })}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
