import "server-only";

import type { EmailProviderName, EmailProviderStatus, SendEmailInput, SendEmailResult } from "./types";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;

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
  const message = !configured
    ? "\u90ae\u4ef6 Provider \u5c1a\u672a\u5b8c\u6574\u914d\u7f6e\u3002"
    : provider === "resend"
      ? "Resend \u90ae\u4ef6 Provider \u5df2\u914d\u7f6e\uff0c\u53ef\u7528\u4e8e\u771f\u5b9e\u53d1\u9001\u3002"
      : "\u90ae\u4ef6 Provider \u5df2\u914d\u7f6e\uff0c\u4f46\u5f53\u524d\u9879\u76ee\u5c1a\u672a\u542f\u7528\u8be5 Provider \u7684\u771f\u5b9e\u53d1\u9001\u9002\u914d\u3002";

  return {
    provider,
    configured,
    from,
    missing,
    message,
  };
}

export async function verifyEmailConfiguration() {
  return getEmailProviderStatus();
}

function failedResult(
  provider: EmailProviderName,
  errorCode: string,
  errorMessage: string,
): SendEmailResult {
  return {
    provider,
    providerMessageId: null,
    status: "failed",
    acceptedAt: null,
    errorCode,
    errorMessage,
  };
}

function resendHttpFailure(status: number): SendEmailResult {
  if (status === 408 || status === 504) {
    return failedResult("resend", "EMAIL_PROVIDER_TIMEOUT", "Resend \u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
  }
  if (status === 429) {
    return failedResult("resend", "EMAIL_PROVIDER_RATE_LIMIT", "Resend \u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
  }
  if (status >= 500) {
    return failedResult("resend", "EMAIL_PROVIDER_UNAVAILABLE", "Resend \u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
  }
  if (status === 401 || status === 403) {
    return failedResult("resend", "EMAIL_PROVIDER_AUTH_FAILED", "Resend \u8eab\u4efd\u9a8c\u8bc1\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u670d\u52a1\u7aef\u90ae\u4ef6\u914d\u7f6e\u3002");
  }
  return failedResult("resend", "EMAIL_PROVIDER_REJECTED", "Resend \u62d2\u7edd\u4e86\u90ae\u4ef6\u53d1\u9001\u8bf7\u6c42\uff0c\u8bf7\u68c0\u67e5\u53d1\u4ef6\u4eba\u4e0e\u90ae\u4ef6\u5185\u5bb9\u914d\u7f6e\u3002");
}

async function sendWithResend(input: SendEmailInput, from: string, apiKey: string): Promise<SendEmailResult> {
  try {
    const payload: Record<string, unknown> = {
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
    if (input.replyTo?.trim()) payload.reply_to = input.replyTo.trim();

    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!response.ok) return resendHttpFailure(response.status);

    const body = await response.json().catch(() => null) as { id?: unknown } | null;
    const providerMessageId = typeof body?.id === "string" && body.id.trim() ? body.id.trim() : null;
    if (!providerMessageId) {
      return failedResult("resend", "EMAIL_PROVIDER_TEMPORARY_INVALID_RESPONSE", "Resend \u8fd4\u56de\u4e86\u65e0\u6548\u54cd\u5e94\uff0c\u90ae\u4ef6\u53d1\u9001\u72b6\u6001\u65e0\u6cd5\u786e\u8ba4\u3002");
    }

    return {
      provider: "resend",
      providerMessageId,
      status: "sent",
      acceptedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return failedResult("resend", "EMAIL_PROVIDER_TIMEOUT", "Resend \u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
    }
    return failedResult("resend", "EMAIL_PROVIDER_NETWORK", "\u65e0\u6cd5\u8fde\u63a5 Resend\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
  }
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
      errorMessage: `\u90ae\u4ef6 Provider \u672a\u914d\u7f6e\uff1a${status.missing.join(", ")}`,
    };
  }

  if (status.provider === "resend") {
    return sendWithResend(input, status.from!, process.env.RESEND_API_KEY!);
  }

  return {
    provider: status.provider,
    providerMessageId: null,
    status: "failed",
    acceptedAt: null,
    errorCode: "EMAIL_PROVIDER_NOT_IMPLEMENTED",
    errorMessage: "\u5f53\u524d\u90ae\u4ef6 Provider \u7684\u771f\u5b9e\u53d1\u9001\u9002\u914d\u5c1a\u672a\u542f\u7528\u3002",
  };
}
