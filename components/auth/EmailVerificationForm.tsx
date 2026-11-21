"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  email: string;
  busy: boolean;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
};

export default function EmailVerificationForm({ email, busy, onVerify, onResend, onBack }: Props) {
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && /^\d{6}$/.test(code)) void onVerify(code);
      }}
    >
      <p className="text-sm text-muted-foreground">验证码已发送至 {email}。</p>
      <Label htmlFor="email-verification-code">六位邮箱验证码</Label>
      <Input
        id="email-verification-code"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
      />
      <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
        验证并继续
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" disabled={busy || resendCooldown > 0} onClick={() => { setCode(""); setResendCooldown(60); void onResend(); }}>
          {resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : "重新发送"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
          更换邮箱
        </Button>
      </div>
    </form>
  );
}
