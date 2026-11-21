"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSafeInternalRedirect } from "@/lib/auth/redirect";
import { getAuthSiteOrigin } from "@/lib/auth/site-origin";
import { PENDING_SIGNUP_KEY, encodePendingSignup, decodePendingSignup, type PendingSignup } from "@/lib/auth/pending-signup";
import { getSafeAuthErrorMessage, getSafeNetworkAuthMessage, isEmailFormatValid, validateAuthPassword } from "@/lib/auth/password-policy";
import { cn } from "@/lib/utils";
import AlternateLoginMethods from "@/components/auth/AlternateLoginMethods";
import AnimatedCharacters from "@/components/auth/AnimatedCharacters";
import EmailVerificationForm from "@/components/auth/EmailVerificationForm";
import {
  getOrCreateProfile,
  getSupabaseBrowserClient,
  getSupabaseConfigStatus,
  hasSupabaseConfig,
} from "@/lib/supabase/client";

type AuthMode = "login" | "register";

type AuthScreenProps = {
  mode: AuthMode;
};

const features = ["安全加密", "极速交付", "正品保障"];


function getAuthRedirectUrl(path: string) {
  const origin = getAuthSiteOrigin(typeof window === "undefined" ? undefined : window.location.origin);
  return `${origin}${path}`;
}

