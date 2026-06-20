"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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

function getSafeErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message?: string }).message;
    return message && message.trim() ? message : fallback;
  }

  return fallback;
}

function getNetworkErrorMessage(error: unknown) {
  return "无法连接 Supabase 服务，请检查网络、代理或 Supabase 项目配置。";

  const rawMessage = getSafeErrorMessage(error, "");
  const lowerMessage = rawMessage.toLowerCase();

  if (
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("networkerror") ||
    lowerMessage.includes("load failed")
  ) {
    return "无法连接 Supabase Auth 服务，请检查 Supabase URL、Anon Key、服务器网络或域名 CORS 配置。";
  }

  return rawMessage || "网络请求失败，请稍后重试。";
}

function getSafeInternalRedirect(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

function getAuthRedirectUrl(path: string) {
  if (typeof window === "undefined") return `https://www.jianlian.shop${path}`;
  const origin = window.location.origin.includes("localhost")
    ? "http://localhost:3000"
    : "https://www.jianlian.shop";
  return `${origin}${path}`;
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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
          console.error("[Promotion] Failed to record visit", error);
        }
      } catch (visitError) {
        console.error("[Promotion] Failed to record visit", visitError);
      }
    }

    recordPromotionVisit();
  }, [inviteFromUrl]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const config = getSupabaseConfigStatus();
    if (!config.ok) {
      const configMessage =
        config.message ?? "Supabase URL 或 Key 未配置，请检查环境变量。";
      console.error("[Supabase Auth]", configMessage);
      setError(configMessage);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setError("请输入正确的邮箱地址。");
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      if (isRegister) {
        const normalizedInviteCode = inviteCode.trim();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl("/account"),
            data: normalizedInviteCode ? { invite_code: normalizedInviteCode } : undefined,
          },
        });

        if (signUpError) {
          setError(
            signUpError?.message ?? "Supabase Auth 注册失败，请稍后重试。"
          );
          return;
        }

        if (data?.session) {
          await getOrCreateProfile(supabase, data.session.user).catch(
            (profileError) =>
              console.error(
                "[Supabase Auth] Failed to prepare profile",
                profileError
              )
          );
          if (normalizedInviteCode) {
            try {
              const { error } = await supabase.rpc("bind_referrer_by_code", {
                input_invite_code: normalizedInviteCode,
              });
              if (error) {
                console.error("[Promotion] Failed to bind invite code", error);
              }
            } catch (bindError) {
              console.error("[Promotion] Failed to bind invite code", bindError);
            }
          }
          setMessage("注册成功，正在进入账户中心。");
          router.push("/account");
          router.refresh();
          return;
        }

        setMessage(
          "注册成功。如 Supabase 开启了邮箱验证，请完成验证后再登录。"
        );
        return;
      }

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (signInError) {
        setError(
          signInError?.message ?? "Supabase Auth 登录失败，请检查邮箱或密码。"
        );
        return;
      }

      setMessage("登录成功，正在进入账户中心。");
      if (signInData?.user) {
        await getOrCreateProfile(supabase, signInData.user).catch(
          (profileError) =>
            console.error(
              "[Supabase Auth] Failed to prepare profile",
              profileError
            )
        );
      }

      router.push(redirectTo);
      router.refresh();
    } catch (authException) {
      console.error("[Supabase Auth] Network or runtime exception", authException);
      setError(getNetworkErrorMessage(authException));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#fff4e7] text-foreground">
      <div className="pointer-events-none fixed -left-20 -top-24 h-80 w-80 rounded-full bg-[#ffd6a1] opacity-55 blur-3xl" />
      <div className="pointer-events-none fixed -right-24 top-0 h-96 w-96 rounded-full bg-[#ffe1b8] opacity-65 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-140px] right-24 h-80 w-80 rounded-full bg-[#ffc47d] opacity-25 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <div className="flex items-center justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm ring-1 ring-orange-100 transition-all hover:scale-[1.02] hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_430px]">
          <section className="hidden lg:block">
            <div className="relative max-w-xl overflow-hidden rounded-[34px] border border-white/75 bg-white/45 p-10 shadow-[0_28px_90px_rgba(168,95,30,0.16)] backdrop-blur">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#ffca86]/60" />
              <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-[#ffdcb0]/65" />
              <div className="relative">
                <div className="mb-8 inline-flex items-center gap-3 rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-primary shadow-sm ring-1 ring-orange-100">
                  <img
                    src="/assets/jianlian-brand-logo.png"
                    alt="Jianlian"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-xl object-cover"
                  />
                  Jianlian 账号
                </div>

                <h1 className="max-w-lg text-[52px] font-black leading-[1.08] tracking-tight text-[#121827]">
                  欢迎加入 Jianlian
                </h1>
                <p className="mt-5 max-w-md text-xl font-semibold leading-9 text-slate-800">
                  使用邮箱和密码登录，刷新页面后也会保持登录状态。
                </p>
                <p className="mt-3 max-w-md text-base leading-7 text-slate-600">
                  登录后可查看账户信息、余额占位和订单入口。当前仅接入身份验证，不接支付和真实订单数据库。
                </p>

                <div className="mt-8 flex items-center gap-4 rounded-3xl bg-white/80 p-5 shadow-sm ring-1 ring-orange-100">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0df] text-primary">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-950">
                      Supabase Auth 登录
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      会话写入浏览器 cookie，适配 Next.js App Router。
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid max-w-lg grid-cols-3 gap-3">
                  {features.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl bg-white/80 p-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-orange-100 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <CheckCircle2 className="mb-3 h-5 w-5 text-primary" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="w-full">
            <div className="mx-auto max-w-[430px] rounded-[30px] bg-white/85 p-2 shadow-[0_28px_90px_rgba(15,23,42,0.16)] ring-1 ring-white/80 backdrop-blur">
              <div className="rounded-[24px] border border-orange-50 p-6 sm:p-7">
                <div className="mb-6 flex items-center gap-3">
                  <img
                    src="/assets/jianlian-brand-logo.png"
                    alt="Jianlian"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200"
                  />
                  <div>
                    <div className="text-xl font-black leading-tight">
                      Jianlian
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                      数字商品服务
                    </div>
                  </div>
                </div>

                <div className="mb-6 flex rounded-2xl bg-slate-100 p-1">
                  <AuthTab href="/login" active={!isRegister}>
                    登录
                  </AuthTab>
                  <AuthTab href="/register" active={isRegister}>
                    注册
                  </AuthTab>
                </div>

                <div className="mb-5">
                  <h2 className="text-2xl font-black">
                    {isRegister ? "创建新账号" : "欢迎回来"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isRegister
                      ? "填写邮箱和密码，创建你的 Jianlian 账号。"
                      : "登录成功后将进入账户中心。"}
                  </p>
                </div>

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
                  </div>

                  {isRegister ? (
                    <>
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
                            placeholder="请输入邀请码"
                            className="h-12 rounded-xl bg-slate-50 pl-10"
                          />
                        </div>
                      </div>
                    </>
                  ) : null}

                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      {error}
                    </div>
                  ) : null}

                  {message ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
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

                <div className="mt-5 flex items-center justify-between text-sm">
                  <Link
                    href={isRegister ? "/login" : "/register"}
                    className="font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    {isRegister ? "已有账号，去登录" : "没有账号，立即注册"}
                  </Link>
                  {!isRegister ? (
                    <Link
                      href="/forgot-password"
                      className="font-medium text-slate-500 transition-colors hover:text-primary"
                    >
                      忘记密码
                    </Link>
                  ) : null}
                </div>
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
        "flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-all",
        active
          ? "bg-white text-primary shadow-sm"
          : "text-slate-500 hover:text-primary"
      )}
    >
      {children}
    </Link>
  );
}
