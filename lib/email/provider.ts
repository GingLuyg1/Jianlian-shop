import "server-only";

import type { EmailProviderName, EmailProviderStatus, SendEmailInput, SendEmailResult } from "./types";

function normalizeProvider(value: string | undefined): EmailProviderName {
  const provider = (value ?? "none").trim().toLowerCase();
  if (provider === "resend" || provider === "postmark" || provider === "smtp" || provider === "custom") return provider;
  return "none";
}

export function getEmailProviderStatus(): EmailProviderStatus {
  const provider = normalizeProvider(process.env.EMAIL_PROVIDER ?? process.env.MAIL_PROVIDER);
  const from = process.env.EMAIL_FROM ?? process.env.MAIL_FROM ?? null;
  const missing: string[] = [];

  if (provider === "none") missing.push("EMAIL_PROVIDER");
  if (!from) missing.push("EMAIL_FROM");

  if (provider === "resend" && !process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (provider === "postmark" && !process.env.POSTMARK_SERVER_TOKEN) missing.push("POSTMARK_SERVER_TOKEN");
  if (provider === "smtp") {
    for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]) {
      if (!process.env[key]) missing.push(key);
    }
  }
  if (provider === "custom" && !process.env.EMAIL_CUSTOM_ENDPOINT) missing.push("EMAIL_CUSTOM_ENDPOINT");

  const configured = missing.length === 0;
  return {
    provider,
    configured,
    from,
    missing,
    message: configured ? "邮件 Provider 已配置，但当前项目尚未启用真实发送适配。" : "邮件 Provider 尚未完整配置。",
  };
}

export async function verifyEmailConfiguration() {
  return getEmailProviderStatus();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const status = getEmailProviderStatus();

  if (!status.configured) {
    return {
      provider: status.provider,
      providerMessageId: null,
      status: "not_configured",
      acceptedAt: null,
      errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED",
      errorMessage: `邮件 Provider 未配置：${status.missing.join(", ")}`,
    };
  }

  // Provider adapters are intentionally not implemented until credentials, domain verification,
  // bounce handling, and rate limits are confirmed. Never mark an email as sent here.
  void input;
  return {
    provider: status.provider,
    providerMessageId: null,
    status: "failed",
    acceptedAt: null,
    errorCode: "EMAIL_PROVIDER_NOT_IMPLEMENTED",
    errorMessage: "真实邮件发送适配尚未启用，请先完成 Provider 接入和域名验证。",
  };
}
