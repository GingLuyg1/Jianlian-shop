"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RouteLoadingView({ label = "页面加载中..." }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-primary ring-1 ring-orange-200/70">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function isChunkLoadLikeError(error: unknown): boolean {
  const msg = String((error as { message?: unknown } | null)?.message ?? error ?? "");
  const name = String((error as { name?: unknown } | null)?.name ?? "");
  return (
    name === "ChunkLoadError" ||
    /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)
  );
}

export function RouteErrorView({
  error,
  reset,
  title = "页面暂时遇到波动",
  description = "站点刚完成更新或网络短暂波动，点击刷新即可恢复正常浏览。",
  homeHref = "/",
  homeLabel = "返回首页",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.error("[RouteErrorView]", error?.message || error);
    if (typeof window !== "undefined" && isChunkLoadLikeError(error)) {
      const key = `jianlian_chunk_reload_${window.location.pathname}`;
      const last = Number(window.sessionStorage.getItem(key) ?? "0");
      if (!Number.isFinite(last) || Date.now() - last > 15_000) {
        window.sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#fbf7f1] px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-orange-100/90 bg-white/95 p-8 text-center shadow-[0_20px_60px_-24px_rgba(148,88,43,0.22)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100/80 text-primary ring-1 ring-orange-200/70">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-5 text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && isChunkLoadLikeError(error)) {
                window.location.reload();
                return;
              }
              reset();
            }}
            className="gap-1.5 rounded-xl px-5"
          >
            <RefreshCw className="h-4 w-4" />
            立即刷新
          </Button>
          <Button asChild variant="outline" className="gap-1.5 rounded-xl border-orange-200/80 px-5 hover:bg-orange-50/60">
            <Link href={homeHref}>
              <Home className="h-4 w-4" />
              {homeLabel}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
