"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[GlobalError]", { digest: error.digest ?? null });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-4">
          <section className="w-full max-w-md rounded-xl border border-orange-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600"><AlertTriangle className="h-7 w-7" /></div>
            <h1 className="mt-5 text-xl font-bold text-slate-950">页面加载失败</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">当前页面暂时无法打开，请稍后重试。系统不会展示内部错误详情。</p>
            {error.digest ? <p className="mt-2 text-xs text-slate-400">参考编号：{error.digest.slice(0, 12)}</p> : null}
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={reset} className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">重试</button>
              <a href="/" className="inline-flex h-10 items-center rounded-lg border border-orange-200 px-4 text-sm text-orange-700">返回首页</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
