"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import TurnstileWidget from "@/components/security/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isEmailFormatValid } from "@/lib/auth/password-policy";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthRecoveryRedirectTo } from "@/lib/auth/site-origin";
import { cn } from "@/lib/utils";

const SUCCESS_MESSAGE = "如果该邮箱已注册，重置邮件将发送至邮箱。";

function getResetRedirectTo() {
  return getAuthRecoveryRedirectTo(
    typeof window === "undefined" ? undefined : window.location.origin
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileVerifying, setTurnstileVerifying] = useState(false);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);

  const cfRequired = turnstileEnabled && Boolean(turnstileSiteKey);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/turnstile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { turnstileEnabled?: boolean; turnstileSiteKey?: string } | null) => {
        if (!active) return;
        if (payload?.turnstileEnabled && payload.turnstileSiteKey) {
          setTurnstileEnabled(true);
          setTurnstileSiteKey(String(payload.turnstileSiteKey));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleTurnstileVerify(token: string) {
    if (!token || turnstileVerifying) return;
    setTurnstileVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/auth/turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setTurnstileVerified(false);
        setTurnstileResetSignal((value) => value + 1);
        setError(payload?.error || "安全验证未通过，请重试。");
        return;
      }
      setTurnstileVerified(true);
    } catch {
      setTurnstileVerified(false);
      setTurnstileResetSignal((value) => value + 1);
      setError("安全验证网络异常，请重试。");
    } finally {
      setTurnstileVerifying(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || cooldown > 0) return;

    setError("");
    if (cfRequired && !turnstileVerified) {
      setError("请先完成安全验证后再发送重置邮件。");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailFormatValid(normalizedEmail)) {
      setError("请输入正确的邮箱地址。");
      return;
    }

    setSubmitting(true);
    try {
      const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getResetRedirectTo(),
      });
      if (resetError) throw resetError;
      setSent(true);
      setCooldown(60);
    } catch {
      setSent(true);
      setCooldown(60);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff4e7] px-4 py-8">
      <div className="mx-auto max-w-md">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/login">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回登录
          </Link>
        </Button>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>忘记密码</CardTitle>
            <p className="text-sm text-muted-foreground">
              输入注册邮箱，我们将发送密码重置邮件。为保护账号安全，页面不会透露邮箱是否存在。
            </p>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div
                role="status"
                aria-live="polite"
                className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
              >
                <p>{SUCCESS_MESSAGE}</p>
                {cooldown > 0 ? (
                  <p>{cooldown} 秒后可重新发送。</p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSent(false);
                      if (cfRequired) {
                        setTurnstileVerified(false);
                        setTurnstileResetSignal((value) => value + 1);
                      }
                    }}
                  >
                    重新发送重置邮件
                  </Button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error ? (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="email">邮箱</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="pl-9"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                {cfRequired ? (
                  <div className="relative min-h-[72px]">
                    <div
                      aria-hidden={turnstileVerified}
                      className={cn(
                        "transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        turnstileVerified
                          ? "pointer-events-none absolute inset-0 -translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                          : "relative translate-y-0 scale-100 opacity-100"
                      )}
                    >
                      <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 px-3 py-2">
                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-600">
                          <span>安全验证</span>
                          <span className="text-slate-400">
                            {turnstileVerifying ? "正在核验..." : "验证通过后解锁发送"}
                          </span>
                        </div>
                        <TurnstileWidget
                          siteKey={turnstileSiteKey}
                          resetSignal={turnstileResetSignal}
                          onVerify={(token) => void handleTurnstileVerify(token)}
                          onExpire={() => setTurnstileVerified(false)}
                        />
                      </div>
                    </div>
                    <div
                      aria-hidden={!turnstileVerified}
                      className={cn(
                        "flex h-[72px] items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 text-xs text-emerald-700 transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        turnstileVerified
                          ? "relative translate-y-0 scale-100 opacity-100"
                          : "pointer-events-none absolute inset-0 translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                      )}
                    >
                      <span className="font-semibold">✓ 安全验证已通过，可发送重置邮件</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTurnstileVerified(false);
                          setTurnstileResetSignal((value) => value + 1);
                        }}
                        className="text-emerald-700 underline hover:text-emerald-900"
                      >
                        重验
                      </button>
                    </div>
                  </div>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || cooldown > 0 || (cfRequired && !turnstileVerified)}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {submitting ? "发送中..." : "发送重置邮件"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
