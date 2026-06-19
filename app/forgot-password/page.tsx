"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function getResetRedirectTo() {
  if (typeof window === "undefined") return "https://www.jianlian.shop/reset-password";
  return window.location.origin.includes("localhost")
    ? "http://localhost:3000/reset-password"
    : "https://www.jianlian.shop/reset-password";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setError("请输入正确的邮箱地址。");
      return;
    }
    setSubmitting(true);
    try {
      await getSupabaseBrowserClient().auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getResetRedirectTo(),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff4e7] px-4 py-8">
      <div className="mx-auto max-w-md">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />返回登录</Link>
        </Button>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>忘记密码</CardTitle>
            <p className="text-sm text-muted-foreground">输入注册邮箱，我们将发送密码重置邮件。</p>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                如果该邮箱已注册，重置邮件将发送至邮箱。
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
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
                <Button type="submit" className="w-full" disabled={submitting}>
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
