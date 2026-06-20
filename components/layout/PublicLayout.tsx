"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

import {
  SettingsProvider,
  usePublicSettings,
} from "@/components/settings/SettingsProvider";
import MobileMenu from "./MobileMenu";
import PublicSidebar from "./PublicSidebar";
import PublicTopInfoBar from "./PublicTopInfoBar";
import RouteLoadingIndicator from "./RouteLoadingIndicator";

interface PublicLayoutProps {
  children: ReactNode;
  contentClassName?: string;
}

export default function PublicLayout({
  children,
  contentClassName = "p-4 md:p-6 max-w-7xl mx-auto mt-12 md:mt-0",
}: PublicLayoutProps) {
  return (
    <SettingsProvider>
      <PublicLayoutContent contentClassName={contentClassName}>
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

function PublicLayoutContent({
  children,
  contentClassName,
}: PublicLayoutProps) {
  const { settings } = usePublicSettings();
  const announcement = settings.top_announcement.trim();
  const supportContact =
    settings.support_contact.trim() || "客服暂未开放";
  const supportHref = getSupportHref(supportContact);

  return (
    <div className="min-h-screen bg-background">
      <RouteLoadingIndicator />
      <PublicSidebar supportHref={supportHref} />

      <div className="fixed left-0 right-0 top-0 z-40 flex items-center gap-3 border-b border-border bg-white px-3 py-2 md:hidden">
        <MobileMenu supportHref={supportHref} />
        <div className="flex items-center gap-2">
          <img
            src="/assets/jianlian-brand-logo.png"
            alt="Jianlian"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md object-cover"
          />
          <div>
            <div className="text-sm font-semibold leading-tight">Jianlian</div>
            <div className="text-[10px] leading-tight text-muted-foreground">
              数字商品服务
            </div>
          </div>
        </div>
      </div>

      <main className="min-h-screen min-w-0 md:ml-[270px]">
        <PublicTopInfoBar announcementText={announcement || undefined} />
        <div className={contentClassName}>{children}</div>
      </main>

      <div
        id="support-popover"
        className="support-popover w-[min(92vw,420px)] rounded-lg bg-white p-6 shadow-xl"
        {...({ popover: "auto" } as Record<string, string>)}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="关闭在线客服弹窗"
          {...({
            popovertarget: "support-popover",
            popovertargetaction: "hide",
          } as Record<string, string>)}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="text-center">
          <h2 className="text-xl font-semibold">客服信息</h2>
          <div className="mt-5 space-y-3 text-sm text-foreground">
            {supportContact.split(/\r?\n/).map((line, index) => (
              <div
                key={`${line}-${index}`}
                className={index === supportContact.split(/\r?\n/).length - 1 ? "text-muted-foreground" : undefined}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