async function getLoginRestrictionMessage(supabase: ReturnType<typeof getSupabaseBrowserClient>, userId: string, strict = true) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("account_status,risk_status")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return strict ? "暂时无法确认账户状态，请稍后登录。" : "";
    if (data?.account_status === "disabled") return "账户已被禁用，请联系客服。";
    if (data?.risk_status === "blocked") return "账户当前受限，请联系客服。";
    return "";
  } catch {
    return strict ? "暂时无法确认账户状态，请稍后登录。" : "";
  }
}
export default function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegister = mode === "register";
  const redirectTo = useMemo(
    () => getSafeInternalRedirect(searchParams?.get("redirect") ?? null),
    [searchParams]
  );
  const inviteFromUrl = useMemo(
    () => searchParams?.get("invite") || searchParams?.get("salt") || "",
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [registration, setRegistration] = useState<PendingSignup | null>(null);

  const loginFailed = Boolean(error);

  useEffect(() => {
    if (!isRegister) return;
    try {
      const pending = decodePendingSignup(window.sessionStorage.getItem(PENDING_SIGNUP_KEY));
      if (pending) setRegistration(pending);
      else window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch { /* Verification remains usable when browser storage is unavailable. */ }
  }, [isRegister]);

  function forgetPendingSignup() {
    try { window.sessionStorage.removeItem(PENDING_SIGNUP_KEY); } catch { /* No credentials are stored. */ }
  }

  async function verifyRegistration(code: string) {
    if (loading || !registration) return;
    setError("");
    setMessage("");
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: registration.email,
        token: code,
        type: "signup",
      });
      if (verifyError) {
        setError(getSafeAuthErrorMessage(verifyError, "验证码无效或已过期，请重新获取。"));
        return;
      }
      if (!data.session || data.user?.id !== registration.userId || !data.user.email_confirmed_at) {
        if (data.session) await supabase.auth.signOut({ scope: "local" });
        setError("无法确认此注册，请重新开始。");
        return;
      }
      await getOrCreateProfile(supabase, data.user);
      const restriction = await getLoginRestrictionMessage(supabase, data.user.id, true);
      if (restriction) {
        await supabase.auth.signOut({ scope: "local" });
        setError(restriction);
        return;
      }
      if (registration.invite) {
        const { error: bindError } = await supabase.rpc("bind_referrer_by_code", {
          input_invite_code: registration.invite,
        });
        if (bindError) {
          await supabase.auth.signOut({ scope: "local" });
          setError("注册邮箱已验证，邀请码绑定失败，请联系客服。");
          return;
        }
      }
      setLoginSuccess(true);
      toast.success("邮箱已验证，注册完成。");
      forgetPendingSignup();
      router.replace("/account");
      router.refresh();
    } catch {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setError("注册验证暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function resendRegistrationCode() {
    if (loading || !registration) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: registration.email,
      });
      if (resendError) {
        setError(getSafeAuthErrorMessage(resendError, "暂时无法重发验证码，请稍后重试。"));
        return;
      }
      setMessage("验证码已重新发送，请使用最新一封邮件。");
    } catch {
      setError("暂时无法重发验证码，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const reason = searchParams?.get("auth_error");
    if (reason === "restricted") setError("账户已被禁用或暂时受限，请联系客服。");
    else if (reason === "invite") setError("邀请关系绑定失败，请联系客服核实。");
    else if (reason === "invalid_link") setError("登录链接已过期或无效，请重新登录。");
    else if (reason === "config") setError("登录服务暂时不可用。");
  }, [searchParams]);

  useEffect(() => {
    const inviteCode = inviteFromUrl.trim();
    if (!inviteCode || !hasSupabaseConfig()) return;

    async function recordPromotionVisit() {
      const visitorKey =
        window.localStorage.getItem("jianlian_visitor_key") ||
        window.crypto.randomUUID();
      window.localStorage.setItem("jianlian_visitor_key", visitorKey);

      try {
        const { error } = await getSupabaseBrowserClient().rpc(
          "record_promotion_visit",
          {
            input_invite_code: inviteCode,
            input_visitor_key: visitorKey,
          }
        );

        if (error) {
          console.warn("[Promotion] Failed to record visit");
        }
      } catch (visitError) {
        console.warn("[Promotion] Failed to record visit");
      }
    }

    recordPromotionVisit();
  }, [inviteFromUrl]);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let active = true;

    getSupabaseBrowserClient()
      .auth.getUser()
      .then(async ({ data }) => {
        if (!active || !data.user) return;
        const restriction = await getLoginRestrictionMessage(getSupabaseBrowserClient(), data.user.id);
        if (!active) return;
        if (restriction) {
          await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
          setError(restriction);
          return;
        }
        forgetPendingSignup();
        router.replace(redirectTo === "/" ? "/account" : redirectTo);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [redirectTo, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const config = getSupabaseConfigStatus();
    if (!config.ok) {
      const configMessage =
        config.message ?? "Supabase URL 或 Key 未配置，请检查环境变量。";
      console.warn("[Supabase Auth] Missing public config");
      setError(configMessage);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailFormatValid(normalizedEmail)) {
      setError("请输入正确的邮箱地址。");
      return;
    }

    const passwordError = validateAuthPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (isRegister) {
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致。");
        return;
      }

      if (!acceptedTerms) {
        setError("请先阅读并同意用户协议。");
        return;
      }
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      if (isRegister) {
        const normalizedInviteCode = inviteCode.trim().toUpperCase();
        const normalizedDisplayName = displayName.trim();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(
              `/auth/callback?next=${encodeURIComponent("/account")}`
            ),
            data: {
              ...(normalizedInviteCode ? { invite_code: normalizedInviteCode } : {}),
              ...(normalizedDisplayName
                ? { display_name: normalizedDisplayName }
                : {}),
            },
          },
        });

        if (signUpError) {
          setError(
            getSafeAuthErrorMessage(signUpError, "注册服务暂时不可用，请稍后重试。")
          );
          return;
        }

        if (data.session) {
          await supabase.auth.signOut({ scope: "local" });
          setError("注册服务尚未启用邮箱确认，请稍后重试。");
          return;
        }
        if (!data.user) {
          setError("无法开始邮箱验证，请稍后重试。");
          return;
        }
        const pending = { email: normalizedEmail, userId: data.user.id, invite: normalizedInviteCode };
        try { window.sessionStorage.setItem(PENDING_SIGNUP_KEY, encodePendingSignup(pending)); } catch { /* No password/token persistence. */ }
        setRegistration(pending);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (signInError) {
        setError(
          getSafeAuthErrorMessage(signInError, "邮箱或密码不正确。")
        );
        setPassword("");
        return;
      }

      if (!signInData?.session || !signInData.user?.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" });
        setError("邮箱尚未验证，请先完成注册验证。");
        return;
      }
      if (signInData.user) {
        await getOrCreateProfile(supabase, signInData.user).catch(() =>
          console.warn("[Supabase Auth] Failed to prepare profile")
        );

        const loginRestriction = await getLoginRestrictionMessage(
          supabase,
          signInData.user.id
        );
        if (loginRestriction) {
          await supabase.auth.signOut({ scope: "local" });
          setMessage("");
          setError(loginRestriction);
          return;
        }
      }

      setLoginSuccess(true);
      toast.success("登录成功，正在进入账户中心。");
      router.push(redirectTo);
      router.refresh();
    } catch (authException) {
      console.warn("[Supabase Auth] Network or runtime exception");
      setError(getSafeNetworkAuthMessage(authException));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#fff8f0] via-[#fff1e2] to-[#feebd7] text-foreground selection:bg-orange-200">
      {/* High-end ambient background light orbs */}
      <div className="pointer-events-none fixed -left-28 -top-28 h-[460px] w-[460px] rounded-full bg-gradient-to-br from-[#ffd5a4] via-[#ffbe80] to-[#ffa45b] opacity-35 blur-[100px]" />
      <div className="pointer-events-none fixed -right-32 top-4 h-[520px] w-[520px] rounded-full bg-gradient-to-bl from-[#ffe5c7] via-[#ffd7a8] to-[#fec896] opacity-45 blur-[110px]" />
      <div className="pointer-events-none fixed bottom-[-110px] left-1/4 h-[440px] w-[440px] rounded-full bg-gradient-to-tr from-[#ede9fe] via-[#fed7aa] to-[#fecba1] opacity-35 blur-[110px]" />
      <div className="pointer-events-none fixed bottom-[-90px] -right-24 h-[380px] w-[380px] rounded-full bg-gradient-to-tl from-[#fed7aa] to-[#fdb978] opacity-40 blur-[95px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-orange-200/60 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] hover:border-orange-300 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-8 py-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_440px]">
          {/* Left Hero Card - Hidden on Mobile, Pure Desktop Showcase */}
          <section className="hidden lg:block">
            <div className="relative flex min-h-[600px] max-w-xl flex-col justify-between overflow-hidden rounded-[36px] border border-white/90 bg-gradient-to-b from-white/85 via-white/70 to-[#fff2e2]/80 p-8 pb-0 shadow-[0_32px_100px_-20px_rgba(202,122,44,0.18),0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur-xl">
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-[#ffb67a]/40 to-[#ff9f50]/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-14 -left-14 h-48 w-48 rounded-full bg-gradient-to-tr from-[#fed7aa]/50 to-[#fdba74]/25 blur-3xl" />
              
              <div className="relative z-10">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2.5 rounded-full border border-orange-200/70 bg-white/95 px-3.5 py-1.5 text-sm font-bold text-slate-800 shadow-xs backdrop-blur-sm">
                    <img
                      src="/assets/jianlian-brand-logo.png"
                      alt="Jianlian"
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-xl object-cover shadow-xs ring-1 ring-orange-200/60"
                    />
                    <span>Jianlian.shop</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {features.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full border border-orange-100/90 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-sm"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100/70 px-3 py-1 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>数字商品与服务平台</span>
                  </div>
                  <h1 className="text-[38px] font-black leading-[1.15] tracking-tight text-[#171923]">
                    开启你的数字体验
                  </h1>
                  <p className="text-sm font-medium text-slate-600">
                    安全、快速、放心的优质账号与数字化方案
                  </p>
                </div>
              </div>

              <div className="relative z-10 mt-auto pt-2">
                <AnimatedCharacters
                  email={email}
                  mode={mode}
                  isTyping={isTyping || Boolean(registration)}
                  showPassword={showPassword}
                  passwordLength={password.length}
                  loginFailed={loginFailed}
                  loginSuccess={loginSuccess}
                />
              </div>
            </div>
          </section>

          {/* Right Form Card - On Mobile, Shows ONLY this pristine clean card */}
          <section className="w-full">
            <div className="mx-auto max-w-[440px] rounded-[32px] border border-white/85 bg-white/80 p-2 shadow-[0_32px_90px_-15px_rgba(15,23,42,0.14)] ring-1 ring-white/90 backdrop-blur-xl">
              <div className="rounded-[26px] border border-orange-100/70 bg-white/90 p-6 sm:p-7 shadow-xs">
                <div className="mb-6 flex items-center gap-3">
                  <img
                    src="/assets/jianlian-brand-logo.png"
                    alt="Jianlian"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-2xl object-cover shadow-xs ring-1 ring-orange-200/50"
                  />
                  <div>
                    <div className="text-xl font-black leading-tight tracking-tight text-slate-900">
                      Jianlian
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">
                      数字商品服务
                    </div>
                  </div>
                </div>

                <div className="relative mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                  <div
                    className={cn(
                      "pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out",
                      isRegister ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
                    )}
                  />
                  <AuthTab href="/login" active={!isRegister}>
                    登录
                  </AuthTab>
                  <AuthTab href="/register" active={isRegister}>
                    注册
                  </AuthTab>
                </div>

                <div className="mb-5">
                  <h2
                    key={mode}
                    className="text-2xl font-black transition-all duration-300"
                  >
                    {isRegister ? "创建新账号" : "欢迎回来"}
                  </h2>
                </div>

                {registration ? (
                  <>
                    <EmailVerificationForm
                      email={registration.email}
                      busy={loading}
                      onVerify={verifyRegistration}
                      onResend={resendRegistrationCode}
                      onBack={() => { forgetPendingSignup(); setRegistration(null); setError(""); setMessage(""); }}
                    />
                    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
                  </>
                ) : <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        onFocus={() => setIsTyping(true)}
                        onBlur={() => setIsTyping(false)}
                        placeholder="请输入邮箱"
                        className="h-12 rounded-xl bg-slate-50 pl-10"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">密码</Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="请输入密码"
                        className="h-12 rounded-xl bg-slate-50 pl-10 pr-11"
                        autoComplete={isRegister ? "new-password" : "current-password"}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {!isRegister ? (
                      <div className="flex justify-end pt-0.5">
                        <Link
                          href="/forgot-password"
                          className="text-xs font-medium text-slate-500 transition-colors hover:text-primary"
                        >
                          忘记密码
                        </Link>
                      </div>
                    ) : null}
                  </div>

                  {isRegister ? (
                    <div className="space-y-4 transition-all duration-300">
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">确认密码</Label>
                        <div className="relative">
                          <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="confirmPassword"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) =>
                              setConfirmPassword(event.target.value)
                            }
                            onFocus={() => setIsTyping(true)}
                            onBlur={() => setIsTyping(false)}
                            placeholder="请再次输入密码"
                            className="h-12 rounded-xl bg-slate-50 pl-10"
                            autoComplete="new-password"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteCode">邀请码（选填）</Label>
                        <div className="relative">
                          <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="inviteCode"
                            value={inviteCode}
                            onChange={(event) =>
                              setInviteCode(event.target.value)
                            }
                            onFocus={() => setIsTyping(true)}
                            onBlur={() => setIsTyping(false)}
                            placeholder="请输入邀请码"
                            className="h-12 rounded-xl bg-slate-50 pl-10"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {error ? (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                    >
                      {error}
                    </div>
                  ) : null}

                  {message ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                    >
                      {message}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl"
                    disabled={loading}
                  >
                    {loading ? "处理中..." : isRegister ? "注册" : "登录"}
                  </Button>
                </form>

                <AlternateLoginMethods
                  mode={mode}
                  redirectTo={redirectTo === "/" ? "/account" : redirectTo}
                  inviteCode={inviteCode}
                  acceptedTerms={acceptedTerms}
                />

                <div className="mt-3 flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5 transition-all duration-300">
                  <Checkbox
                    id="acceptedTerms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) =>
                      setAcceptedTerms(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="acceptedTerms"
                    className="cursor-pointer text-xs font-normal leading-5 text-slate-700"
                  >
                    我已阅读并同意
                    <Link
                      href="/terms"
                      className="mx-1 font-semibold text-primary hover:text-primary/80"
                    >
                      用户协议
                    </Link>
                    和
                    <Link
                      href="/privacy"
                      className="mx-1 font-semibold text-primary hover:text-primary/80"
                    >
                      隐私政策
                    </Link>
                  </Label>
                </div>
                </>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function AuthTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative z-10 flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-300",
        active
          ? "text-primary"
          : "text-slate-500 hover:text-primary"
      )}
    >
      {children}
    </Link>
  );
}

