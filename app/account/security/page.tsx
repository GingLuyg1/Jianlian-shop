"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck, Mail, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import security from "@/components/account/AccountSecurity.module.css";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EmailVerificationForm from "@/components/auth/EmailVerificationForm";
import BoundEmailChange from "@/components/auth/BoundEmailChange";
import { getSafeAuthErrorMessage, isEmailFormatValid } from "@/lib/auth/password-policy";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SecurityForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type FieldErrors = Partial<Record<keyof SecurityForm, string>>;

function validatePassword(value: string) {
  if (value.length < 8) return "新密码至少 8 位。";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "建议新密码同时包含字母和数字。";
  }
  return "";
}

export default function AccountSecurityPage() {
  const router = useRouter();
  const [form, setForm] = useState<SecurityForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState<Record<keyof SecurityForm, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  function updateField(field: keyof SecurityForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const nextErrors: FieldErrors = {};
    if (!form.currentPassword) nextErrors.currentPassword = "请输入当前密码。";
    const passwordError = validatePassword(form.newPassword);
    if (passwordError) nextErrors.newPassword = passwordError;
    if (form.newPassword === form.currentPassword) nextErrors.newPassword = "新密码不能与当前密码相同。";
    if (form.confirmPassword !== form.newPassword) nextErrors.confirmPassword = "两次新密码必须一致。";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !validate()) return;

    setSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        toast.error("登录状态已失效，请重新登录。");
        setSaving(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: form.currentPassword,
      });

      if (verifyError) {
        setErrors({ currentPassword: "当前密码不正确。" });
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: form.newPassword,
      });

      if (updateError) {
        toast.error("密码修改失败，请稍后重试。");
        setSaving(false);
        return;
      }

      toast.success("密码已修改，请重新登录。");
      await supabase.auth.signOut({ scope: "global" });
      router.replace("/login?redirect=/account/security");
      router.refresh();
    } catch {
      toast.error("密码修改失败，请稍后重试。");
      setSaving(false);
    }
  }

  return (
    <Card data-account-page="/account/security" data-account-ready={true} aria-busy={false} className={`${glass.surface} ${styles.panel} ${styles.page} ${security.page} flex h-full min-h-0 min-w-0 flex-col overflow-hidden`}>
      <CardHeader className={`${glass.hero} ${styles.pageHeader}`}>
        <div className="flex items-center gap-3"><span className={`${glass.icon} h-12 w-12`}><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span><div><CardTitle className="text-xl">账号安全</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">管理邮箱验证与登录密码，保护你的账户。</p></div></div>
      </CardHeader>
      <CardContent className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className={security.settingsGrid}>
        <EmailBinding />
        <form onSubmit={handleSubmit} className={`${styles.formGroup} flex w-full min-w-0 flex-col gap-5`}>
          <div className={security.sectionHeading}><span className={`${glass.icon} h-10 w-10`}><KeyRound className="h-4 w-4" aria-hidden="true" /></span><div><h2 className="font-semibold">登录密码</h2>
          <p className={security.sectionHint}>修改密码前需要重新验证当前密码。</p></div></div>

          <PasswordField
            id="currentPassword"
            label="当前密码"
            value={form.currentPassword}
            visible={visible.currentPassword}
            error={errors.currentPassword}
            autoComplete="current-password"
            onToggle={() => setVisible((current) => ({ ...current, currentPassword: !current.currentPassword }))}
            onChange={(value) => updateField("currentPassword", value)}
          />
          <PasswordField
            id="newPassword"
            label="新密码"
            value={form.newPassword}
            visible={visible.newPassword}
            error={errors.newPassword}
            autoComplete="new-password"
            onToggle={() => setVisible((current) => ({ ...current, newPassword: !current.newPassword }))}
            onChange={(value) => updateField("newPassword", value)}
          />
          <PasswordField
            id="confirmPassword"
            label="确认新密码"
            value={form.confirmPassword}
            visible={visible.confirmPassword}
            error={errors.confirmPassword}
            autoComplete="new-password"
            onToggle={() => setVisible((current) => ({ ...current, confirmPassword: !current.confirmPassword }))}
            onChange={(value) => updateField("confirmPassword", value)}
          />

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "修改中..." : "修改密码"}
            </Button>
          </div>
        </form>
        </div>
      </CardContent>
    </Card>
  );
}

function EmailBinding() {
  const [account, setAccount] = useState<{ id: string; email?: string } | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadAccount() {
      try {
        const { data, error: userError } = await getSupabaseBrowserClient().auth.getUser();
        if (userError || !data.user) throw new Error("ACCOUNT_UNAVAILABLE");
        if (active) setAccount({ id: data.user.id, email: data.user.email });
      } catch {
        if (active) setError("暂时无法读取邮箱绑定状态。");
      }
    }
    void loadAccount();
    return () => { active = false; };
  }, []);

  async function sendCode(address: string, resend = false) {
    if (busy || !account || account.email) return;
    if (!isEmailFormatValid(address)) {
      setError("请输入正确的邮箱地址。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
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
      const { data: { user }, error: userError } = await supabase.auth.getUser();
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

  return (
    <section className={`${styles.formGroup} w-full min-w-0 space-y-5`} aria-label="邮箱绑定">
      <div className={security.sectionHeading}><span className={`${glass.icon} h-10 w-10`}><Mail className="h-4 w-4" aria-hidden="true" /></span><div><h2 className="font-semibold">邮箱安全</h2><p className={security.sectionHint}>查看绑定邮箱或完成安全验证。</p></div></div>
      {!account && !error && <div role="status" aria-label="读取邮箱绑定状态" className="space-y-2 motion-safe:animate-pulse"><span className="block h-3 w-24 rounded bg-orange-100/70" /><span className="block h-4 w-48 max-w-full rounded bg-orange-100/50" /></div>}
      {account?.email ? (
        <BoundEmailChange account={{ id: account.id, email: account.email }} onUpdated={email => setAccount({ id: account.id, email })} />
      ) : pendingEmail ? (
        <EmailVerificationForm
          email={pendingEmail}
          busy={busy}
          onVerify={verifyCode}
          onResend={() => sendCode(pendingEmail, true)}
          onBack={() => { setPendingEmail(""); setError(""); setMessage(""); }}
        />
      ) : account ? (
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          void sendCode(email.trim().toLowerCase());
        }}>
          <Label htmlFor="binding-email">要绑定的邮箱</Label>
          <Input
            id="binding-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>发送验证码</Button>
        </form>
      ) : null}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    </section>
  );
}

function PasswordField({
  autoComplete,
  error,
  id,
  label,
  onChange,
  onToggle,
  value,
  visible,
}: {
  autoComplete: string;
  error?: string;
  id: keyof SecurityForm;
  label: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  value: string;
  visible: boolean;
}) {
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="pr-11"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          aria-label={visible ? "隐藏密码" : "显示密码"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
