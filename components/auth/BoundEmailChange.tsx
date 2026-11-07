"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import glass from "@/components/account/AccountGlass.module.css";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isEmailFormatValid } from "@/lib/auth/password-policy";
import { beginSecureEmailChange, verifySecureEmailChange, readEmailChangeAccount, emailChangeErrorMessage,
  EMAIL_CHANGE_COOLDOWN_MS, type EmailChangeIdentity, type EmailChangeSide } from "@/lib/auth/secure-email-change";

const enabled = process.env.NEXT_PUBLIC_SECURE_EMAIL_CHANGE_ENABLED === "true";

export default function BoundEmailChange({ account, onUpdated }: { account: EmailChangeIdentity; onUpdated: (email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState("");
  const [codes, setCodes] = useState({ current: "", new: "" });
  const [confirmed, setConfirmed] = useState({ current: false, new: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [identityChanged, setIdentityChanged] = useState(false);
  const [nextSend, setNextSend] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const switchedIdentity = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const currentCodeInput = useRef<HTMLInputElement>(null);
  const nextCodeInput = useRef<HTMLInputElement>(null);
  const storageKey = `jianlian:email-change-cooldown:v1:${account.id}`;
  const remaining = Math.max(0, Math.ceil((nextSend - now) / 1000));

  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(storageKey));
      if (Number.isSafeInteger(saved) && saved > Date.now() && saved <= Date.now() + EMAIL_CHANGE_COOLDOWN_MS) setNextSend(saved);
    } catch { /* Server email throttling is authoritative. */ }
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== account.id) {
        switchedIdentity.current = true;
        setIdentityChanged(true); setCodes({ current: "", new: "" });
        setError("登录身份已变化，请重新登录后操作。");
      }
    });
    return () => subscription.unsubscribe();
  }, [account.id, storageKey]);

  useEffect(() => {
    if (nextSend <= Date.now()) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [nextSend]);

  useEffect(() => { if (open && !pending) emailInput.current?.focus(); }, [open, pending]);
  useEffect(() => {
    if (!open || !pending) return;
    if (!confirmed.current) currentCodeInput.current?.focus();
    else if (!confirmed.new) nextCodeInput.current?.focus();
  }, [open, pending, confirmed]);

  async function toggle() {
    if (inFlight.current || identityChanged) return;
    if (open) { setOpen(false); setCodes({ current: "", new: "" }); return; }
    setOpen(true); setError("");
    try {
      const user = await readEmailChangeAccount(getSupabaseBrowserClient(), account);
      if (user.new_email) { setPending(user.new_email.toLowerCase()); setNewEmail(user.new_email.toLowerCase()); }
    } catch (cause) { setError(emailChangeErrorMessage(cause)); }
  }

  async function send(event?: FormEvent, resend = false) {
    event?.preventDefault();
    if (!enabled || identityChanged || inFlight.current || Date.now() < nextSend) return;
    const address = (resend ? pending : newEmail).trim().toLowerCase();
    if (!isEmailFormatValid(address)) { setError("请输入正确的新邮箱地址。"); return; }
    if (address === account.email.toLowerCase()) { setError("新邮箱不能与当前邮箱相同。"); return; }
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    const until = Date.now() + EMAIL_CHANGE_COOLDOWN_MS;
    setNextSend(until); setNow(Date.now());
    try { sessionStorage.setItem(storageKey, String(until)); } catch { /* Never store addresses, codes or tokens. */ }
    setCodes({ current: "", new: "" }); setConfirmed({ current: false, new: false });
    try {
      const client = getSupabaseBrowserClient();
      if (resend) {
        const before = await readEmailChangeAccount(client, account);
        if (before.new_email?.toLowerCase() !== address) throw new Error("PENDING_CHANGED");
        const { error: resendError } = await client.auth.resend({ type: "email_change", email: address });
        if (resendError) throw resendError;
        const user = await readEmailChangeAccount(client, account);
        if (user.new_email?.toLowerCase() !== address) throw new Error("PENDING_CHANGED");
      } else { await beginSecureEmailChange(client, account, address, enabled); }
      setPending(address); setMessage("新旧邮箱的验证码已发送，请分别完成确认。");
    } catch (cause) { setError(emailChangeErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function verify(event: FormEvent, side: EmailChangeSide) {
    event.preventDefault();
    if (!enabled || identityChanged || inFlight.current || !pending || !/^\d{6}$/.test(codes[side])) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    const code = codes[side]; setCodes(current => ({ ...current, [side]: "" }));
    try {
      const result = await verifySecureEmailChange(getSupabaseBrowserClient(), account, pending, side, code);
      if (switchedIdentity.current) throw new Error("IDENTITY_CHANGED");
      if (result.complete) {
        onUpdated(result.user.email!); setPending(""); setNewEmail(""); setCodes({ current: "", new: "" }); setOpen(false);
        setMessage("新旧邮箱均已确认，绑定邮箱已更换。");
      } else {
        setConfirmed(current => ({ ...current, [side]: true }));
        setMessage("此邮箱已确认，请继续验证另一邮箱；当前绑定尚未更换。");
      }
    } catch (cause) { setError(emailChangeErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="min-w-0 space-y-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-xs text-slate-500">当前绑定邮箱</p><p className="mt-1 break-all font-medium text-slate-800">{account.email}</p></div>
      <Button type="button" variant="outline" className={`${glass.button} shrink-0 rounded-xl`} disabled={!enabled || busy || identityChanged} aria-expanded={open} aria-controls="secure-email-change" onClick={() => void toggle()}>
        {open ? "收起" : "更换邮箱"}<ChevronDown aria-hidden="true" className={`ml-2 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
    </div>
    {!enabled && <p className="text-xs text-slate-500">更换邮箱暂未启用，当前邮箱和登录方式保持不变。</p>}
    {open && <div id="secure-email-change" className="min-w-0 space-y-4 border-t border-orange-100 pt-4" aria-busy={busy}>
      <p className="text-xs leading-6 text-slate-500">须确认新旧两个邮箱。验证码仅用于更换邮箱，不用于免密码登录。收起不会撤销已发送的验证请求。</p>
      {!pending ? <form onSubmit={event => void send(event)} className="space-y-3">
        <Label htmlFor="change-new-email">新邮箱地址</Label>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row"><Input ref={emailInput} id="change-new-email" type="email" autoComplete="email" maxLength={254} value={newEmail} disabled={busy || identityChanged} onChange={event => setNewEmail(event.target.value)} required className="min-w-0 flex-1 rounded-xl" />
          <Button type="submit" className="shrink-0 rounded-xl" disabled={busy || identityChanged || remaining > 0}>{remaining ? `${remaining} 秒后可发送` : "发送验证邮件"}</Button></div>
      </form> : <>
        <ol aria-label="邮箱更换验证进度" className="grid min-w-0 gap-3 lg:grid-cols-2">
          {(["current", "new"] as const).map(side => <li key={side} className={`${glass.inset} min-w-0 rounded-2xl p-4`}>
            <form onSubmit={event => void verify(event, side)} className="min-w-0 space-y-3">
              <h3 className="flex items-center gap-2 font-medium text-slate-800">{confirmed[side] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Mail className="h-4 w-4 text-primary" aria-hidden="true" />}{side === "current" ? "1. 验证原邮箱" : "2. 验证新邮箱"}</h3>
              <p className="break-all text-xs text-slate-500">{side === "current" ? account.email : pending}</p>
              <Label htmlFor={`change-code-${side}`}>六位{side === "current" ? "原" : "新"}邮箱验证码</Label>
              <Input ref={side === "current" ? currentCodeInput : nextCodeInput} id={`change-code-${side}`} value={codes[side]} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" disabled={busy || identityChanged || confirmed[side]} onChange={event => setCodes(current => ({ ...current, [side]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} className="min-w-0 rounded-xl tracking-widest" required />
              <Button type="submit" variant="outline" className="w-full rounded-xl" disabled={busy || identityChanged || confirmed[side] || codes[side].length !== 6}>{confirmed[side] ? "已确认" : side === "current" ? "确认原邮箱" : "确认新邮箱"}</Button>
            </form>
          </li>)}
        </ol>
        <Button type="button" variant="ghost" disabled={busy || identityChanged || remaining > 0} onClick={() => void send(undefined, true)}>{remaining ? `${remaining} 秒后可重发` : "重新发送新旧邮箱验证码"}</Button>
        <p className="text-xs leading-6 text-slate-500">刷新后已确认的一方无需重复提交，继续验证另一邮箱即可。重新发送后请使用最新邮件。</p>
      </>}
    </div>}
    {error && <p role="alert" className="break-words text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="break-words text-sm text-emerald-700">{message}</p>}
  </div>;
}
