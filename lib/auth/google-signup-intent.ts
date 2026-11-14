import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const GOOGLE_SIGNUP_COOKIE = "jl-google-signup";
export const GOOGLE_SIGNUP_MAX_AGE = 600;
export const GOOGLE_INVITE_CODE = /^JL[A-Z0-9]{6,12}$/;
type Intent = { invite: string; startedAt: number; nonce: string };

function validSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}

export function signGoogleSignupIntent(invite: string, secret: string | undefined, now = Date.now()) {
  if (!validSecret(secret) || !GOOGLE_INVITE_CODE.test(invite)) throw new Error("GOOGLE_SIGNUP_INTENT_UNAVAILABLE");
  const payload = Buffer.from(JSON.stringify({ invite, startedAt: now, nonce: randomUUID() })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function readGoogleSignupIntent(value: string, secret: string | undefined, now = Date.now()): Intent | null {
  if (!validSecret(secret) || value.length > 512) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const intent = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!GOOGLE_INVITE_CODE.test(intent.invite) || typeof intent.invite !== "string"
      || !Number.isSafeInteger(intent.startedAt) || intent.startedAt > now
      || now - intent.startedAt > GOOGLE_SIGNUP_MAX_AGE * 1000
      || typeof intent.nonce !== "string" || !/^[a-f0-9-]{36}$/.test(intent.nonce)) return null;
    return intent;
  } catch { return null; }
}

/** Auth server's immutable creation time, not a client-supplied "new user" flag. */
export function isGoogleSignupAfterIntent(createdAt: string, intent: Intent, now = Date.now()) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created >= intent.startedAt && created <= now;
}
