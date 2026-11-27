import { randomInt, timingSafeEqual } from "crypto";
import { sendEmail } from "@/lib/email/provider";

export type VerificationPurpose = "current_email_verify" | "new_email_verify" | "password_reset" | "order_lookup";

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

// In-memory verification code registry with bounded size and periodic TTL sweep
const codeStore = new Map<string, CodeEntry>();
const MAX_CODE_STORE_SIZE = 2000;
let lastCodeSweepAt = 0;

function sweepExpiredCodes(now: number) {
  if (now - lastCodeSweepAt < 60_000 && codeStore.size < MAX_CODE_STORE_SIZE) return;
  lastCodeSweepAt = now;
  codeStore.forEach((entry, k) => {
    if (now > entry.expiresAt) codeStore.delete(k);
  });
  while (codeStore.size >= MAX_CODE_STORE_SIZE) {
    const oldestKey = codeStore.keys().next().value;
    if (!oldestKey) break;
    codeStore.delete(oldestKey);
  }
}

function safeCodeEquals(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getStoreKey(email: string, purpose: VerificationPurpose): string {
  return `${purpose}:${email.trim().toLowerCase()}`;
}

const PURPOSE_LABELS: Record<VerificationPurpose, { title: string; desc: string }> = {
  current_email_verify: {
    title: "更换绑定邮箱 - 当前邮箱身份验证",
    desc: "您正在申请更换账号绑定邮箱，请使用下方验证码验证当前邮箱身份：",
  },
  new_email_verify: {
    title: "更换绑定邮箱 - 新邮箱绑定验证",
    desc: "您正在申请将本邮箱绑定至简联账号，请使用下方验证码完成绑定：",
  },
  order_lookup: {
    title: "订单查询邮箱验证",
    desc: "请使用下方验证码验证下单邮箱并查看订单：",
  },
  password_reset: {
    title: "重置登录密码验证",
    desc: "您正在申请通过邮箱验证码重置登录密码，请使用下方验证码完成操作：",
  },
};

export async function generateAndSendEmailCode(
  email: string,
  purpose: VerificationPurpose
): Promise<{ ok: boolean; message?: string; waitSeconds?: number }> {
  const normalizedEmail = email.trim().toLowerCase();
  const key = getStoreKey(normalizedEmail, purpose);
  const now = Date.now();
  sweepExpiredCodes(now);

  const existing = codeStore.get(key);
  if (existing && now - existing.sentAt < 60_000) {
    const remaining = Math.ceil((60_000 - (now - existing.sentAt)) / 1000);
    return { ok: false, message: `请等待 ${remaining} 秒后再重新获取验证码`, waitSeconds: remaining };
  }

  // Generate 6-digit numeric verification code
  const code = String(randomInt(100000, 999999));
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes valid

  codeStore.set(key, {
    code,
    expiresAt,
    attempts: 0,
    sentAt: now,
  });

  const { title, desc } = PURPOSE_LABELS[purpose] || {
    title: "安全验证码",
    desc: "您的简联安全验证码为：",
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px; }
          .logo { font-size: 22px; font-weight: 700; color: #2563eb; letter-spacing: -0.5px; }
          .title { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 8px; }
          .content { font-size: 14px; line-height: 1.6; color: #475569; }
          .code-box { background: #eff6ff; border: 1px dashed #3b82f6; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; }
          .code { font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1d4ed8; font-family: 'Courier New', Courier, monospace; }
          .notice { font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 16px; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">简联 Jianlian</div>
            <div class="title">${title}</div>
          </div>
          <div class="content">
            <p>您好：</p>
            <p>${desc}</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p class="notice">
              • 验证码有效期为 <strong>10 分钟</strong>，请尽快输入完成验证。<br>
              • 若非您本人操作，请忽略此邮件，切勿将验证码泄露给任何人。
            </p>
          </div>
          <div class="footer">
            此为系统自动发送邮件，请勿直接回复。<br>
            简联数字商品商城 · 安全防护中心
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `【简联安全中心】${title}：您的验证码为 ${code}，有效期 10 分钟。如非本人操作请忽略。`;

  try {
    const sendResult = await sendEmail({
      to: normalizedEmail,
      subject: `【简联】${code} 是您的${title.includes("改密码") ? "改密" : "安全"}验证码`,
      html,
      text,
      templateCode: purpose === "password_reset" ? "password_reset" : "email_verification",
      businessType: "auth",
      idempotencyKey: `code-${purpose}-${normalizedEmail}-${now}`,
    });

    if (sendResult.status !== "sent") {
      if (codeStore.get(key)?.code === code) codeStore.delete(key);
      console.error("[EmailCodeService] Failed to send email via provider");
      return { ok: false, message: `邮件发送失败：${sendResult.errorMessage || "请稍后重试"}` };
    }

    return { ok: true, message: "验证码已成功发送至邮箱，请查收" };
  } catch {
    if (codeStore.get(key)?.code === code) codeStore.delete(key);
    console.error("[EmailCodeService] Error sending email");
    return { ok: false, message: "发送邮件验证码异常，请稍后重试" };
  }
}

export function peekEmailCode(
  email: string,
  purpose: VerificationPurpose,
  code: string
): { valid: boolean; message?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const key = getStoreKey(normalizedEmail, purpose);
  const entry = codeStore.get(key);

  if (!entry) {
    return { valid: false, message: "验证码不存在或已过期，请重新获取" };
  }

  if (Date.now() > entry.expiresAt) {
    codeStore.delete(key);
    return { valid: false, message: "验证码已过期，请重新获取" };
  }

  if (entry.attempts >= 5) {
    codeStore.delete(key);
    return { valid: false, message: "验证码错误次数过多，请重新获取" };
  }

  if (!safeCodeEquals(entry.code, code.trim())) {
    entry.attempts += 1;
    return { valid: false, message: "验证码错误，请重新核对" };
  }

  return { valid: true };
}

export function consumeEmailCode(email: string, purpose: VerificationPurpose) {
  codeStore.delete(getStoreKey(email.trim().toLowerCase(), purpose));
}

export function verifyEmailCode(
  email: string,
  purpose: VerificationPurpose,
  code: string
): { valid: boolean; message?: string } {
  const result = peekEmailCode(email, purpose, code);
  if (!result.valid) return result;
  consumeEmailCode(email, purpose);
  return { valid: true };
}
