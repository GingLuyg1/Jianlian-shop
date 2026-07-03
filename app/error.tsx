"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[PageError]", { digest: error.digest ?? null });
  }, [error]);

  return (
    <div className="flex min-h-[320px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
        <h2 className="mt-3 text-lg font-semibold text-slate-950">当前模块加载失败</h2>
        <p className="mt-2 text-sm text-slate-500">请重试当前操作。已填写内容会尽可能保留。</p>
        {error.digest ? <p className="mt-2 text-xs text-slate-400">参考编号：{error.digest.slice(0, 12)}</p> : null}
        <button type="button" onClick={reset} className="mt-5 h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">重新加载</button>
      </div>
    </div>
  );
}
