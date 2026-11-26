import { NextResponse } from "next/server";

import { checkRateLimit, checkRequestSize, getRequestSourceKey } from "@/lib/security/rate-limit";
import {
  getTurnstileSiteKey,
  isTurnstileConfigured,
  verifyTurnstileToken,
} from "@/lib/security/turnstile";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET() {
  const turnstileSiteKey = getTurnstileSiteKey();
  return json({
    turnstileEnabled: isTurnstileConfigured(),
    turnstileSiteKey,
  });
}

export async function POST(request: Request) {
  const sizeError = checkRequestSize(request, 4 * 1024);
  if (sizeError) return sizeError;

  const rate = checkRateLimit("order_lookup", `auth_turnstile:${getRequestSourceKey(request)}`);
  if (!rate.allowed) return rate.response!;

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const result = await verifyTurnstileToken(token, getRequestSourceKey(request));

  if (!result.ok) {
    return json(
      { ok: false, error: result.message, code: result.code },
      result.code === "TURNSTILE_UPSTREAM_ERROR" || result.code === "TURNSTILE_TIMEOUT" ? 503 : 400
    );
  }

  return json({ ok: true, skipped: Boolean(result.skipped) });
}
