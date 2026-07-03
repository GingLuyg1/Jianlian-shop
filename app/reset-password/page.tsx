"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateAuthPassword } from "@/lib/auth/password-policy";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setReady(Boolean(data.session));
        setInvalid(!data.session);
      })
      .catch(() => {
        if (!active) return;
        setReady(false);
        setInvalid(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    const passwordError = validateAuthPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("两次新密码必须一致。");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({
      password,
    });
    if (updateError) {
      setPassword("");
      setConfirmPassword("");
      setError("重置链接已失效或密码更新失败，请重新发送重置邮件。");
      setSubmitting(false);
      return;
    }

    toast.success("密码已重置，请重新登录。");
    setPassword("");
    setConfirmPassword("");
    await getSupabaseBrowserClient().auth.signOut({ scope: "global" });
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-[#fff4e7] px-4 py-8">
      <div className="mx-auto max-w-md">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>重置密码</CardTitle>
            <p className="text-sm text-muted-foreground">设置新的登录密码后，请重新登录。</p>
          </CardHeader>
          <CardContent>
            {!ready && !invalid ? (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ) : invalid ? (
              <div className="space-y-4">
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
                >
                  重置链接已失效或已过期，请重新发送重置邮件。
                </div>
                <Button asChild>
                  <Link href="/forgot-password">重新发送重置邮件</Link>
                </Button>
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
                <PasswordInput
                  id="password"
                  label="新密码"
                  value={password}
                  visible={showPassword}
                  onChange={setPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                />
                <PasswordInput
                  id="confirmPassword"
                  label="确认新密码"
                  value={confirmPassword}
                  visible={showPassword}
                  onChange={setConfirmPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                />
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {submitting ? "保存中..." : "设置新密码"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PasswordInput({
  id,
  label,
  onChange,
  onToggle,
  value,
  visible,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  value: string;
  visible: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11"
          autoComplete="new-password"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-label={visible ? "隐藏密码" : "显示密码"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}