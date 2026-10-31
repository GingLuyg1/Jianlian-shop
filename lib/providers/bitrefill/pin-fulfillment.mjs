// Server dependency factory for the existing unified delivery/router injection.
// No credentials, scheduler, phone input, endpoint, registry activation or SQL.
import { createBitrefillFulfillmentCore } from "./paid-order-local.mjs";
import { runBitrefillPinPurchase } from "./purchase-persistence.mjs";
import { assertPinTransport, assertPinPaidEvidence, prepareBitrefillPinPurchase } from "./pin-policy.mjs";
import { evaluateSupplierAvailability } from "../core/availability-core.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "./prelaunch-policy.mjs";

export function createBitrefillPinFulfillment(input) {
  const synthetic = assertPinTransport(input?.transport);
  if (typeof input.reserveBudget !== "function") throw Error("BITREFILL_PIN_ATOMIC_BUDGET_RESERVER_REQUIRED");
  return createBitrefillFulfillmentCore(input, {
    refreshBeforeSubmit: true,
    assertPayment: (financial, candidate) => assertPinPaidEvidence(financial, candidate, synthetic),
    prepare: args => prepareBitrefillPinPurchase({ ...args, transport: input.transport }),
    run: runBitrefillPinPurchase,
    async reserveBeforeSubmit(prepared) {
      const key = `${prepared.logicalKeyPrefix}:1`, q = prepared.quote;
      const receipt = await input.reserveBudget({ logicalKey: key, amount: q.allInUsd, currency: "USD",
        accountFingerprint: q.accountFingerprint, contractFingerprint: prepared.contractFingerprint });
      if (receipt?.reserved !== true || receipt.logicalKey !== key || receipt.amount !== q.allInUsd ||
          receipt.currency !== "USD" || receipt.accountFingerprint !== q.accountFingerprint ||
          typeof receipt.reservationId !== "string" || !/^[A-Za-z0-9:_-]{1,190}$/.test(receipt.reservationId)) {
        const error = Error("BITREFILL_PIN_BUDGET_RESERVATION_FAILED");error.submitted = false;throw error;
      }
    },
  });
}

// Does not invent local inventory. A future authenticated stock loader uses
// this on Bitrefill-only orderability; the existing global gate still applies.
export function evaluateBitrefillPinStock({ localStock, supplierSnapshot, nowMs, maxAgeMs, saleDecision }) {
  if (!Number.isSafeInteger(localStock) || localStock < 0) return { source: "blocked", purchasable: false, quantity: null };
  if (localStock > 0) return { source: "local", purchasable: true, quantity: localStock };
  const availability = evaluateSupplierAvailability(supplierSnapshot, nowMs, maxAgeMs);
  return { source: "bitrefill", quantity: null, quantityKnown: false, available: availability.purchasable,
    purchasable: REAL_BITREFILL_PURCHASE_ENABLED && availability.purchasable && saleDecision?.canAcceptPayment === true };
}
