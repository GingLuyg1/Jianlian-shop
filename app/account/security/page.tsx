"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SecurityTab = "change-email" | "email-password" | "old-password";

export default function AccountSecurityPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SecurityTab>("change-email");
  const [userEmail, setUserEmail] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(true);

  // Tab 1: Change Email form state
  const [emailForm, setEmailForm] = useState({
    currentCode: "",
    newEmail: "",
    newCode: "",
  });
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({});
  const [currentCodeCountdown, setCurrentCodeCountdown] = useState(0);
  const [newCodeCountdown, setNewCodeCountdown] = useState(0);
  const [sendingCurrentCode, setSendingCurrentCode] = useState(false);
  const [sendingNewCode, setSendingNewCode] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Tab 2: Email Reset Password form state
  const [emailPwdForm, setEmailPwdForm] = useState({
    code: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [emailPwdErrors, setEmailPwdErrors] = useState<Record<string, string>>({});
  const [emailPwdCountdown, setEmailPwdCountdown] = useState(0);
  const [sendingEmailPwdCode, setSendingEmailPwdCode] = useState(false);
  const [savingEmailPwd, setSavingEmailPwd] = useState(false);
  const [showEmailPwd, setShowEmailPwd] = useState({ new: false, confirm: false });

  // Tab 3: Old Password Change form state
  const [oldPwdForm, setOldPwdForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [oldPwdErrors, setOldPwdErrors] = useState<Record<string, string>>({});
  const [savingOldPwd, setSavingOldPwd] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState({ old: false, new: false, confirm: false });

  // Countdown timers
  useEffect(() => {
    if (currentCodeCountdown <= 0) return;
    const timer = setInterval(() => setCurrentCodeCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [currentCodeCountdown]);

  useEffect(() => {
    if (newCodeCountdown <= 0) return;
    const timer = setInterval(() => setNewCodeCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [newCodeCountdown]);

  useEffect(() => {
    if (emailPwdCountdown <= 0) return;
    const timer = setInterval(() => setEmailPwdCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [emailPwdCountdown]);

  // Load current user
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch (err) {
        console.error("Failed to load user email:", err);
      } finally {
        setLoadingUser(false);
      }
    }
    void loadCurrentUser();
  }, []);

  // --- Handlers for Tab 1: 更换绑定邮箱 ---
  async function handleSendCurrentEmailCode() {
    if (currentCodeCountdown > 0 || sendingCurrentCode || !userEmail) return;
    setSendingCurrentCode(true);
    setEmailErrors((prev) => ({ ...prev, currentCode: "" }));
    try {
      const res = await fetch("/api/account/security/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, purpose: "current_email_verify" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送验证码失败");
      toast.success(data.message || "验证码已发送至当前邮箱，请查收");
      setCurrentCodeCountdown(60);
    } catch (err: any) {
      toast.error(err.message || "发送失败，请稍后重试");
      setEmailErrors((prev) => ({ ...prev, currentCode: err.message }));
    } finally {
      setSendingCurrentCode(false);
    }
  }

  async function handleSendNewEmailCode() {
    if (newCodeCountdown > 0 || sendingNewCode) return;
    const newMail = emailForm.newEmail.trim().toLowerCase();
    if (!newMail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMail)) {
      setEmailErrors((prev) => ({ ...prev, newEmail: "请输入有效的邮箱地址" }));
      return;
    }
    if (newMail === userEmail.toLowerCase()) {
      setEmailErrors((prev) => ({ ...prev, newEmail: "新邮箱不能与当前绑定邮箱相同" }));
      return;
    }

    setSendingNewCode(true);
    setEmailErrors((prev) => ({ ...prev, newEmail: "", newCode: "" }));
    try {
      const res = await fetch("/api/account/security/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newMail, purpose: "new_email_verify" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送新邮箱验证码失败");
      toast.success(data.message || "验证码已发送至新邮箱，请查收");
      setNewCodeCountdown(60);
    } catch (err: any) {
      toast.error(err.message || "发送失败，请稍后重试");
      setEmailErrors((prev) => ({ ...prev, newEmail: err.message }));
    } finally {
      setSendingNewCode(false);
    }
  }

  async function handleSubmitChangeEmail(e: FormEvent) {
    e.preventDefault();
    if (savingEmail) return;

    const errors: Record<string, string> = {};
    if (!emailForm.currentCode.trim()) errors.currentCode = "请输入当前邮箱验证码";
    if (!emailForm.newEmail.trim()) errors.newEmail = "请输入新的绑定邮箱";
    if (!emailForm.newCode.trim()) errors.newCode = "请输入新邮箱验证码";

    if (Object.keys(errors).length > 0) {
      setEmailErrors(errors);
      return;
    }

    setSavingEmail(true);
    try {
      const res = await fetch("/api/account/security/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCode: emailForm.currentCode.trim(),
          newEmail: emailForm.newEmail.trim().toLowerCase(),
          newCode: emailForm.newCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更换邮箱失败");

      toast.success("邮箱更换成功！已绑定新邮箱：" + data.email);
      setUserEmail(data.email);
      setEmailForm({ currentCode: "", newEmail: "", newCode: "" });
      setEmailErrors({});
    } catch (err: any) {
      toast.error(err.message || "更换邮箱失败，请检查验证码");
      setEmailErrors((prev) => ({ ...prev, form: err.message }));
    } finally {
      setSavingEmail(false);
    }
  }

  // --- Handlers for Tab 2: 邮箱改密码 ---
  async function handleSendEmailPwdCode() {
    if (emailPwdCountdown > 0 || sendingEmailPwdCode || !userEmail) return;
    setSendingEmailPwdCode(true);
    setEmailPwdErrors((prev) => ({ ...prev, code: "" }));
    try {
      const res = await fetch("/api/account/security/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, purpose: "password_reset" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送重置密码验证码失败");
      toast.success(data.message || "改密验证码已发送至您的注册邮箱");
      setEmailPwdCountdown(60);
    } catch (err: any) {
      toast.error(err.message || "发送失败，请稍后重试");
      setEmailPwdErrors((prev) => ({ ...prev, code: err.message }));
    } finally {
      setSendingEmailPwdCode(false);
    }
  }

  async function handleSubmitEmailPwd(e: FormEvent) {
    e.preventDefault();
    if (savingEmailPwd) return;

    const errors: Record<string, string> = {};
    if (!emailPwdForm.code.trim()) errors.code = "请输入邮箱收到的验证码";
    if (emailPwdForm.newPassword.length < 8) errors.newPassword = "新密码长度至少 8 位";
    if (!/[A-Za-z]/.test(emailPwdForm.newPassword) || !/[0-9]/.test(emailPwdForm.newPassword)) {
      errors.newPassword = "新密码需同时包含字母和数字";
    }
    if (emailPwdForm.newPassword !== emailPwdForm.confirmPassword) {
      errors.confirmPassword = "两次输入的新密码不一致";
    }

    if (Object.keys(errors).length > 0) {
      setEmailPwdErrors(errors);
      return;
    }

    setSavingEmailPwd(true);
    try {
      const res = await fetch("/api/account/security/reset-password-by-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: emailPwdForm.code.trim(),
          newPassword: emailPwdForm.newPassword,
          confirmPassword: emailPwdForm.confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改密码失败");

      toast.success("密码修改成功！请使用新密码重新登录");
      setEmailPwdForm({ code: "", newPassword: "", confirmPassword: "" });
      setEmailPwdErrors({});

      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut({ scope: "global" });
      router.replace("/login?redirect=/account/security");
    } catch (err: any) {
      toast.error(err.message || "修改密码失败，请稍后重试");
      setEmailPwdErrors((prev) => ({ ...prev, form: err.message }));
    } finally {
      setSavingEmailPwd(false);
    }
  }

  // --- Handlers for Tab 3: 原密码改密码 ---
  async function handleSubmitOldPwd(e: FormEvent) {
    e.preventDefault();
    if (savingOldPwd) return;

    const errors: Record<string, string> = {};
    if (!oldPwdForm.oldPassword) errors.oldPassword = "请输入原密码";
    if (oldPwdForm.newPassword.length < 8) errors.newPassword = "新密码长度至少 8 位";
    if (!/[A-Za-z]/.test(oldPwdForm.newPassword) || !/[0-9]/.test(oldPwdForm.newPassword)) {
      errors.newPassword = "新密码需同时包含字母和数字";
    }
    if (oldPwdForm.newPassword === oldPwdForm.oldPassword) {
      errors.newPassword = "新密码不能与原密码相同";
    }
    if (oldPwdForm.newPassword !== oldPwdForm.confirmPassword) {
      errors.confirmPassword = "两次输入的新密码不一致";
    }

    if (Object.keys(errors).length > 0) {
      setOldPwdErrors(errors);
      return;
    }

    setSavingOldPwd(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!userEmail) throw new Error("无法获取当前用户信息，请重新登录");

      // Verify old password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPwdForm.oldPassword,
      });

      if (verifyError) {
        setOldPwdErrors({ oldPassword: "原密码不正确，请重新输入" });
        setSavingOldPwd(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: oldPwdForm.newPassword,
      });

      if (updateError) throw updateError;

      toast.success("密码已成功修改！请使用新密码重新登录");
      await supabase.auth.signOut({ scope: "global" });
      router.replace("/login?redirect=/account/security");
    } catch (err: any) {
      toast.error(err.message || "修改密码失败，请稍后重试");
      setOldPwdErrors((prev) => ({ ...prev, form: err.message }));
    } finally {
      setSavingOldPwd(false);
    }
  }

  return (
    <Card
      data-account-page="/account/security"
      data-account-ready={true}
      aria-busy={false}
      className={cn(
        glass.surface,
        styles.panel,
        styles.page,
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-slate-200/80 bg-slate-50/50 shadow-sm"
      )}
    >
      <CardHeader className={cn(glass.hero, styles.pageHeader, "border-b border-slate-100 bg-white/80 pb-4 pt-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900">账号安全设置</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              全方位保护您的账号与资产安全，支持邮箱验证与多维度密码保护
            </p>
          </div>

          {/* Top Segmented Navigation Tabs */}
          <div className="flex items-center rounded-xl bg-slate-100/90 p-1 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab("change-email")}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-all duration-200",
                activeTab === "change-email"
                  ? "bg-white font-semibold text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              更换绑定邮箱
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("email-password")}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-all duration-200",
                activeTab === "email-password"
                  ? "bg-white font-semibold text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              邮箱改密码
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("old-password")}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-all duration-200",
                activeTab === "old-password"
                  ? "bg-white font-semibold text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              原密码改密码
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto max-w-xl">
          {/* TAB 1: 更换绑定邮箱 (Ref 图2) */}
          {activeTab === "change-email" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">更换绑定邮箱</h3>
                  <p className="mt-1 text-xs text-slate-500">验证当前邮箱后更换</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Mail className="h-5 w-5" />
                </div>
              </div>

              <form onSubmit={handleSubmitChangeEmail} className="space-y-4">
                {/* 1. 当前绑定邮箱 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">当前绑定邮箱</Label>
                  <Input
                    type="text"
                    readOnly
                    disabled
                    value={loadingUser ? "加载中..." : userEmail || "未绑定邮箱"}
                    className="mt-1.5 h-11 rounded-lg border-slate-200 bg-slate-50 text-slate-600 cursor-not-allowed"
                  />
                </div>

                {/* 2. 当前邮箱验证码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">当前邮箱验证码</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      type="text"
                      maxLength={6}
                      placeholder="请输入 6 位邮箱验证码"
                      value={emailForm.currentCode}
                      onChange={(e) => {
                        setEmailForm((prev) => ({ ...prev, currentCode: e.target.value }));
                        setEmailErrors((prev) => ({ ...prev, currentCode: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200",
                        emailErrors.currentCode && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <Button
                      type="button"
                      onClick={handleSendCurrentEmailCode}
                      disabled={currentCodeCountdown > 0 || sendingCurrentCode || !userEmail}
                      className="h-11 min-w-[110px] rounded-lg bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {sendingCurrentCode ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : currentCodeCountdown > 0 ? (
                        `${currentCodeCountdown}s 后重发`
                      ) : (
                        "获取验证码"
                      )}
                    </Button>
                  </div>
                  {emailErrors.currentCode && (
                    <p className="mt-1 text-xs text-red-600">{emailErrors.currentCode}</p>
                  )}
                </div>

                {/* 3. 新绑定邮箱 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">新绑定邮箱</Label>
                  <Input
                    type="email"
                    placeholder="请输入新的绑定邮箱"
                    value={emailForm.newEmail}
                    onChange={(e) => {
                      setEmailForm((prev) => ({ ...prev, newEmail: e.target.value }));
                      setEmailErrors((prev) => ({ ...prev, newEmail: "" }));
                    }}
                    className={cn(
                      "mt-1.5 h-11 rounded-lg border-slate-200",
                      emailErrors.newEmail && "border-red-500 focus:ring-red-500/20"
                    )}
                  />
                  {emailErrors.newEmail && (
                    <p className="mt-1 text-xs text-red-600">{emailErrors.newEmail}</p>
                  )}
                </div>

                {/* 4. 新邮箱验证码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">新邮箱验证码</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      type="text"
                      maxLength={6}
                      placeholder="请输入新邮箱 6 位验证码"
                      value={emailForm.newCode}
                      onChange={(e) => {
                        setEmailForm((prev) => ({ ...prev, newCode: e.target.value }));
                        setEmailErrors((prev) => ({ ...prev, newCode: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200",
                        emailErrors.newCode && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <Button
                      type="button"
                      onClick={handleSendNewEmailCode}
                      disabled={newCodeCountdown > 0 || sendingNewCode || !emailForm.newEmail.trim()}
                      className="h-11 min-w-[110px] rounded-lg bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {sendingNewCode ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : newCodeCountdown > 0 ? (
                        `${newCodeCountdown}s 后重发`
                      ) : (
                        "发送验证码"
                      )}
                    </Button>
                  </div>
                  {emailErrors.newCode && (
                    <p className="mt-1 text-xs text-red-600">{emailErrors.newCode}</p>
                  )}
                </div>

                {emailErrors.form && (
                  <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
                    {emailErrors.form}
                  </div>
                )}

                {/* 确认更换主按钮 */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingEmail}
                    className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-36"
                  >
                    {savingEmail ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        提交中...
                      </>
                    ) : (
                      "确认更换"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: 邮箱改密码 (Ref 图3) */}
          {activeTab === "email-password" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">邮箱改密码</h3>
                  <p className="mt-1 text-xs text-slate-500">使用邮箱验证码修改密码</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>

              <form onSubmit={handleSubmitEmailPwd} className="space-y-4">
                {/* 1. 注册邮箱 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">注册邮箱</Label>
                  <Input
                    type="text"
                    readOnly
                    disabled
                    value={loadingUser ? "加载中..." : userEmail || "未获取到账号邮箱"}
                    className="mt-1.5 h-11 rounded-lg border-slate-200 bg-slate-50 text-slate-600 cursor-not-allowed"
                  />
                </div>

                {/* 2. 邮箱验证码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">邮箱验证码</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      type="text"
                      maxLength={6}
                      placeholder="请输入 6 位邮箱验证码"
                      value={emailPwdForm.code}
                      onChange={(e) => {
                        setEmailPwdForm((prev) => ({ ...prev, code: e.target.value }));
                        setEmailPwdErrors((prev) => ({ ...prev, code: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200",
                        emailPwdErrors.code && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <Button
                      type="button"
                      onClick={handleSendEmailPwdCode}
                      disabled={emailPwdCountdown > 0 || sendingEmailPwdCode || !userEmail}
                      className="h-11 min-w-[110px] rounded-lg bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {sendingEmailPwdCode ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : emailPwdCountdown > 0 ? (
                        `${emailPwdCountdown}s 后重发`
                      ) : (
                        "获取验证码"
                      )}
                    </Button>
                  </div>
                  {emailPwdErrors.code && (
                    <p className="mt-1 text-xs text-red-600">{emailPwdErrors.code}</p>
                  )}
                </div>

                {/* 3. 新密码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">新密码</Label>
                  <div className="relative mt-1.5">
                    <Input
                      type={showEmailPwd.new ? "text" : "password"}
                      placeholder="请输入新密码（至少 8 位包含字母与数字）"
                      value={emailPwdForm.newPassword}
                      onChange={(e) => {
                        setEmailPwdForm((prev) => ({ ...prev, newPassword: e.target.value }));
                        setEmailPwdErrors((prev) => ({ ...prev, newPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200 pr-10",
                        emailPwdErrors.newPassword && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmailPwd((p) => ({ ...p, new: !p.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showEmailPwd.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {emailPwdErrors.newPassword && (
                    <p className="mt-1 text-xs text-red-600">{emailPwdErrors.newPassword}</p>
                  )}
                </div>

                {/* 4. 确认新密码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">确认新密码</Label>
                  <div className="relative mt-1.5">
                    <Input
                      type={showEmailPwd.confirm ? "text" : "password"}
                      placeholder="请再次输入新密码"
                      value={emailPwdForm.confirmPassword}
                      onChange={(e) => {
                        setEmailPwdForm((prev) => ({ ...prev, confirmPassword: e.target.value }));
                        setEmailPwdErrors((prev) => ({ ...prev, confirmPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200 pr-10",
                        emailPwdErrors.confirmPassword && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmailPwd((p) => ({ ...p, confirm: !p.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showEmailPwd.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {emailPwdErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">{emailPwdErrors.confirmPassword}</p>
                  )}
                </div>

                {emailPwdErrors.form && (
                  <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
                    {emailPwdErrors.form}
                  </div>
                )}

                {/* 确认修改主按钮 */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingEmailPwd}
                    className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-36"
                  >
                    {savingEmailPwd ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        提交中...
                      </>
                    ) : (
                      "确认修改"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: 原密码改密码 (Ref 图4) */}
          {activeTab === "old-password" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">原密码改密码</h3>
                  <p className="mt-1 text-xs text-slate-500">输入原密码后设置新密码</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <KeyRound className="h-5 w-5" />
                </div>
              </div>

              <form onSubmit={handleSubmitOldPwd} className="space-y-4">
                {/* 1. 原密码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">原密码</Label>
                  <div className="relative mt-1.5">
                    <Input
                      type={showOldPwd.old ? "text" : "password"}
                      placeholder="请输入原密码"
                      value={oldPwdForm.oldPassword}
                      onChange={(e) => {
                        setOldPwdForm((prev) => ({ ...prev, oldPassword: e.target.value }));
                        setOldPwdErrors((prev) => ({ ...prev, oldPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200 pr-10",
                        oldPwdErrors.oldPassword && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd((p) => ({ ...p, old: !p.old }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showOldPwd.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {oldPwdErrors.oldPassword && (
                    <p className="mt-1 text-xs text-red-600">{oldPwdErrors.oldPassword}</p>
                  )}
                </div>

                {/* 2. 新密码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">新密码</Label>
                  <div className="relative mt-1.5">
                    <Input
                      type={showOldPwd.new ? "text" : "password"}
                      placeholder="请输入新密码（至少 8 位包含字母与数字）"
                      value={oldPwdForm.newPassword}
                      onChange={(e) => {
                        setOldPwdForm((prev) => ({ ...prev, newPassword: e.target.value }));
                        setOldPwdErrors((prev) => ({ ...prev, newPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200 pr-10",
                        oldPwdErrors.newPassword && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd((p) => ({ ...p, new: !p.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showOldPwd.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {oldPwdErrors.newPassword && (
                    <p className="mt-1 text-xs text-red-600">{oldPwdErrors.newPassword}</p>
                  )}
                </div>

                {/* 3. 确认新密码 */}
                <div>
                  <Label className="text-xs font-medium text-slate-700">确认新密码</Label>
                  <div className="relative mt-1.5">
                    <Input
                      type={showOldPwd.confirm ? "text" : "password"}
                      placeholder="请再次输入新密码"
                      value={oldPwdForm.confirmPassword}
                      onChange={(e) => {
                        setOldPwdForm((prev) => ({ ...prev, confirmPassword: e.target.value }));
                        setOldPwdErrors((prev) => ({ ...prev, confirmPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-lg border-slate-200 pr-10",
                        oldPwdErrors.confirmPassword && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd((p) => ({ ...p, confirm: !p.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showOldPwd.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {oldPwdErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">{oldPwdErrors.confirmPassword}</p>
                  )}
                </div>

                {oldPwdErrors.form && (
                  <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
                    {oldPwdErrors.form}
                  </div>
                )}

                {/* 确认修改主按钮 */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingOldPwd}
                    className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-36"
                  >
                    {savingOldPwd ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        提交中...
                      </>
                    ) : (
                      "确认修改"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
