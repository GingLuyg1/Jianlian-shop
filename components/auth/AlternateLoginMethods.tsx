"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateProfile, getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";

type Props = {
  mode: "login" | "register";
  redirectTo: string;
  inviteCode: string;
  acceptedTerms: boolean;
};

// Deliberately OFF until provider, email template, SMTP and redirect settings
// are verified in the target Supabase environment.
const otpEnabled = process.env.NEXT_PUBLIC_EMAIL_OTP_ENABLED === "true";
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6}$/;
const INVITE = /^JL[A-Z0-9]{6,12}$/i;

function callbackUrl(next: string, invite: string) {
  const isLocal = typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const origin = isLocal ? window.location.origin : "https://www.jianlian.shop";
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next || "/account");
  if (INVITE.test(invite)) callback.searchParams.set("invite", invite.toUpperCase());
  return callback.toString();
}

async function validateAccountAccess(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_status,risk_status")
    .eq("id", userId)
    .maybeSingle();
  // Fail closed if a status check cannot be completed: OAuth/OTP must never
  // bypass an account restriction enforced by the existing password login.
  if (error || !data || data.account_status === "disabled" || data.risk_status === "blocked") {
    await supabase.auth.signOut();
    throw new Error("ACCOUNT_RESTRICTED_OR_UNAVAILABLE");
  }
}

export default function AlternateLoginMethods({
  mode,
  redirectTo,
  inviteCode,
  acceptedTerms,
}: Props) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [method, setMethod] = useState<"none" | "otp">("none");
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setTimeout(() => setCooldown(false), 60000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  if (!otpEnabled && !googleEnabled) return null;

  const requireTerms = () => {
    if (!isRegister || acceptedTerms) return true;
    setError("请先同意用户协议和隐私政策。");
    return false;
  };

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (busy || cooldown || !requireTerms()) return;
    if (!hasSupabaseConfig()) {
      setError("登录服务尚未配置。");
      return;
    }
    const normalized = email.trim().toLowerCase();
    if (!EMAIL.test(normalized) || normalized.length > 254) {
      setError("请输入正确的邮箱地址。");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          shouldCreateUser: isRegister,
          emailRedirectTo: callbackUrl(redirectTo, inviteCode),
          ...(isRegister && INVITE.test(inviteCode)
            ? { data: { invite_code: inviteCode.toUpperCase() } }
            : {}),
        },
      });
      if (sendError) throw sendError;
      setSentEmail(normalized);
      setCode("");
      setCooldown(true);
      setMessage("验证码已发送，请检查邮箱及垃圾邮件文件夹。");
    } catch {
      setError("验证码发送失败，请稍后重试或使用密码登录。");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (busy || !requireTerms()) return;
    if (!CODE.test(code) || !sentEmail) {
      setError("请输入邮件中的六位数字验证码。");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: sentEmail,
        token: code,
        type: "email",
      });
      if (verifyError || !data.user || !data.session) {
        setError("验证码错误或已过期，请重新获取。");
        return;
      }
      await getOrCreateProfile(supabase, data.user);
      await validateAccountAccess(supabase, data.user.id);
      if (isRegister && INVITE.test(inviteCode)) {
        // Existing DB RPC enforces self-invite, repeat and ownership restrictions.
        const { error: bindError } = await supabase.rpc("bind_referrer_by_code", {
          input_invite_code: inviteCode.toUpperCase(),
        });
        if (bindError) {
          // Fail closed on referral mismatch rather than silently dropping a
          // customer-facing promotion promise.
          await supabase.auth.signOut();
          setError("邀请码绑定失败，请联系客服核实后再注册。");
          return;
        }
      }
      router.replace(redirectTo === "/" ? "/account" : redirectTo);
      router.refresh();
    } catch {
      setError("账户验证失败或受限，请联系客服。");
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setError("");
    if (busy || !requireTerms()) return;
    if (!hasSupabaseConfig()) {
      setError("登录服务尚未配置。");
      return;
    }
    setBusy(true);
    try {
      const { error: oauthError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl(redirectTo, inviteCode) },
      });
      if (oauthError) throw oauthError;
      // Supabase redirects the browser to Google; completion happens in /auth/callback.
    } catch {
      setError("Google 登录暂时不可用，请使用邮箱登录。");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-3 border-t border-slate-200 pt-5" data-testid="alternate-login-methods">
      <p className="text-center text-xs text-slate-500">其他登录方式</p>
      {googleEnabled && (
        <button
          type="button"
          onClick={() => void googleLogin()}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          使用 Google 账号继续
        </button>
      )}
      {otpEnabled && method === "none" && (
        <button
          type="button"
          onClick={() => { setMethod("otp"); setError(""); setMessage(""); }}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          使用邮箱验证码{isRegister ? "注册" : "登录"}
        </button>
      )}
      {otpEnabled && method === "otp" && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          {!sentEmail ? (
            <form onSubmit={sendCode} className="space-y-3">
              <label htmlFor="alternate-otp-email" className="text-sm font-medium">邮箱地址</label>
              <input
                id="alternate-otp-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
                required
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="请输入邮箱地址"
              />
              <button disabled={busy || cooldown} type="submit" className="h-11 w-full rounded-xl bg-orange-500 font-medium text-white disabled:opacity-60">
                {busy ? "发送中…" : cooldown ? "请稍后再发送" : "发送验证码"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <p className="text-sm text-slate-600">验证码已发送至 {sentEmail}</p>
              <label htmlFor="alternate-otp-code" className="text-sm font-medium">六位邮箱验证码</label>
              <input
                id="alternate-otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                pattern="[0-9]{6}"
                required
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-center text-xl tracking-[0.25em]"
                placeholder="000000"
              />
              <button disabled={busy} type="submit" className="h-11 w-full rounded-xl bg-orange-500 font-medium text-white disabled:opacity-60">
                {busy ? "验证中…" : "验证并继续"}
              </button>
              <button
                type="button"
                onClick={() => { setSentEmail(""); setCode(""); setError(""); setMessage(""); }}
                className="w-full text-center text-xs text-slate-500 underline"
              >
                {cooldown ? "稍后重新发送" : "更换邮箱或重新发送"}
              </button>
            </form>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
      <p className="text-center text-xs text-slate-500">继续即代表同意网站用户协议与隐私政策。</p>
    </div>
  );
}
