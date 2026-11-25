"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AdminErrorBoundary]", error);
  }, [error]);

  const isAuthError =
    /401|未登录|登录状态|unauthorized/i.test(error?.message ?? "");

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          {isAuthError ? "管理员登录状态已失效" : "后台页面渲染发生异常"}
        </h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {isAuthError
            ? "请重新登录后继续操作。您的未提交内容可能需要重新填写。"
            : "当前模块加载或渲染异常，您可以尝试重新加载当前视图或返回控制台。"}
        </p>
        {error?.digest ? (
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            错误追踪码：{error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {isAuthError ? (
            <Button asChild size="sm">
              <Link href="/login?redirect=/admin">重新登录</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={() => reset()}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              重新加载
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">返回控制台</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
