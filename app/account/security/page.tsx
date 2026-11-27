"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileLock2,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import EmailVerificationForm from "@/components/auth/EmailVerificationForm";
import TurnstileWidget from "@/components/security/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSafeAuthErrorMessage, isEmailFormatValid } from "@/lib/auth/password-policy";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { cn } from "@/lib/utils";

type SecurityTab = "change-email" | "email-password" | "old-password";

const SECURITY_TABS: Array<{
  id: SecurityTab;
  label: string;
  shortDesc: string;
  icon: typeof Mail;
}> = [
  {
    id: "change-email",
    label: "更换绑定邮箱",
    shortDesc: "双向验证码核验更换通知邮箱",
    icon: Mail,
  },
  {
    id: "email-password",
    label: "邮箱改密码",
    shortDesc: "通过注册邮箱验证码重置密码",
    icon: ShieldCheck,
  },
  {
    id: "old-password",
    label: "原密码改密码",
    shortDesc: "验证当前登录密码后设置新密码",
    icon: KeyRound,
  },
];

function evaluatePasswordChecks(pwd: string) {
  const hasMinLength = pwd.length >= 8;
  const hasRecommendedLength = pwd.length >= 12;
  const hasLetter = /[A-Za-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const score = [hasMinLength, hasLetter, hasNumber, hasRecommendedLength || hasSpecial].filter(Boolean).length;
  return {
    hasMinLength,
    hasRecommendedLength,
    hasLetter,
    hasNumber,
    hasSpecial,
    score,
  };
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "刚刚活跃";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "刚刚活跃";
  return d.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountSecurityPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SecurityTab>("change-email");
  const {
    containerRef: securityTabsRef,
    setItemRef: setSecurityTabRef,
    indicator: securityTabIndicator,
  } = useSlidingIndicator<SecurityTab>(activeTab);
  const [userEmail, setUserEmail] = useState<string>("");
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [copiedEmail, setCopiedEmail] = useState(false);

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

  // Cloudflare Turnstile gate for OTP email sending (morphs into OTP input once verified)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [cfVerified, setCfVerified] = useState(false);
  const [cfVerifying, setCfVerifying] = useState(false);
  const [cfResetSignal, setCfResetSignal] = useState(0);
  const cfRequired = turnstileEnabled && Boolean(turnstileSiteKey);
  const showOtpInputs = !cfRequired || cfVerified;

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

  const handleSecurityTurnstileVerify = useCallback(async (token: string) => {
    if (!token || cfVerifying) return;
    setCfVerifying(true);
    try {
      const response = await fetch("/api/auth/turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setCfVerified(false);
        setCfResetSignal((value) => value + 1);
        toast.error(payload?.error || "安全验证未通过，请重试");
        return;
      }
      setCfVerified(true);
    } catch {
      setCfVerified(false);
      setCfResetSignal((value) => value + 1);
      toast.error("安全验证网络异常，请重试");
    } finally {
      setCfVerifying(false);
    }
  }, [cfVerifying]);

  const resetSecurityTurnstile = useCallback(() => {
    setCfVerified(false);
    setCfResetSignal((value) => value + 1);
  }, []);

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

  // Load current user (fast local session first, then remote verification)
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          if (sessionData.session.user.email) setUserEmail(sessionData.session.user.email);
          if (sessionData.session.user.last_sign_in_at) setLastSignInAt(sessionData.session.user.last_sign_in_at);
          if (sessionData.session.user.created_at) setCreatedAt(sessionData.session.user.created_at);
          setLoadingUser(false);
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
        if (user?.last_sign_in_at) {
          setLastSignInAt(user.last_sign_in_at);
        }
        if (user?.created_at) {
          setCreatedAt(user.created_at);
        }
      } catch (err) {
        console.error("Failed to load user email:", err);
      } finally {
        setLoadingUser(false);
      }
    }
    void loadCurrentUser();
  }, []);

  const handleCopyEmail = useCallback(async () => {
    if (!userEmail) return;
    try {
      await navigator.clipboard.writeText(userEmail);
      setCopiedEmail(true);
      toast.success("已添加到剪贴板");
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  }, [userEmail]);

  // --- Handlers for Tab 1: 更换绑定邮箱 ---
  async function handleSendCurrentEmailCode() {
    if (currentCodeCountdown > 0 || sendingCurrentCode || !userEmail) return;
    if (cfRequired && !cfVerified) {
      setEmailErrors((prev) => ({ ...prev, currentCode: "请先完成安全验证后再获取验证码" }));
      return;
    }
    setSendingCurrentCode(true);
    setEmailErrors((prev) => ({ ...prev, currentCode: "" }));
    try {
      const res = await fetch("/api/account/security/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, purpose: "current_email_verify" }),
      });
      const data = await res.json().catch(() => ({}));
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
    if (cfRequired && !cfVerified) {
      setEmailErrors((prev) => ({ ...prev, newCode: "请先完成安全验证后再发送验证码" }));
      return;
    }
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
      const data = await res.json().catch(() => ({}));
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
      const data = await res.json().catch(() => ({}));
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
    if (cfRequired && !cfVerified) {
      setEmailPwdErrors((prev) => ({ ...prev, code: "请先完成安全验证后再获取验证码" }));
      return;
    }
    setSendingEmailPwdCode(true);
    setEmailPwdErrors((prev) => ({ ...prev, code: "" }));
    try {
      const res = await fetch("/api/account/security/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, purpose: "password_reset" }),
      });
      const data = await res.json().catch(() => ({}));
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
          confirmPassword: emailPwdForm.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
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

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPwdForm.oldPassword,
      });

      if (verifyError) {
        setOldPwdErrors({ oldPassword: "原密码不正确，请重新输入" });
        setSavingOldPwd(false);
        return;
      }

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

  const activePasswordChecks = useMemo(() => {
    const pwd = activeTab === "email-password" ? emailPwdForm.newPassword : oldPwdForm.newPassword;
    return evaluatePasswordChecks(pwd);
  }, [activeTab, emailPwdForm.newPassword, oldPwdForm.newPassword]);

  const primaryActionBtnClass =
    "bg-gradient-to-br from-[#df7c3f] to-[#d66b2c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_14px_-6px_rgba(181,118,66,0.55)] hover:from-[#e58549] hover:to-[#c96022] active:translate-y-[0.5px] disabled:opacity-60 border-0";

  const codeSendBtnClass =
    "h-11 min-w-[116px] shrink-0 rounded-xl border border-[#e6c4a3] bg-gradient-to-b from-[#fffaf3] to-[#ffedd8] px-4 text-xs font-semibold text-[#b85d23] shadow-[inset_0_1px_0_#fff,0_3px_8px_-5px_rgba(162,106,53,0.3)] hover:from-[#fff4e6] hover:to-[#ffe3c2] hover:text-[#9c4b18] disabled:opacity-55";

  return (
    <div
      data-account-page="/account/security"
      data-account-ready={!loadingUser}
      aria-busy={loadingUser}
      className={`${styles.page} flex min-h-0 min-w-0 flex-col gap-4 md:h-full md:overflow-hidden`}
    >
      {/* Top Security Panel with Header, Mode Switcher & 4-Metric Status Overview */}
      <Card className={`${glass.surface} ${styles.panel} shrink-0 overflow-hidden`}>
        <CardHeader
          className={`${glass.hero} ${styles.pageHeader} flex flex-col gap-3 !py-4 lg:flex-row lg:items-center lg:justify-between`}
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <span className={`${glass.icon} ${styles.sectionIcon}`}>
              <Shield className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-lg sm:text-xl">账号安全设置</CardTitle>
                <span className={styles.pill}>双重验证防护中</span>
              </div>
            </div>
          </div>

          {/* 增加精确 DOM 测量的平滑动态滑块效果的账号安全模式切换 Tab */}
          <div
            ref={securityTabsRef}
            className="relative flex w-full max-w-full overflow-x-auto rounded-2xl border border-orange-200/60 bg-orange-100/60 p-1 shadow-2xs shrink-0 self-start [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto lg:self-center"
            role="tablist"
            aria-label="账号安全操作模式"
          >
            {/* 平滑动态滑块背景 */}
            {securityTabIndicator.visible && (
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute top-1 bottom-1 rounded-xl bg-white shadow-xs ring-1 ring-orange-200/70",
                  securityTabIndicator.animated && "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                )}
                style={{
                  left: `${securityTabIndicator.left}px`,
                  width: `${securityTabIndicator.width}px`,
                }}
              />
            )}
            {SECURITY_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={setSecurityTabRef(tab.id)}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative z-10 inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-initial sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs",
                    isSelected
                      ? "text-primary font-black"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Icon className={cn("h-3 w-3 shrink-0 transition-colors sm:h-3.5 sm:w-3.5", isSelected ? "text-primary" : "text-slate-500")} aria-hidden="true" />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        {/* 4-Card Security Overview Strip */}
        <CardContent className="space-y-4 pt-1">
          {!loadingUser && !userEmail ? <EmailBinding /> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* Metric 1: Bound Email */}
            <div className={`${glass.inset} ${styles.stat} flex flex-col justify-between`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  当前绑定邮箱
                </span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  disabled={!userEmail}
                  className="inline-flex items-center gap-1 rounded-full border border-[#f0d8be] bg-[#fff8ef] px-2 py-0.5 text-[11px] font-medium text-[#b5672d] transition hover:bg-[#ffeed9] disabled:opacity-50"
                  title="点击复制绑定邮箱"
                >
                  {copiedEmail ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedEmail ? "已复制" : "复制"}</span>
                </button>
              </div>
              <p className="mt-3 truncate text-sm font-semibold text-slate-800" title={userEmail || undefined}>
                {loadingUser ? "正在读取..." : userEmail || "暂未绑定邮箱"}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>已认证 · 可接收验证码与订单通知</span>
              </div>
            </div>

            {/* Metric 2: Security Protection Level */}
            <div className={`${glass.inset} ${styles.stat} flex flex-col justify-between`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  安全防护等级
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  高 · 95分
                </span>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#71482e]">邮箱 + 密码双重保护</span>
                  <span className="text-[#b57944]">正常</span>
                </div>
                <div className={styles.vipProgress}>
                  <span style={{ width: "92%" }} />
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">敏感操作均需动态邮件验证码核验</p>
            </div>

            {/* Metric 3: Password Protection Status */}
            <div className={`${glass.inset} ${styles.stat} flex flex-col justify-between`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Lock className="h-3.5 w-3.5 text-primary" />
                  登录密码状态
                </span>
                <span className={styles.pill}>加密存储</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">已启用高强度加密验证</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span>支持邮箱验证码改密 / 原密码改密</span>
              </div>
            </div>

            {/* Metric 4: Active Session Info */}
            <div className={`${glass.inset} ${styles.stat} flex flex-col justify-between`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Clock3 className="h-3.5 w-3.5 text-primary" />
                  最近登录验证
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/70 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  当前在线
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                {loadingUser ? "—" : formatDateTime(lastSignInAt)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                注册于 {loadingUser ? "—" : formatDateTime(createdAt).split(" ")[0]}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Two-Column Workspace: Left Form Panel + Right Security Guide & Checklist */}
      <div className="grid min-h-0 min-w-0 flex-1 items-stretch gap-4 md:overflow-hidden xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        {/* LEFT COLUMN: Active Security Operation Form */}
        <section className={`${glass.surface} ${styles.panel} flex min-h-0 flex-col p-5 sm:p-6 md:h-full md:overflow-hidden`}>
          {/* TAB 1: 更换绑定邮箱 (Ref 图2) */}
          {activeTab === "change-email" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 flex shrink-0 items-start justify-between gap-4 border-b border-[#efe3d5] pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">更换绑定邮箱</h2>
                    <span className={styles.pill}>双向验证</span>
                  </div>
                </div>
                <span className={`${glass.icon} h-10 w-10`}>
                  <Mail className="h-5 w-5" strokeWidth={1.7} />
                </span>
              </div>

              <form onSubmit={handleSubmitChangeEmail} autoComplete="off" className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {/* 1. 当前绑定邮箱 (点击可复制到剪贴板，匹配参考图2) */}
                <div className={styles.field}>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sec-current-email" className="text-xs font-semibold text-slate-700">
                      当前绑定邮箱
                    </Label>
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="text-xs font-medium text-[#c5672b] hover:underline"
                    >
                      {copiedEmail ? "✓ 已添加到剪贴板" : "点击复制邮箱"}
                    </button>
                  </div>
                  <div
                    onClick={handleCopyEmail}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void handleCopyEmail();
                      }
                    }}
                    title="点击复制当前绑定邮箱"
                    className="mt-1.5 flex h-11 cursor-pointer items-center justify-between rounded-xl border border-[#eadfd3] bg-[#faf5ef]/90 px-3.5 text-sm font-medium text-[#695646] transition hover:border-[#dfc7ae]"
                  >
                    <span className="truncate">{loadingUser ? "加载中..." : userEmail || "未绑定邮箱"}</span>
                    <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-[#9b7b5e] shadow-sm">
                      {copiedEmail ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      {copiedEmail ? "已复制" : "复制"}
                    </span>
                  </div>
                </div>

                {/* 2. 当前邮箱验证码（开启 CF 时先借用为安全验证槽位，通过后 350ms 细腻动画覆盖切入验证码框） */}
                <div className={styles.field}>
                  <div className="relative min-h-[70px]">
                    {cfRequired ? (
                      <div
                        aria-hidden={showOtpInputs}
                        className={cn(
                          "transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          showOtpInputs
                            ? "pointer-events-none absolute inset-0 -translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                            : "relative translate-y-0 scale-100 opacity-100"
                        )}
                      >
                        <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 px-3 py-2">
                          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-600">
                            <span>安全验证（Cloudflare）</span>
                            <span className="text-slate-400">
                              {cfVerifying ? "正在核验..." : "通过后自动覆盖展开「当前 / 新邮箱验证码」"}
                            </span>
                          </div>
                          <TurnstileWidget
                            siteKey={turnstileSiteKey}
                            resetSignal={cfResetSignal}
                            onVerify={(token) => void handleSecurityTurnstileVerify(token)}
                            onExpire={() => setCfVerified(false)}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div
                      aria-hidden={!showOtpInputs}
                      className={cn(
                        "transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        showOtpInputs
                          ? "relative translate-y-0 scale-100 opacity-100"
                          : "pointer-events-none absolute inset-0 translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="sec-current-email-code" className="text-xs font-semibold text-slate-700">
                          当前邮箱验证码
                        </Label>
                        {cfRequired && cfVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <span>✓ 安全验证已通过</span>
                            <button
                              type="button"
                              onClick={resetSecurityTurnstile}
                              className="ml-0.5 text-emerald-600 underline hover:text-emerald-800"
                            >
                              重验
                            </button>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex gap-2.5">
                        <Input
                          id="sec-current-email-code"
                          name="current_email_otp_code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          tabIndex={showOtpInputs ? 0 : -1}
                          placeholder="请输入 6 位邮箱验证码"
                          value={emailForm.currentCode}
                          onChange={(e) => {
                            setEmailForm((prev) => ({ ...prev, currentCode: e.target.value }));
                            setEmailErrors((prev) => ({ ...prev, currentCode: "" }));
                          }}
                          className={cn(
                            "h-11 rounded-xl border-[#eadfd3] bg-white/90 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                            emailErrors.currentCode && "border-red-500 focus-visible:ring-red-500/20"
                          )}
                        />
                        <Button
                          type="button"
                          onClick={handleSendCurrentEmailCode}
                          disabled={currentCodeCountdown > 0 || sendingCurrentCode || !userEmail || (cfRequired && !cfVerified)}
                          tabIndex={showOtpInputs ? 0 : -1}
                          className={codeSendBtnClass}
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
                        <p className="mt-1.5 text-xs text-red-600">{emailErrors.currentCode}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. 新绑定邮箱 */}
                <div className={styles.field}>
                  <Label htmlFor="sec-new-email" className="text-xs font-semibold text-slate-700">
                    新绑定邮箱
                  </Label>
                  <Input
                    id="sec-new-email"
                    name="new_binding_email_address"
                    type="email"
                    autoComplete="off"
                    placeholder="请输入新的绑定邮箱地址"
                    value={emailForm.newEmail}
                    onChange={(e) => {
                      setEmailForm((prev) => ({ ...prev, newEmail: e.target.value }));
                      setEmailErrors((prev) => ({ ...prev, newEmail: "" }));
                    }}
                    className={cn(
                      "mt-1.5 h-11 rounded-xl border-[#eadfd3] bg-white/90 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                      emailErrors.newEmail && "border-red-500 focus-visible:ring-red-500/20"
                    )}
                  />
                  {emailErrors.newEmail && (
                    <p className="mt-1.5 text-xs text-red-600">{emailErrors.newEmail}</p>
                  )}
                </div>

                {/* 4. 新邮箱验证码（CF 通过后同步 350ms 细腻动画覆盖解锁） */}
                <div className={styles.field}>
                  <div className="relative min-h-[70px]">
                    {cfRequired ? (
                      <div
                        aria-hidden={showOtpInputs}
                        className={cn(
                          "flex h-[70px] items-center justify-between rounded-xl border border-dashed border-orange-200/90 bg-orange-50/35 px-4 text-xs text-slate-500 transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          showOtpInputs
                            ? "pointer-events-none absolute inset-0 -translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                            : "relative translate-y-0 scale-100 opacity-100"
                        )}
                      >
                        <span className="font-medium text-slate-600">新邮箱验证码</span>
                        <span className="text-amber-700">完成上方安全验证后自动展开</span>
                      </div>
                    ) : null}

                    <div
                      aria-hidden={!showOtpInputs}
                      className={cn(
                        "transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        showOtpInputs
                          ? "relative translate-y-0 scale-100 opacity-100"
                          : "pointer-events-none absolute inset-0 translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                      )}
                    >
                      <Label htmlFor="sec-new-email-code" className="text-xs font-semibold text-slate-700">
                        新邮箱验证码
                      </Label>
                      <div className="mt-1.5 flex gap-2.5">
                        <Input
                          id="sec-new-email-code"
                          name="new_email_otp_code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          tabIndex={showOtpInputs ? 0 : -1}
                          placeholder="请输入新邮箱 6 位验证码"
                          value={emailForm.newCode}
                          onChange={(e) => {
                            setEmailForm((prev) => ({ ...prev, newCode: e.target.value }));
                            setEmailErrors((prev) => ({ ...prev, newCode: "" }));
                          }}
                          className={cn(
                            "h-11 rounded-xl border-[#eadfd3] bg-white/90 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                            emailErrors.newCode && "border-red-500 focus-visible:ring-red-500/20"
                          )}
                        />
                        <Button
                          type="button"
                          onClick={handleSendNewEmailCode}
                          disabled={newCodeCountdown > 0 || sendingNewCode || !emailForm.newEmail.trim() || (cfRequired && !cfVerified)}
                          tabIndex={showOtpInputs ? 0 : -1}
                          className={codeSendBtnClass}
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
                        <p className="mt-1.5 text-xs text-red-600">{emailErrors.newCode}</p>
                      )}
                    </div>
                  </div>
                </div>

                {emailErrors.form && (
                  <div className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700">
                    {emailErrors.form}
                  </div>
                )}
                </div>

                <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#efe3d5]/80 pt-3.5">
                  <Button
                    type="submit"
                    disabled={savingEmail}
                    className={cn("h-11 w-full rounded-xl px-7 text-sm font-semibold sm:w-auto", primaryActionBtnClass)}
                  >
                    {savingEmail ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在核验更换...
                      </>
                    ) : (
                      "确认更换"
                    )}
                  </Button>
                  <span className="text-xs text-slate-400">验证码 10 分钟内有效，如未收到请检查垃圾箱</span>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: 邮箱改密码 (Ref 图3) */}
          {activeTab === "email-password" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 flex shrink-0 items-start justify-between gap-4 border-b border-[#efe3d5] pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">邮箱改密码</h2>
                    <span className={styles.pill}>免原密码重置</span>
                  </div>
                </div>
                <span className={`${glass.icon} h-10 w-10`}>
                  <ShieldCheck className="h-5 w-5" strokeWidth={1.7} />
                </span>
              </div>

              <form onSubmit={handleSubmitEmailPwd} autoComplete="off" className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {/* Hidden username anchor to prevent browser password manager from autofilling the OTP input */}
                <input
                  type="text"
                  name="username"
                  value={userEmail}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  autoComplete="username"
                  className="sr-only"
                />

                {/* 1. 注册邮箱 */}
                <div className={styles.field}>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sec-reg-email" className="text-xs font-semibold text-slate-700">
                      注册邮箱
                    </Label>
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="text-xs font-medium text-[#c5672b] hover:underline"
                    >
                      {copiedEmail ? "✓ 已添加到剪贴板" : "点击复制"}
                    </button>
                  </div>
                  <div
                    onClick={handleCopyEmail}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void handleCopyEmail();
                      }
                    }}
                    className="mt-1.5 flex h-11 cursor-pointer items-center justify-between rounded-xl border border-[#eadfd3] bg-[#faf5ef]/90 px-3.5 text-sm font-medium text-[#695646] transition hover:border-[#dfc7ae]"
                  >
                    <span className="truncate">{loadingUser ? "加载中..." : userEmail || "未获取到账号邮箱"}</span>
                    <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-[#9b7b5e] shadow-sm">
                      已验证
                    </span>
                  </div>
                </div>

                {/* 2. 邮箱验证码（开启 CF 时先借用为安全验证槽位，通过后 350ms 细腻动画覆盖切入） */}
                <div className={styles.field}>
                  <div className="relative min-h-[70px]">
                    {cfRequired ? (
                      <div
                        aria-hidden={showOtpInputs}
                        className={cn(
                          "transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          showOtpInputs
                            ? "pointer-events-none absolute inset-0 -translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                            : "relative translate-y-0 scale-100 opacity-100"
                        )}
                      >
                        <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 px-3 py-2">
                          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-600">
                            <span>安全验证（Cloudflare）</span>
                            <span className="text-slate-400">
                              {cfVerifying ? "正在核验..." : "通过后自动覆盖展开「邮箱验证码」"}
                            </span>
                          </div>
                          <TurnstileWidget
                            siteKey={turnstileSiteKey}
                            resetSignal={cfResetSignal}
                            onVerify={(token) => void handleSecurityTurnstileVerify(token)}
                            onExpire={() => setCfVerified(false)}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div
                      aria-hidden={!showOtpInputs}
                      className={cn(
                        "transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        showOtpInputs
                          ? "relative translate-y-0 scale-100 opacity-100"
                          : "pointer-events-none absolute inset-0 translate-y-1.5 scale-[0.985] opacity-0 blur-[1px]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="sec-reset-otp-code" className="text-xs font-semibold text-slate-700">
                          邮箱验证码
                        </Label>
                        {cfRequired && cfVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <span>✓ 安全验证已通过</span>
                            <button
                              type="button"
                              onClick={resetSecurityTurnstile}
                              className="ml-0.5 text-emerald-600 underline hover:text-emerald-800"
                            >
                              重验
                            </button>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex gap-2.5">
                        <Input
                          id="sec-reset-otp-code"
                          name="password_reset_otp_code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          tabIndex={showOtpInputs ? 0 : -1}
                          placeholder="请输入 6 位邮箱验证码"
                          value={emailPwdForm.code}
                          onChange={(e) => {
                            setEmailPwdForm((prev) => ({ ...prev, code: e.target.value }));
                            setEmailPwdErrors((prev) => ({ ...prev, code: "" }));
                          }}
                          className={cn(
                            "h-11 rounded-xl border-[#eadfd3] bg-white/90 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                            emailPwdErrors.code && "border-red-500 focus-visible:ring-red-500/20"
                          )}
                        />
                        <Button
                          type="button"
                          onClick={handleSendEmailPwdCode}
                          disabled={emailPwdCountdown > 0 || sendingEmailPwdCode || !userEmail || (cfRequired && !cfVerified)}
                          tabIndex={showOtpInputs ? 0 : -1}
                          className={codeSendBtnClass}
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
                        <p className="mt-1.5 text-xs text-red-600">{emailPwdErrors.code}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. 新密码（单框输入，可点击小眼睛核对明文） */}
                <div className={styles.field}>
                  <Label htmlFor="sec-email-new-pwd" className="text-xs font-semibold text-slate-700">
                    新密码
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="sec-email-new-pwd"
                      name="new_reset_password"
                      type={showEmailPwd.new ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="请输入新密码（至少 8 位，建议 12 位以上含字母与数字）"
                      value={emailPwdForm.newPassword}
                      onChange={(e) => {
                        setEmailPwdForm((prev) => ({ ...prev, newPassword: e.target.value }));
                        setEmailPwdErrors((prev) => ({ ...prev, newPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-xl border-[#eadfd3] bg-white/90 pr-10 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                        emailPwdErrors.newPassword && "border-red-500 focus-visible:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmailPwd((p) => ({ ...p, new: !p.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      aria-label={showEmailPwd.new ? "隐藏密码" : "显示密码"}
                    >
                      {showEmailPwd.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {emailPwdErrors.newPassword && (
                    <p className="mt-1.5 text-xs text-red-600">{emailPwdErrors.newPassword}</p>
                  )}
                </div>

                {/* Real-time Password Strength Indicator */}
                <PasswordStrengthMeter checks={activePasswordChecks} />

                {emailPwdErrors.form && (
                  <div className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700">
                    {emailPwdErrors.form}
                  </div>
                )}
                </div>

                <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#efe3d5]/80 pt-3.5">
                  <Button
                    type="submit"
                    disabled={savingEmailPwd}
                    className={cn("h-11 w-full rounded-xl px-7 text-sm font-semibold sm:w-auto", primaryActionBtnClass)}
                  >
                    {savingEmailPwd ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在提交修改...
                      </>
                    ) : (
                      "确认修改"
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("old-password")}
                    className="text-xs font-medium text-[#b5672d] hover:underline"
                  >
                    记得原密码？改用原密码直接修改 →
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: 原密码改密码 (Ref 图4) */}
          {activeTab === "old-password" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 flex shrink-0 items-start justify-between gap-4 border-b border-[#efe3d5] pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">原密码改密码</h2>
                    <span className={styles.pill}>即时验证</span>
                  </div>
                </div>
                <span className={`${glass.icon} h-10 w-10`}>
                  <KeyRound className="h-5 w-5" strokeWidth={1.7} />
                </span>
              </div>

              <form onSubmit={handleSubmitOldPwd} autoComplete="off" className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <input
                  type="text"
                  name="username"
                  value={userEmail}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  autoComplete="username"
                  className="sr-only"
                />

                {/* 1. 原密码 */}
                <div className={styles.field}>
                  <Label htmlFor="sec-old-pwd" className="text-xs font-semibold text-slate-700">
                    原密码
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="sec-old-pwd"
                      name="current_account_password"
                      type={showOldPwd.old ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="请输入当前密码"
                      value={oldPwdForm.oldPassword}
                      onChange={(e) => {
                        setOldPwdForm((prev) => ({ ...prev, oldPassword: e.target.value }));
                        setOldPwdErrors((prev) => ({ ...prev, oldPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-xl border-[#eadfd3] bg-white/90 pr-10 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                        oldPwdErrors.oldPassword && "border-red-500 focus-visible:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd((p) => ({ ...p, old: !p.old }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      aria-label={showOldPwd.old ? "隐藏密码" : "显示密码"}
                    >
                      {showOldPwd.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {oldPwdErrors.oldPassword && (
                    <p className="mt-1.5 text-xs text-red-600">{oldPwdErrors.oldPassword}</p>
                  )}
                </div>

                {/* 2. 新密码 */}
                <div className={styles.field}>
                  <Label htmlFor="sec-old-new-pwd" className="text-xs font-semibold text-slate-700">
                    新密码
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="sec-old-new-pwd"
                      name="new_account_password"
                      type={showOldPwd.new ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="请输入新密码（至少 8 位，建议 12 位以上含字母与数字）"
                      value={oldPwdForm.newPassword}
                      onChange={(e) => {
                        setOldPwdForm((prev) => ({ ...prev, newPassword: e.target.value }));
                        setOldPwdErrors((prev) => ({ ...prev, newPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-xl border-[#eadfd3] bg-white/90 pr-10 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                        oldPwdErrors.newPassword && "border-red-500 focus-visible:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd((p) => ({ ...p, new: !p.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      aria-label={showOldPwd.new ? "隐藏密码" : "显示密码"}
                    >
                      {showOldPwd.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {oldPwdErrors.newPassword && (
                    <p className="mt-1.5 text-xs text-red-600">{oldPwdErrors.newPassword}</p>
                  )}
                </div>

                {/* 3. 确认新密码 */}
                <div className={styles.field}>
                  <Label htmlFor="sec-old-confirm-pwd" className="text-xs font-semibold text-slate-700">
                    确认新密码
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="sec-old-confirm-pwd"
                      name="confirm_account_password"
                      type={showOldPwd.confirm ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="请再次输入新密码"
                      value={oldPwdForm.confirmPassword}
                      onChange={(e) => {
                        setOldPwdForm((prev) => ({ ...prev, confirmPassword: e.target.value }));
                        setOldPwdErrors((prev) => ({ ...prev, confirmPassword: "" }));
                      }}
                      className={cn(
                        "h-11 rounded-xl border-[#eadfd3] bg-white/90 pr-10 focus-visible:border-[#d87a34] focus-visible:ring-[#d87a34]/20",
                        oldPwdErrors.confirmPassword && "border-red-500 focus-visible:ring-red-500/20"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd((p) => ({ ...p, confirm: !p.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      aria-label={showOldPwd.confirm ? "隐藏密码" : "显示密码"}
                    >
                      {showOldPwd.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {oldPwdErrors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-600">{oldPwdErrors.confirmPassword}</p>
                  )}
                </div>

                {/* Real-time Password Strength Indicator */}
                <PasswordStrengthMeter checks={activePasswordChecks} />

                {oldPwdErrors.form && (
                  <div className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700">
                    {oldPwdErrors.form}
                  </div>
                )}
                </div>

                <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#efe3d5]/80 pt-3.5">
                  <Button
                    type="submit"
                    disabled={savingOldPwd}
                    className={cn("h-11 w-full rounded-xl px-7 text-sm font-semibold sm:w-auto", primaryActionBtnClass)}
                  >
                    {savingOldPwd ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在提交修改...
                      </>
                    ) : (
                      "确认修改"
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("email-password")}
                    className="text-xs font-medium text-[#b5672d] hover:underline"
                  >
                    忘记原密码？使用邮箱验证码重置 →
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Contextual Step-by-Step Guide & Security Protection Checklist */}
        <div className="flex min-h-0 min-w-0 flex-col gap-4 md:h-full">
          {/* Card B: Security Best Practices & Quick Navigation */}
          <section className={`${glass.surface} ${styles.panel} flex min-h-0 flex-1 flex-col p-5 sm:p-6 md:h-full md:overflow-hidden`}>
            <div className="mb-4 flex shrink-0 items-center justify-between border-b border-[#efe3d5]/70 pb-3.5">
              <div className="flex items-center gap-3">
                <span className={`${glass.icon} flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100/70 text-[#d86e31] shadow-sm`}>
                  <ShieldAlert className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 sm:text-base">安全守则与防护建议</h3>
                  <p className="mt-0.5 text-xs text-slate-500">保障数字商品卡密与账户余额资产安全</p>
                </div>
              </div>
              <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60 sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                系统级防护
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="flex items-start gap-3 rounded-xl border border-[#f3e5d8] bg-[#fffbf6] p-3 transition-colors hover:border-[#e8d2be] hover:bg-white sm:p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100/70 text-[#c26227]">
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">官方唯一授权域名</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    请认准 <code className="rounded bg-[#ffe8cc] px-1.5 py-0.5 font-mono font-semibold text-[#a84d16]">www.jianlian.shop</code>，切勿在任何第三方钓鱼页面输入登录凭据或验证码。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#f3e5d8] bg-[#fffbf6] p-3 transition-colors hover:border-[#e8d2be] hover:bg-white sm:p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100/70 text-[#c26227]">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">双向验证码时效机制</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    邮件验证码有效期为 10 分钟且单次失效。简联官方客服绝不会以任何名义索取验证码或要求提供登录密码。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-[#f3e5d8] bg-[#fffbf6] p-3 transition-colors hover:border-[#e8d2be] hover:bg-white sm:p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100/70 text-[#c26227]">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 sm:text-sm">高强度独立口令策略</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    账户包含您的钱包余额与提取卡密，建议组合大小写字母与数字设置独立密码，切勿复用公共弱口令。
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-t border-[#efe3d5] pt-3.5">
              <Link
                href="/account/privacy"
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50/80 px-3 py-1.5 text-xs font-semibold text-[#b85d23] ring-1 ring-inset ring-orange-200/60 transition hover:bg-orange-100"
              >
                <FileLock2 className="h-3.5 w-3.5" />
                <span>隐私设置与数据管理 →</span>
              </Link>
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
                <span>返回账号资料</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PasswordStrengthMeter({
  checks,
}: {
  checks: ReturnType<typeof evaluatePasswordChecks>;
}) {
  const items = [
    { label: "长度至少 8 位", ok: checks.hasMinLength },
    { label: "包含英文字母", ok: checks.hasLetter },
    { label: "包含数字 (0-9)", ok: checks.hasNumber },
    { label: "12 位以上或含特殊符号（推荐）", ok: checks.hasRecommendedLength || checks.hasSpecial },
  ];

  return (
    <div className="rounded-xl border border-[#efe2d3] bg-[#fffaf3]/85 p-3.5">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-[#785335]">密码安全强度校验</span>
        <span className="font-medium text-[#b5672d]">
          {checks.score <= 1 ? "待输入 / 较弱" : checks.score === 2 ? "基础" : checks.score === 3 ? "良好" : "极佳"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn(
              "h-1.5 rounded-full transition-colors",
              checks.score >= level
                ? checks.score >= 3
                  ? "bg-gradient-to-r from-[#e39b56] to-[#d66b2c]"
                  : "bg-amber-400"
                : "bg-[#ede2d5]"
            )}
          />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px]">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-1.5",
              item.ok ? "font-medium text-emerald-700" : "text-slate-400"
            )}
          >
            <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", item.ok ? "text-emerald-600" : "text-slate-300")} />
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Preserved initial email binding helper for accounts created without an email address
function EmailBinding() {
  const [account, setAccount] = useState<{ id: string; email?: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (active && user) setAccount({ id: user.id, email: user.email });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function sendCode(address: string, resend = false) {
    if (busy || !account || account.email) return;
    if (!isEmailFormatValid(address)) {
      setError("请输入有效邮箱地址。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || user?.id !== account.id || user.email) {
        setError("账户状态已变化，请刷新页面后重试。");
        return;
      }
      const { error: sendError } = resend
        ? await supabase.auth.resend({ type: "email_change", email: address })
        : await supabase.auth.updateUser({ email: address });
      if (sendError) {
        setError(getSafeAuthErrorMessage(sendError, "验证码发送失败，请稍后重试。"));
        return;
      }
      setPendingEmail(address);
      if (resend) setMessage("验证码已重新发送，请使用最新一封邮件。");
    } catch {
      setError("验证码发送失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(code: string) {
    if (busy || !account || account.email || !pendingEmail) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: current, error: currentError } = await supabase.auth.getUser();
      if (currentError || current.user?.id !== account.id || current.user.email) {
        setError("账户状态已变化，请刷新页面后重试。");
        return;
      }
      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code,
        type: "email_change",
      });
      if (verifyError) {
        setError(getSafeAuthErrorMessage(verifyError, "验证码无效或已过期，请重新获取。"));
        return;
      }
      if (verified.session && verified.user?.id !== account.id) {
        await supabase.auth.signOut({ scope: "local" });
        setError("无法确认验证码所属账号，请重新登录。");
        return;
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || user?.id !== account.id || user.email?.toLowerCase() !== pendingEmail || !user.email_confirmed_at) {
        setError("暂时无法确认邮箱绑定，请刷新后查看绑定状态。");
        return;
      }
      setAccount({ id: user.id, email: user.email });
      setPendingEmail("");
      setMessage("邮箱已绑定。");
    } catch {
      setError("暂时无法验证邮箱，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (!account || account.email) return null;

  return (
    <section className={`${glass.inset} rounded-2xl p-4`} aria-label="邮箱绑定">
      <h2 className="text-sm font-semibold text-slate-900">首次邮箱绑定</h2>
      {pendingEmail ? (
        <EmailVerificationForm
          email={pendingEmail}
          busy={busy}
          onVerify={verifyCode}
          onResend={() => sendCode(pendingEmail, true)}
          onBack={() => {
            setPendingEmail("");
            setError("");
            setMessage("");
          }}
        />
      ) : (
        <form
          className="mt-2 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode(email.trim().toLowerCase());
          }}
        >
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="binding-email" className="text-xs">
              要绑定的邮箱
            </Label>
            <Input
              id="binding-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 h-10"
            />
          </div>
          <Button type="submit" disabled={busy}>
            发送验证码
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs text-emerald-700">
          {message}
        </p>
      )}
    </section>
  );
}
