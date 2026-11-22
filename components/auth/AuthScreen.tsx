"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
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
import {
  PENDING_SIGNUP_KEY,
  encodePendingSignup,
  decodePendingSignup,
  type PendingSignup,
} from "@/lib/auth/pending-signup";
import {
  getSafeAuthErrorMessage,
  getSafeNetworkAuthMessage,
  isEmailFormatValid,
  validateAuthPassword,
} from "@/lib/auth/password-policy";
import { cn } from "@/lib/utils";
import AlternateLoginMethods from "@/components/auth/AlternateLoginMethods";
import EmailVerificationForm from "@/components/auth/EmailVerificationForm";
import AnimatedCharacters from "@/components/auth/AnimatedCharacters";
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

const features = ["安全账号", "快速下单", "订单查询"];

function getAuthRedirectUrl(path: string) {
  const origin = getAuthSiteOrigin(
    typeof window === "undefined" ? undefined : window.location.origin
  );
  return `${origin}${path}`;
}

async function getLoginRestrictionMessage(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  userId: string,
  strict = true
) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("account_status,risk_status")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data)
      return strict ? "暂时无法确认账户状态，请稍后登录。" : "";
    if (data?.account_status === "disabled")
      return "账户已被禁用，请联系客服。";
    if (data?.risk_status === "blocked")
      return "账户当前受限，请联系客服。";
    return "";
  } catch {
    return strict ? "暂时无法确认账户状态，请稍后登录。" : "";
  }
}

