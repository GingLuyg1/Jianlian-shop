// Progress only, never a login credential. Supabase must still verify the real code.
export const PENDING_SIGNUP_KEY = "jianlian:pending-signup:v1";
export type PendingSignup = { email: string; userId: string; invite: string };
// Keep the recovery hint no longer than the Production OTP lifetime.
const MAX_AGE = 600_000;

export function readPendingSignup(storage: Storage, now = Date.now()): PendingSignup | null {
  const localRaw = storage.getItem(PENDING_SIGNUP_KEY);
  const local = decodePendingSignup(localRaw, now);
  if (local) return local;
  if (localRaw) storage.removeItem(PENDING_SIGNUP_KEY);
  return null;
}

export function encodePendingSignup(value: PendingSignup, now = Date.now()) {
  return JSON.stringify({ email: value.email, userId: value.userId, invite: value.invite, savedAt: now });
}

export function decodePendingSignup(raw: string | null, now = Date.now()): PendingSignup | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).some(key => !["email", "userId", "invite", "savedAt"].includes(key))
      || typeof value.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
      || typeof value.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.userId)
      || typeof value.invite !== "string" || (value.invite !== "" && !/^JL[A-Z0-9]{6,12}$/.test(value.invite))
      || !Number.isSafeInteger(value.savedAt) || now < value.savedAt || now - value.savedAt > MAX_AGE) return null;
    return { email: value.email, userId: value.userId, invite: value.invite };
  } catch { return null; }
}
