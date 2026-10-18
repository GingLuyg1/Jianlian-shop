// Server release gate. Deliberately not an environment-variable switch.
// Changing this requires a separately authorized release and review of all
// paid-order, cost, claim, identity and database-parity gates.
export const REAL_BITREFILL_PURCHASE_ENABLED = false;

export function assertBitrefillRealPurchaseEnabled() {
  if (!REAL_BITREFILL_PURCHASE_ENABLED) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
}
