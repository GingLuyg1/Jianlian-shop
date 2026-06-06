"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";

type AuthMode = "login" | "register";

type AuthScreenProps = {
  mode: AuthMode;
};

const features = ["Secure account", "Fast checkout", "Order tracking"];

export default function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegister = mode === "register";
  const redirectTo = searchParams.get("redirect") || "/";
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!hasSupabaseConfig()) {
      setError("Supabase 尚未配置，无法使用正式账号系统。");
      return;
    }

    const email = account.trim().toLowerCase();
    if (!email.includes("@")) {
      setError("当前正式版使用邮箱登录，手机号登录需要后续配置 Phone Auth。");
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: "user" },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            email,
            role: "user",
          });
        }

        if (!data.session) {
          setMessage("注册成功，请先完成邮箱验证后再登录。");
          router.push("/login");
          router.refresh();
          return;
        }

        router.push("/");
        router.refresh();
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      router.push(redirectTo);
      router.refresh();
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "认证失败，请检查账号、密码或 Supabase 配置。"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async () => {
    setError("");
    setMessage("");

    if (!hasSupabaseConfig()) {
      setError("Supabase 尚未配置，无法使用 Google 登录。");
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${redirectTo}`,
        },
      });

      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setError(
        oauthError instanceof Error ? oauthError.message : "Google 登录启动失败。"
      );
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
                    src="/assets/jianlian-logo.jpg"
                    alt="Jianlian"
                    className="h-8 w-8 rounded-xl object-cover"
                  />
                  Jianlian Account
                </div>

                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#fff8ef] px-4 py-2 text-sm font-semibold text-primary ring-1 ring-orange-100">
                  <ShieldCheck className="h-4 w-4" />
                  Supabase Auth
                </div>

                <h1 className="max-w-lg text-[52px] font-black leading-[1.08] tracking-tight text-[#121827]">
                  欢迎加入 Jianlian
                </h1>
                <p className="mt-5 max-w-md text-xl font-semibold leading-9 text-slate-800">
                  使用正式账号系统管理订单、余额和后台权限。
                </p>
                <p className="mt-3 max-w-md text-base leading-7 text-slate-600">
                  普通用户和管理员角色通过 Supabase profiles 表区分，后台只允许 admin 角色访问。
                </p>

                <div className="mt-8 flex items-center gap-4 rounded-3xl bg-white/80 p-5 shadow-sm ring-1 ring-orange-100">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0df] text-primary">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-950">
                      真实登录与后台权限
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      后续订单、充值、支付都可以关联真实用户 ID。
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
                    src="/assets/jianlian-logo.jpg"
                    alt="Jianlian"
                    className="h-11 w-11 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200"
                  />
                  <div>
                    <div className="text-xl font-black leading-tight">
                      Jianlian
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                      Digital Goods Service
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
                      ? "注册完成后默认是普通用户"
                      : "登录后可查看订单、余额和账号信息"}
                  </p>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleOAuthLogin}
                    className="h-11 rounded-xl bg-slate-50 text-sm font-semibold text-slate-500 ring-1 ring-slate-200 transition-all hover:scale-[1.02] hover:bg-white hover:text-primary"
                  >
                    Google
                  </button>
                  <button
                    type="button"
                    disabled
                    className="h-11 rounded-xl bg-slate-50 text-sm font-semibold text-slate-400 ring-1 ring-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Telegram
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="account">邮箱</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="account"
                        type="email"
                        value={account}
                        onChange={(event) => setAccount(event.target.value)}
                        placeholder="请输入邮箱"
                        className="h-12 rounded-xl bg-slate-50 pl-10"
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
                          required
                        />
                      </div>
                    </div>
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
                    {loading
                      ? "处理中..."
                      : isRegister
                        ? "注册并进入首页"
                        : "登录"}
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
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      忘记密码
                    </button>
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
