"use client";

/**
 * PublicLayout - Main layout for all public customer pages
 *
 * Layout structure:
 * - Fixed left sidebar (PublicSidebar): 240px wide, hidden on mobile
 * - Mobile menu (MobileMenu): drawer menu, visible only on mobile
 * - Main content area: starts after sidebar (ml-60 on desktop),
 *   full width on mobile, with warm dashboard background
 *
 * The main content area contains:
 * - PublicTopInfoBar (sticky top info bar)
 * - Page content (children)
 *
 * No footer. No shopping cart.
 */

import { ReactNode } from "react";
import PublicSidebar from "./PublicSidebar";
import PublicTopInfoBar from "./PublicTopInfoBar";
import MobileMenu from "./MobileMenu";
import { announcementText } from "@/lib/mock-data";
import { X } from "lucide-react";

interface PublicLayoutProps {
  children: ReactNode;
  contentClassName?: string;
}

export default function PublicLayout({
  children,
  contentClassName = "p-4 md:p-6 max-w-7xl mx-auto mt-12 md:mt-0",
}: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Fixed left sidebar - hidden on mobile */}
      <PublicSidebar />

      {/* Mobile menu trigger - visible only on mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-border px-3 py-2 flex items-center gap-3">
        <MobileMenu />
        <div className="flex items-center gap-2">
          <img
            src="/assets/jianlian-logo.jpg"
            alt="Jianlian"
            className="h-8 w-8 rounded-md object-cover"
          />
          <div>
            <div className="font-semibold text-sm leading-tight">
              Jianlian
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              数字商品服务
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - offset by sidebar width on desktop */}
      <main className="md:ml-[270px] min-w-0 min-h-screen">
        {/* Top info bar with announcement */}
        <PublicTopInfoBar announcementText={announcementText} />

        {/* Page content */}
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
            <div>Telegram：</div>
            <div>WhatsApp：</div>
            <div>Email：</div>
            <div>上班时间：（ 12:00 AM - 24:00 PM GMT+8）</div>
            <div className="text-muted-foreground">有问题均可留言</div>
          </div>
        </div>
      </div>
    </div>
  );
}
