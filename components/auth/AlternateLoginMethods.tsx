"use client";

import { useEffect, useState } from "react";
import { hasSupabaseConfig } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/network/fetch-with-timeout";

type Props = {
  mode: "login" | "register";
  redirectTo: string;
  inviteCode: string;
  acceptedTerms: boolean;
};

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

export default function AlternateLoginMethods({
  mode,
  redirectTo,
  inviteCode,
  acceptedTerms,
}: Props) {
  const isRegister = mode === "register";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onPageShow = () => setBusy(false);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (!googleEnabled) return null;

  async function googleLogin() {
    setError("");
    if (busy) return;
    if (isRegister && !acceptedTerms) {
      setError("请先同意用户协议和隐私政策。");
      return;
    }
    if (!hasSupabaseConfig()) {
      setError("登录服务尚未配置。");
      return;
    }
    setBusy(true);
    try {
      const response = await fetchWithTimeout("/api/auth/google", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, next: redirectTo, invite: isRegister ? inviteCode : "", acceptedTerms }),
      });
      const result = (await response.json().catch(() => null)) as { url?: unknown } | null;
      if (!response.ok || typeof result?.url !== "string") throw new Error("GOOGLE_START_FAILED");
      window.location.assign(result.url);
      // Supabase redirects the browser to Google; completion happens in /auth/callback.
    } catch {
      setError("Google 登录暂时不可用，请使用邮箱登录。");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2" data-testid="alternate-login-methods">
      <button
        type="button"
        onClick={() => void googleLogin()}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
      >
        使用 Google 账号继续
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
