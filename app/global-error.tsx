"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError() {
  return (
    <html lang="zh-CN">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-4">
          <section className="w-full max-w-md rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-950">
              页面加载失败
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              当前页面暂时无法打开，请刷新页面或返回首页重试。
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700"
            >
              返回首页
            </Link>
          </section>
        </main>
      </body>
    </html>
  );
}
