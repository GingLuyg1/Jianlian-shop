export const PROMOTION_COMMISSION_RATE = 0.03;
export const PROMOTION_MIN_WITHDRAW_AMOUNT = 10;
export const PROMOTION_RECORDS_PER_PAGE = 7;

export function createInviteCodeFromUserId(userId: string) {
  return `JL${userId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function maskUserLabel(value: string | null | undefined) {
  if (!value) return "匿名用户";

  const normalized = value.trim();
  if (normalized.includes("@")) {
    const [name, domain] = normalized.split("@");
    if (!domain) return normalized;
    const visible = name.slice(0, 3);
    return `${visible}${"*".repeat(Math.max(3, name.length - 3))}@${domain}`;
  }

  if (normalized.length <= 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function formatMoney(value: number) {
  return `¥ ${value.toFixed(2)}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}
