import type { SupabaseClient, User } from "@supabase/supabase-js";

export type EmailChangeIdentity = { id: string; email: string };
export type EmailChangeSide = "current" | "new";
export const EMAIL_CHANGE_COOLDOWN_MS = 60_000;

export class EmailChangeError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "EmailChangeError"; }
}

const normalize = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

export async function readEmailChangeAccount(client: SupabaseClient, expected: EmailChangeIdentity, pending?: string) {
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  if (error || !user || user.id !== expected.id) throw new EmailChangeError("IDENTITY_CHANGED");
  const email = normalize(user.email);
  if (!user.email_confirmed_at || (email !== normalize(expected.email) && (!pending || email !== normalize(pending)))) {
    throw new EmailChangeError("EMAIL_CHANGED");
  }
  const profile = await client.from("profiles").select("account_status,risk_status").eq("id", expected.id).maybeSingle();
  if (profile.error || !profile.data || profile.data.account_status !== "active" || profile.data.risk_status !== "normal") {
    throw new EmailChangeError("ACCOUNT_RESTRICTED");
  }
  return user;
}

export async function beginSecureEmailChange(client: SupabaseClient, expected: EmailChangeIdentity, address: string, enabled: boolean) {
  if (!enabled) throw new EmailChangeError("FEATURE_DISABLED");
  const email = normalize(address);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new EmailChangeError("INVALID_EMAIL");
  if (email === normalize(expected.email)) throw new EmailChangeError("SAME_EMAIL");
  await readEmailChangeAccount(client, expected);
  const { data, error } = await client.auth.updateUser({ email });
  if (error) throw error;
  if (data.user?.id !== expected.id) throw new EmailChangeError("IDENTITY_CHANGED");
  const user = await readEmailChangeAccount(client, expected, email);
  if (normalize(user.email) !== normalize(expected.email) || normalize(user.new_email) !== email) {
    throw new EmailChangeError("SECURE_CONFIRMATION_REQUIRED");
  }
  return user;
}

export async function verifySecureEmailChange(client: SupabaseClient, expected: EmailChangeIdentity, address: string, side: EmailChangeSide, code: string) {
  if (!/^\d{6}$/.test(code)) throw new EmailChangeError("INVALID_CODE");
  const email = normalize(address);
  const before = await readEmailChangeAccount(client, expected, email);
  if (normalize(before.email) !== normalize(expected.email) || normalize(before.new_email) !== email) {
    throw new EmailChangeError("PENDING_CHANGED");
  }
  const { data, error } = await client.auth.verifyOtp({
    email: side === "current" ? normalize(expected.email) : email,
    token: code,
    type: "email_change",
  });
  if (error) throw error;
  if ((data.user && data.user.id !== expected.id) || (data.session && data.session.user.id !== expected.id)) {
    await client.auth.signOut({ scope: "local" });
    throw new EmailChangeError("IDENTITY_CHANGED");
  }
  const user = await readEmailChangeAccount(client, expected, email);
  const complete = normalize(user.email) === email && !!user.email_confirmed_at && !user.new_email;
  if (!complete && (normalize(user.email) !== normalize(expected.email) || normalize(user.new_email) !== email)) {
    throw new EmailChangeError("PENDING_CHANGED");
  }
  return { complete, user } satisfies { complete: boolean; user: User };
}

export function emailChangeErrorMessage(error: unknown) {
  if (error instanceof EmailChangeError) {
    switch (error.code) {
      case "SAME_EMAIL": return "新邮箱不能与当前邮箱相同。";
      case "INVALID_EMAIL": return "请输入正确的新邮箱地址。";
      case "INVALID_CODE": return "请输入六位数字验证码。";
      case "FEATURE_DISABLED": return "更换邮箱暂未启用。";
      case "ACCOUNT_RESTRICTED": return "暂时无法确认账户状态，请稍后重试。";
      case "SECURE_CONFIRMATION_REQUIRED": return "安全验证配置未就绪，请联系客服。";
      default: return "账户或待验证邮箱已变化，请刷新页面后重试。";
    }
  }
  const code = (error as { code?: string })?.code;
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "发送过于频繁，请稍后再试。";
  if (code === "otp_expired") return "验证码无效或已过期，请使用最新邮件或重新发送。";
  if (code === "email_exists") return "该邮箱暂时无法使用，请选择其他邮箱。";
  return "邮箱验证暂时不可用，请稍后重试。";
}
