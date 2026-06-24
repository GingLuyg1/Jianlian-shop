"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [formError, setFormError] = useState("");
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
    setFormError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        setFormError("登录状态已失效，请重新登录。");
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
        setFormError("密码修改失败，请稍后重试。");
        setSaving(false);
        return;
      }

      toast.success("密码已修改，请重新登录。");
      await supabase.auth.signOut({ scope: "global" });
      router.replace("/login?redirect=/account/security");
      router.refresh();
    } catch {
      setFormError("密码修改失败，请稍后重试。");
      setSaving(false);
    }
  }

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">账号安全</CardTitle>
        <p className="text-sm text-muted-foreground">修改密码前需要重新验证当前密码。</p>
      </CardHeader>
      <CardContent className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 max-w-xl flex-col gap-5 overflow-hidden">
          {formError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

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

          <div className="mt-auto pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "修改中..." : "修改密码"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
    <div>
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
