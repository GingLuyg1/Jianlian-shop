import Link from "next/link";
import { Wrench } from "lucide-react";

import { DEFAULT_PUBLIC_SETTINGS } from "@/lib/settings/types";
import { readPublicSettings } from "@/lib/settings/server";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadSettings() {
  if (!hasSupabaseServerConfig()) return DEFAULT_PUBLIC_SETTINGS;
  const result = await readPublicSettings(getSupabaseServerClient());
  return result.settings;
}

export default async function MaintenancePage() {
  const settings = await loadSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fcf8f3] px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm shadow-orange-100/70">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <Wrench className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-950">网站维护中</h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
          {settings.maintenance_message || "网站正在维护升级，请稍后再访问。"}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">
            返回首页
          </Link>
          <Link href="/login" className="rounded-xl border px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            管理员登录
          </Link>
        </div>
      </section>
    </main>
  );
}