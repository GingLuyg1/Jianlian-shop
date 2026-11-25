"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[GlobalError]", { digest: error.digest ?? null });
  }, [error]);

  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>页面加载失败 | Jianlian Shop</title>
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", backgroundColor: "#fffaf6", color: "#0f172a" }}>
        <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-4" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <section className="w-full max-w-md rounded-xl border border-orange-100 bg-white p-8 text-center shadow-sm" style={{ width: "100%", maxWidth: "420px", borderRadius: "12px", border: "1px solid #ffedd5", backgroundColor: "#ffffff", padding: "32px", textAlign: "center" }}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600"><AlertTriangle className="h-7 w-7" /></div>
            <h1 className="mt-5 text-xl font-bold text-slate-950" style={{ marginTop: "20px", fontSize: "20px", fontWeight: 700 }}>页面加载失败</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500" style={{ marginTop: "12px", fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>当前页面暂时无法打开，请稍后重试。系统不会展示内部错误详情。</p>
            {error.digest ? <p className="mt-2 text-xs text-slate-400">参考编号：{error.digest.slice(0, 12)}</p> : null}
            <div className="mt-6 flex justify-center gap-3" style={{ marginTop: "24px", display: "flex", justifyContent: "center", gap: "12px" }}>
              <button type="button" onClick={reset} className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700" style={{ height: "40px", padding: "0 16px", borderRadius: "8px", backgroundColor: "#ea580c", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px" }}>重试</button>
              <a href="/" className="inline-flex h-10 items-center rounded-lg border border-orange-200 px-4 text-sm text-orange-700" style={{ height: "40px", padding: "0 16px", borderRadius: "8px", border: "1px solid #fed7aa", color: "#c2410c", textDecoration: "none", display: "inline-flex", alignItems: "center", fontSize: "14px" }}>返回首页</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
