export const ACCOUNT_ASSETS_PROFILE_SELECT = "email,display_name,role,created_at,balance";
export const ACCOUNT_ASSETS_CORE_PROFILE_SELECT = "email,balance";

export function normalizeAccountAssetsProfile(row, fallback) {
  return {
    email: textOrNull(row?.email) ?? fallback.email,
    displayName: textOrNull(row?.display_name),
    role: textOrNull(row?.role) ?? fallback.role,
    createdAt: textOrNull(row?.created_at) ?? fallback.createdAt,
    balance: Math.max(0, finiteNumber(row?.balance)),
  };
}

export function getAccountAssetsAvailableBalance(profile) {
  return Math.max(0, finiteNumber(profile?.balance));
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
