export const PROMOTION_COMMISSION_RATE = 0.03;
export const PROMOTION_MIN_WITHDRAW_AMOUNT = 10;
export const PROMOTION_MIN_TRANSFER_AMOUNT = 10;
export const PROMOTION_RECORDS_PER_PAGE = 10;

export const EXCLUDED_COMMISSION_SIM_SERVICE_CATEGORY_ID = "94319387-0291-4e58-b9fd-e25fbdfbfaf1";

export const PROMOTION_ELIGIBLE_PRIMARY_SLUGS = new Set(["digital-accounts", "sim-cards"]);

export type PromotionPosterSpec = {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
  /** QR white-box percentage coordinates inside the poster image */
  qrSlot: {
    x: number;
    y: number;
    w: number;
    h: number;
    paddingPct?: number;
    borderRadiusPct?: number;
  };
};

export const PROMOTION_POSTERS: PromotionPosterSpec[] = [
  {
    id: "blue",
    label: "科技蓝",
    src: "/assets/promotion/poster-blue.jpg",
    width: 768,
    height: 1024,
    qrSlot: { x: 0.043, y: 0.8154, w: 0.2044, h: 0.1514, paddingPct: 0.04, borderRadiusPct: 0.06 },
  },
  {
    id: "bauhaus",
    label: "极简几何",
    src: "/assets/promotion/poster-bauhaus.jpg",
    width: 768,
    height: 1024,
    qrSlot: { x: 0.0521, y: 0.835, w: 0.1732, h: 0.1279, paddingPct: 0.04, borderRadiusPct: 0.02 },
  },
  {
    id: "desk",
    label: "暖光桌面",
    src: "/assets/promotion/poster-desk.jpg",
    width: 768,
    height: 1024,
    qrSlot: { x: 0.7135, y: 0.7832, w: 0.2435, h: 0.1826, paddingPct: 0.04, borderRadiusPct: 0.02 },
  },
  {
    id: "green",
    label: "清新出海",
    src: "/assets/promotion/poster-green.jpg",
    width: 768,
    height: 1024,
    qrSlot: { x: 0.638, y: 0.7119, w: 0.2422, h: 0.167, paddingPct: 0.05, borderRadiusPct: 0.04 },
  },
];

/**
 * 3% 推广返佣仅针对：
 * 1. 数字 / 社媒账号 (digital-accounts)
 * 2. 国际 SIM 卡 (sim-cards)，但明确排除「SIM 卡服务」二级分类
 */
export function isCommissionEligibleCategory(input: {
  primarySlug?: string | null;
  primaryName?: string | null;
  categoryId?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
}): boolean {
  const primarySlug = String(input.primarySlug ?? "").trim().toLowerCase();
  const primaryName = String(input.primaryName ?? "").trim();
  const categoryId = String(input.categoryId ?? "").trim();
  const categorySlug = String(input.categorySlug ?? "").trim().toLowerCase();
  const categoryName = String(input.categoryName ?? "").trim();

  const isExcludedSimService =
    categoryId === EXCLUDED_COMMISSION_SIM_SERVICE_CATEGORY_ID ||
    categorySlug === "balance" ||
    /sim\s*卡服务/i.test(categoryName);

  if (isExcludedSimService) return false;

  const effectivePrimarySlug = primarySlug || categorySlug;
  if (PROMOTION_ELIGIBLE_PRIMARY_SLUGS.has(effectivePrimarySlug)) {
    return true;
  }

  return /数字\s*\/\s*社媒账号|数字账号|国际\s*sim\s*卡|国际电话卡/i.test(
    `${primaryName} ${categoryName}`
  );
}

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
