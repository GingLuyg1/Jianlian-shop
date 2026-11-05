// Display-only schedule approved by the user. Order pricing is unchanged.
export const membershipTiers = [
  { level: 0, threshold: 0, discount: "无折扣" },
  { level: 1, threshold: 3000, discount: "9.8 折" },
  { level: 2, threshold: 10000, discount: "9.5 折" },
  { level: 3, threshold: 20000, discount: "9 折" },
] as const;

export function membershipProgress(totalSpend: number | null) {
  if (totalSpend === null || !Number.isFinite(totalSpend)) return null;
  const spend = Math.max(0, totalSpend);
  const current = [...membershipTiers].reverse().find(tier => spend >= tier.threshold)!;
  const next = membershipTiers.find(tier => tier.threshold > spend);
  return { current, next, spend, percent: next ? Math.min(100, spend / next.threshold * 100) : 100, remaining: next ? next.threshold - spend : 0 };
}
