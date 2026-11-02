// Diagnostic release gates only. No credentials, network calls, claims or writes.
// A PASS is not a purchase authorization and cannot change the release switch.
import { decimalMicros } from "./quote-core.mjs";

export function evaluateMobileProcurementReadiness(evidence = {}) {
  const blockers = [];
  const need = (ok, code) => { if (!ok) blockers.push(code); };
  need(evidence.businessResaleApproved === true && evidence.productScopeApproved === true, "BUSINESS_RESALE_SCOPE");
  need(evidence.businessCredentialsVerified === true, "BUSINESS_CREDENTIALS");
  need(evidence.paidOrderVerified === true && evidence.paymentRiskClear === true, "PAID_ORDER_EVIDENCE");
  need(evidence.localStockChecked === true, "LOCAL_STOCK_FIRST");
  need(evidence.cost?.source === "authenticated_supplier_cost" && evidence.cost.feesIncluded === true &&
    evidence.cost.currency === "USD" && evidence.cost.supplierEnforcedCap === true, "ALL_IN_SUPPLIER_COST_CAP");
  need(evidence.fx?.sourceVerified === true && evidence.fx.from === "USD" && evidence.fx.to === "CNY", "VERIFIED_USD_CNY_FX");
  try {
    const cost = decimalMicros(evidence.cost.amount), fx = decimalMicros(evidence.fx.rate);
    const revenue = decimalMicros(evidence.netRevenueCny), cap = decimalMicros(evidence.singleCapUsd);
    const balance = decimalMicros(evidence.availableBalanceUsd), reserved = decimalMicros(evidence.reservedUsd);
    const cumulative = decimalMicros(evidence.cumulativeCapUsd), used = decimalMicros(evidence.committedUsd);
    const margin = evidence.minimumMarginBps;
    need(Number.isSafeInteger(margin) && margin >= 0 && margin < 10000 && revenue > 0n && cost > 0n && fx > 0n &&
      cost * fx * 10000n <= revenue * 1000000n * BigInt(10000 - margin), "NET_MARGIN");
    need(cost <= cap && cost + reserved <= balance && used + reserved + cost <= cumulative &&
      evidence.atomicBudgetReservationVerified === true, "ATOMIC_SINGLE_AND_CUMULATIVE_BUDGET");
  } catch { blockers.push("FINANCIAL_EVIDENCE_INCOMPLETE"); }
  need(evidence.privateRecipientPathVerified === true && evidence.deliveryKindVerified === true, "PRIVATE_TYPED_FULFILLMENT");
  need(evidence.authoritativeReconciliationVerified === true && evidence.durableIdempotencyVerified === true, "DURABLE_RECONCILIATION");
  return Object.freeze({ ready: blockers.length === 0, blockers, purchaseAuthorized: false });
}