export default function AuthScreen({ mode: initialMode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 内部受控的当前登录/注册模式，平滑切换不刷新
  const [currentMode, setCurrentMode] = useState<AuthMode>(initialMode);
  const isRegister = currentMode === "register";

  const redirectTo = useMemo(
    () => getSafeInternalRedirect(searchParams?.get("redirect") ?? null),
    [searchParams]
  );
  const inviteFromUrl = useMemo(
    () => searchParams?.get("invite") || searchParams?.get("salt") || "",
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [registration, setRegistration] = useState<PendingSignup | null>(null);

  // 卡通角色动效状态
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const [rippleOrigin, setRippleOrigin] = useState<{ x: number; y: number } | null>(null);

  const triggerSuccessWithButtonRipple = () => {
    if (submitBtnRef.current) {
      const rect = submitBtnRef.current.getBoundingClientRect();
      setRippleOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    } else if (typeof window !== "undefined") {
      setRippleOrigin({
        x: window.innerWidth * 0.72,
        y: window.innerHeight * 0.58,
      });
    }
    setLoginSuccess(true);
  };

  // 当外部传入的 initialMode 变更时同步
  useEffect(() => {
    setCurrentMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!isRegister) return;
    try {
      const pending = decodePendingSignup(window.sessionStorage.getItem(PENDING_SIGNUP_KEY));
      if (pending) setRegistration(pending);
      else window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch {
      /* Verification remains usable when browser storage is unavailable. */
    }
  }, [isRegister]);

  function forgetPendingSignup() {
    try {
      window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch {
      /* No credentials are stored. */
    }
  }

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const handleSendRegisterOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailFormatValid(normalizedEmail)) {
      setError("请输入正确的邮箱地址后再获取验证码。");
      return;
    }
    const config = getSupabaseConfigStatus();
    if (!config.ok) {
      setError("登录服务暂时不可用，请稍后重试。");
      return;
    }
    setError("");
    setMessage("");
    setOtpSending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
      });
      setOtpCountdown(60);
      if (resendError) {
        // 若尚未提交过 signUp，resend 可能会提示用户不存在，此时提示直接点击下方注册获取首次验证码
        toast.info("验证码请求已提交，若首次注册请填写完整后点击下方注册按钮。");
      } else {
        toast.success("验证码已发送至您的邮箱，请查收（如未收到请检查垃圾箱）。");
      }
    } catch {
      setOtpCountdown(60);
      toast.info("验证码请求已提交，请查看您的邮箱。");
    } finally {
      setOtpSending(false);
    }
  };

  // 模式切换平滑更新 URL，不刷新页面
  const switchMode = (nextMode: AuthMode) => {
    if (currentMode === nextMode) return;
    setCurrentMode(nextMode);
    setError("");
    setMessage("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.pathname = nextMode === "register" ? "/register" : "/login";
      window.history.replaceState(null, "", url.toString());
    }
  };

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
        setError(
          getSafeAuthErrorMessage(
            verifyError,
            "验证码无效或已过期，请重新获取。"
          )
        );
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
        const { error: bindError } = await supabase.rpc(
          "bind_referrer_by_code",
          {
            input_invite_code: registration.invite,
          }
        );
        if (bindError) {
          await supabase.auth.signOut({ scope: "local" });
          setError("注册邮箱已验证，邀请码绑定失败，请联系客服。");
          return;
        }
      }
      toast.success("邮箱已验证，注册完成。");
      triggerSuccessWithButtonRipple();
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
        setError(
          getSafeAuthErrorMessage(
            resendError,
            "暂时无法重发验证码，请稍后重试。"
          )
        );
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
    if (reason === "restricted")
      setError("账户已被禁用或暂时受限，请联系客服。");
    else if (reason === "invite")
      setError("邀请关系绑定失败，请联系客服核实。");
    else if (reason === "invalid_link")
      setError("登录链接已过期或无效，请重新登录。");
    else if (reason === "config") setError("登录服务暂时不可用。");
  }, [searchParams]);

  useEffect(() => {
    const invite = inviteFromUrl.trim();
    if (!invite || !hasSupabaseConfig()) return;

    async function recordPromotionVisit() {
      const visitorKey =
        window.localStorage.getItem("jianlian_visitor_key") ||
        window.crypto.randomUUID();
      window.localStorage.setItem("jianlian_visitor_key", visitorKey);

      try {
        const { error } = await getSupabaseBrowserClient().rpc(
          "record_promotion_visit",
          {
            input_invite_code: invite,
            input_visitor_key: visitorKey,
          }
        );

        if (error) {
          console.warn("[Promotion] Failed to record visit");
        }
      } catch {
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
        const restriction = await getLoginRestrictionMessage(
          getSupabaseBrowserClient(),
          data.user.id
        );
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(
              `/auth/callback?next=${encodeURIComponent("/account")}`
            ),
            data: {
              ...(normalizedInviteCode
                ? { invite_code: normalizedInviteCode }
                : {}),
            },
          },
        });

        if (signUpError) {
          setError(
            getSafeAuthErrorMessage(
              signUpError,
              "注册服务暂时不可用，请稍后重试。"
            )
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
        const pending = {
          email: normalizedEmail,
          userId: data.user.id,
          invite: normalizedInviteCode,
        };
        try {
          window.sessionStorage.setItem(
            PENDING_SIGNUP_KEY,
            encodePendingSignup(pending)
          );
        } catch {
          /* No password/token persistence. */
        }
        setRegistration(pending);
        setPassword("");

        // 若用户已在表单中填入邮箱验证码，则直接尝试校验完成注册
        if (emailOtp.trim()) {
          void verifyRegistration(emailOtp.trim());
          return;
        }
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

      triggerSuccessWithButtonRipple();
      toast.success("登录成功，正在进入账户中心。");
      setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 850);
    } catch (authException) {
      console.warn("[Supabase Auth] Network or runtime exception");
      setError(getSafeNetworkAuthMessage(authException));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fff6ee] text-foreground">
      {/* 优化后的高级暖色微光背景 */}
      <div className="pointer-events-none fixed -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-[#ffd9b3] via-[#ffc68a] to-[#ffb366] opacity-60 blur-3xl" />
      <div className="pointer-events-none fixed -right-24 top-1/4 h-[520px] w-[520px] rounded-full bg-gradient-to-tr from-[#ffe6cc] via-[#ffd2a8] to-[#ffb885] opacity-55 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full bg-gradient-to-t from-[#ffcf9e] to-[#ffe8d1] opacity-45 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <div className="flex items-center justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-orange-200/60 backdrop-blur transition-all hover:scale-[1.02] hover:bg-white hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_430px]">
          {/* 左侧卡通角色舞台卡片（全面升级为符合 Jianlian 品牌高奢质感的轻奢云母流光展舱） */}
          <section className="hidden lg:block">
            <div className="relative max-w-xl overflow-hidden rounded-[36px] border border-white/95 bg-gradient-to-br from-white/95 via-[#fffdfa]/90 to-[#fff5ec]/85 p-8 shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),0_24px_70px_-10px_rgba(235,115,30,0.15),0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-2xl ring-1 ring-orange-200/50">
              {/* 高定科技微点阵纹理，完美契合数字商品服务平台风格 */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.45]"
                style={{
                  backgroundImage:
                    "radial-gradient(rgba(235, 115, 30, 0.14) 1px, transparent 1px)",
                  backgroundSize: "22px 22px",
                }}
              />

              {/* 晨曦流光氛围与柔和展舱光晕 */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-[#ffdca8]/50 via-[#ffba75]/35 to-transparent blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-gradient-to-tr from-[#ffe6cc]/60 via-[#ffd5ab]/40 to-transparent blur-3xl" />
              <div className="pointer-events-none absolute inset-x-12 bottom-3 h-16 rounded-[40px] bg-gradient-to-r from-orange-200/15 via-amber-300/30 to-orange-200/15 blur-xl" />

              <div className="relative">
                {/* 重构后的极简高奢品牌微排版与背书 */}
                <div className="relative z-10 mb-6 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white/95 px-3.5 py-1 text-xs font-bold text-slate-800 shadow-xs backdrop-blur-md">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                      </span>
                      <span>Jianlian Hub · 全球数字商品与网络服务</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                      开启你的数字体验
                    </h1>
                    <p className="text-sm font-medium text-slate-600 leading-relaxed">
                      安全、极速、放心的全球海外原生账户与数字化服务方案
                    </p>
                  </div>
                </div>

                {/* 卡通角色核心组件 */}
                <div className="mt-4">
                  <AnimatedCharacters
                    email={email}
                    mode={currentMode}
                    isTyping={isTyping}
                    showPassword={showPassword}
                    passwordLength={password.length}
                    loginFailed={Boolean(error)}
                    loginSuccess={loginSuccess}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 右侧表单卡片 */}
          <section className="w-full">
            <div className="mx-auto max-w-[430px] rounded-[32px] border border-white/90 bg-white/80 p-2 shadow-[0_28px_90px_rgba(15,23,42,0.14)] ring-1 ring-orange-100/60 backdrop-blur-xl">
              <div className="rounded-[26px] border border-orange-50 bg-white/90 p-6 sm:p-7">
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
                    <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                      数字商品服务
                    </div>
                  </div>
                </div>

                {/* 增加平滑弹簧滑块指示动画的登录/注册 Tab */}
                <div className="relative mb-6 flex rounded-2xl bg-slate-100/90 p-1">
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out",
                      isRegister
                        ? "translate-x-[calc(100%+8px)]"
                        : "translate-x-0"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className={cn(
                      "relative z-10 flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-200",
                      !isRegister
                        ? "text-primary"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className={cn(
                      "relative z-10 flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-200",
                      isRegister
                        ? "text-primary"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    注册
                  </button>
                </div>

                <div className="mb-5 transition-all duration-200">
                  <h2 className="text-2xl font-black text-slate-900">
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
                      onBack={() => {
                        forgetPendingSignup();
                        setRegistration(null);
                        setError("");
                        setMessage("");
                      }}
                    />
                    {error && (
                      <p
                        role="alert"
                        className="mt-3 text-sm text-red-600"
                      >
                        {error}
                      </p>
                    )}
                    {message && (
                      <p
                        role="status"
                        className="mt-3 text-sm text-emerald-700"
                      >
                        {message}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <form
                      onSubmit={handleSubmit}
                      className="space-y-4 transition-opacity duration-200"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="email">邮箱</Label>
                        <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                          <Mail className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                          <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => {
                              setEmail(event.target.value);
                              setIsTyping(true);
                            }}
                            onFocus={() => {
                              setIsEmailFocused(true);
                              setIsTyping(true);
                            }}
                            onBlur={() => {
                              setIsEmailFocused(false);
                              setIsTyping(false);
                            }}
                            placeholder="请输入邮箱"
                            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                            autoComplete="email"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="password">密码</Label>
                        <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                          <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => {
                              setPassword(event.target.value);
                              setIsTyping(true);
                            }}
                            onFocus={() => {
                              setIsPasswordFocused(true);
                              setIsTyping(true);
                            }}
                            onBlur={() => {
                              setIsPasswordFocused(false);
                              setIsTyping(false);
                            }}
                            placeholder="请输入密码"
                            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                            autoComplete={
                              isRegister ? "new-password" : "current-password"
                            }
                            required
                          />
                          <button
                            type="button"
                            className="shrink-0 ml-2.5 p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none cursor-pointer"
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
                        {/* 忘记密码移至密码右下角 */}
                        {!isRegister ? (
                          <div className="flex justify-end pt-0.5">
                            <Link
                              href="/forgot-password"
                              className="text-xs font-medium text-slate-500 transition-colors hover:text-primary"
                            >
                              忘记密码？
                            </Link>
                          </div>
                        ) : null}
                      </div>

                      {/* 注册多出的表单项：密码仅输入一次，原确认密码位置改为邮箱验证码 */}
                      <div
                        className={cn(
                          "grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          isRegister
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0 pointer-events-none"
                        )}
                      >
                        <div
                          className={cn(
                            "space-y-4 pt-1 px-1 -mx-1",
                            isRegister ? "overflow-visible" : "overflow-hidden"
                          )}
                        >
                          <div className="space-y-1.5">
                            <Label htmlFor="emailOtp">邮箱验证码</Label>
                            <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                              <input
                                id="emailOtp"
                                type="text"
                                value={emailOtp}
                                onChange={(event) =>
                                  setEmailOtp(event.target.value.trim())
                                }
                                placeholder="请输入邮箱收到的验证码"
                                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                                maxLength={8}
                              />
                              <button
                                type="button"
                                onClick={handleSendRegisterOtp}
                                disabled={otpSending || otpCountdown > 0 || !email.trim()}
                                className="shrink-0 ml-2 rounded-lg bg-orange-100/90 px-3 py-1.5 text-xs font-semibold text-primary shadow-2xs transition-colors hover:bg-orange-200/90 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {otpSending
                                  ? "发送中..."
                                  : otpCountdown > 0
                                  ? `${otpCountdown}s 后重发`
                                  : "获取验证码"}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="inviteCode">邀请码（选填）</Label>
                            <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                              <input
                                id="inviteCode"
                                value={inviteCode}
                                onChange={(event) =>
                                  setInviteCode(event.target.value)
                                }
                                placeholder="请输入邀请码"
                                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                              />
                            </div>
                          </div>
                          <div className="flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5">
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
                        </div>
                      </div>

                      {error ? (
                        <div
                          role="alert"
                          aria-live="polite"
                          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-600"
                        >
                          {error}
                        </div>
                      ) : null}

                      {message ? (
                        <div
                          role="status"
                          aria-live="polite"
                          className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-xs text-green-700"
                        >
                          {message}
                        </div>
                      ) : null}

                      <Button
                        ref={submitBtnRef}
                        type="submit"
                        className="h-11 w-full rounded-xl text-sm font-semibold"
                        disabled={loading}
                      >
                        {loading
                          ? "处理中..."
                          : isRegister
                          ? "注册"
                          : "登录"}
                      </Button>
                    </form>

                    {/* 谷歌登录紧跟在登录主按钮正下方 */}
                    <div className="mt-3">
                      <AlternateLoginMethods
                        mode={currentMode}
                        redirectTo={
                          redirectTo === "/" ? "/account" : redirectTo
                        }
                        inviteCode={inviteCode}
                        acceptedTerms={acceptedTerms}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
      {/* 登录成功同心圆柔光涟漪转场层（以登录按钮为圆心扩散，像蒙版一样随着涟漪经过的位置揭开网站页面） */}
      {loginSuccess && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @keyframes jianlian-auth-btn-ripple {
                  0% {
                    transform: translate(-50%, -50%) scale(0.08);
                    opacity: 0.95;
                  }
                  45% {
                    opacity: 0.75;
                  }
                  100% {
                    transform: translate(-50%, -50%) scale(36);
                    opacity: 0;
                  }
                }
                @keyframes jianlian-mask-curtain-reveal {
                  0% {
                    clip-path: circle(0px at var(--ripple-cx) var(--ripple-cy));
                    opacity: 0.9;
                  }
                  50% {
                    opacity: 1;
                  }
                  100% {
                    clip-path: circle(160vmax at var(--ripple-cx) var(--ripple-cy));
                    opacity: 1;
                  }
                }
                @keyframes jianlian-auth-glow {
                  0% { opacity: 0; }
                  40% { opacity: 0.6; }
                  100% { opacity: 0.92; }
                }
              `,
            }}
          />
          {/* 蒙版扩散揭开层：以登录按钮为圆心，随着涟漪扩散揭开网站真实页面 */}
          <div
            style={{
              ["--ripple-cx" as string]: rippleOrigin ? `${rippleOrigin.x}px` : "72%",
              ["--ripple-cy" as string]: rippleOrigin ? `${rippleOrigin.y}px` : "58%",
            }}
            className="fixed inset-0 z-40 bg-[#fdfaf7] animate-[jianlian-mask-curtain-reveal_1.35s_cubic-bezier(0.16,1,0.3,1)_forwards] shadow-2xl overflow-hidden"
          >
            {/* 揭开后即时展现的 Jianlian 网站真实版面与欢迎氛围 */}
            <div className="flex h-full w-full">
              {/* 真实站点左侧导航栏 */}
              <aside className="hidden md:flex w-64 flex-col justify-between border-r border-orange-100/80 bg-white/90 p-5 shadow-xs">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-lg shadow-md shadow-orange-500/25">
                      JL
                    </div>
                    <div>
                      <h2 className="text-base font-black tracking-tight text-slate-900">Jianlian</h2>
                      <p className="text-[11px] font-semibold text-slate-600">数字商品服务</p>
                    </div>
                  </div>
                  <nav className="space-y-1.5 text-xs font-semibold">
                    <div className="flex items-center gap-2.5 rounded-xl bg-orange-50 px-3.5 py-2.5 text-primary shadow-xs">
                      <Sparkles className="h-4 w-4" />
                      <span>首页</span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-slate-600">
                      <span>国际 Sim 卡</span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-slate-600">
                      <span>礼品卡 / 充值卡</span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-slate-600">
                      <span>AI 会员充值</span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-slate-600">
                      <span>推广中心</span>
                    </div>
                  </nav>
                </div>
                <div className="rounded-xl border border-orange-200/60 bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-center text-xs font-bold text-white shadow-sm">
                  在线客服
                </div>
              </aside>

              {/* 真实站点主内容区 */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* 顶部公告与账户栏 */}
                <header className="flex items-center justify-between border-b border-orange-100/70 bg-white/80 px-6 py-3.5 backdrop-blur-md">
                  <div className="flex items-center gap-2 rounded-full border border-orange-200/70 bg-orange-50/80 px-3.5 py-1 text-xs font-medium text-slate-700 max-w-lg truncate">
                    <span className="font-bold text-primary">公告</span>
                    <span className="truncate">个人或团体合法电商拓客使用，严禁利用购买商品进行任何违法犯罪活动</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <div className="rounded-full border border-orange-200/70 bg-orange-50/90 px-3 py-1 text-primary">
                      余额 ¥34.20
                    </div>
                    <div className="text-slate-700">{email || "用户"}</div>
                  </div>
                </header>

                {/* 页面迎宾与路由就绪 */}
                <main className="flex flex-1 items-center justify-center p-6">
                  <div className="rounded-3xl border border-orange-200/90 bg-white/95 p-8 text-center shadow-xl backdrop-blur-md max-w-sm space-y-4 animate-[jianlian-bubble-pop_0.4s_ease-out_forwards]">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-primary shadow-xs">
                      <Sparkles className="h-7 w-7 animate-spin" style={{ animationDuration: "3s" }} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-slate-900">欢迎进入 Jianlian</h3>
                      <p className="text-xs font-medium text-slate-500">验证通过，正在为您载入商户中心...</p>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>会话已建立</span>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>

          {/* 以登录按钮为圆心向外喷涌扩散的同心圆涟漪光环 */}
          <div
            style={{
              position: "absolute",
              left: rippleOrigin ? `${rippleOrigin.x}px` : "72%",
              top: rippleOrigin ? `${rippleOrigin.y}px` : "58%",
              zIndex: 45,
            }}
            className="h-32 w-32 rounded-full border-2 border-orange-400/80 bg-radial from-orange-400/30 to-transparent blur-[1px] animate-[jianlian-auth-btn-ripple_1.3s_cubic-bezier(0.1,0.8,0.2,1)_forwards]"
          />
          <div
            style={{
              position: "absolute",
              left: rippleOrigin ? `${rippleOrigin.x}px` : "72%",
              top: rippleOrigin ? `${rippleOrigin.y}px` : "58%",
              zIndex: 45,
            }}
            className="h-32 w-32 rounded-full border-2 border-amber-300/80 bg-radial from-amber-300/30 to-transparent blur-sm animate-[jianlian-auth-btn-ripple_1.3s_cubic-bezier(0.1,0.8,0.2,1)_0.18s_forwards]"
          />
          <div
            style={{
              position: "absolute",
              left: rippleOrigin ? `${rippleOrigin.x}px` : "72%",
              top: rippleOrigin ? `${rippleOrigin.y}px` : "58%",
              zIndex: 45,
            }}
            className="h-32 w-32 rounded-full border-2 border-orange-500/70 bg-radial from-orange-500/25 to-transparent blur-md animate-[jianlian-auth-btn-ripple_1.3s_cubic-bezier(0.1,0.8,0.2,1)_0.36s_forwards]"
          />
          <div className="absolute inset-0 z-50 bg-white/20 backdrop-blur-[1px] animate-[jianlian-auth-glow_0.9s_ease-out_forwards]" />
        </div>
      )}
    </main>
  );
}
