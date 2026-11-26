import "server-only";

export type TurnstileVerifyResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; message: string; code: string };

export function isTurnstileConfigured(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  );
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  // If Cloudflare Turnstile keys are not configured yet, fall back cleanly so
  // callers rely on server-side rate limiting until keys are provisioned.
  if (!secret || !siteKey) {
    return { ok: true, skipped: true };
  }

  const trimmed = String(token ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "TURNSTILE_REQUIRED",
      message: "请先完成 Cloudflare 人机验证后再查询",
    };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", trimmed);
    if (remoteIp && remoteIp !== "unknown") {
      body.set("remoteip", remoteIp);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      return {
        ok: false,
        code: "TURNSTILE_UPSTREAM_ERROR",
        message: "人机验证服务暂时不可用，请稍后重试",
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      "error-codes"?: string[];
    } | null;

    if (!payload?.success) {
      return {
        ok: false,
        code: "TURNSTILE_INVALID",
        message: "人机验证未通过或已过期，请刷新后重试",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      code: "TURNSTILE_TIMEOUT",
      message: "人机验证超时，请重试",
    };
  }
}
