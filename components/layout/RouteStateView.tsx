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

export function RouteErrorView({
  error,
  reset,
  title = "页面暂时遇到异常",
  description = "请点击重试刷新当前模块，或返回首页继续浏览。",
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
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-primary">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={reset} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            重新加载
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
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
