"use client";

import { useState } from "react";
import { hasSupabaseConfig } from "@/lib/supabase/client";

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
      const response = await fetch("/api/auth/google", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, next: redirectTo, invite: isRegister ? inviteCode : "", acceptedTerms }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error("GOOGLE_START_FAILED");
      window.location.assign(result.url);
      // Supabase redirects the browser to Google; completion happens in /auth/callback.
    } catch {
      setError("Google 登录暂时不可用，请使用邮箱登录。");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-3 border-t border-slate-200 pt-5" data-testid="alternate-login-methods">
      <p className="text-center text-xs text-slate-500">其他登录方式</p>
      <button
        type="button"
        onClick={() => void googleLogin()}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        使用 Google 账号继续
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <p className="text-center text-xs text-slate-500">继续即代表同意网站用户协议与隐私政策。</p>
    </div>
  );
}
