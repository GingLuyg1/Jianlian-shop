import assert from "node:assert/strict";
import test from "node:test";

import { getBep20TimingVisibility } from "../../lib/payments/bep20-presentation.mjs";

const txHash = `0x${"a".repeat(64)}`;

test("waiting BEP20 session shows countdown without a fake zero confirmation progress", () => {
  assert.deepEqual(
    getBep20TimingVisibility({ chainStatus: "waiting_payment", orderStatus: "pending_payment", paymentStatus: "unpaid" }),
    {
      showCountdown: true,
      showConfirmationProgress: false,
      hasSubmittedTxHash: false,
      manualReview: false,
      terminal: false,
    }
  );
});

test("confirming BEP20 session with TxHash shows countdown and real confirmation progress", () => {
  const result = getBep20TimingVisibility({
    chainStatus: "confirming",
    submittedTxHash: txHash,
    orderStatus: "pending_payment",
    paymentStatus: "unpaid",
  });
  assert.equal(result.showCountdown, true);
  assert.equal(result.showConfirmationProgress, true);
});

test("manual review hides countdown and confirmation progress", () => {
  const result = getBep20TimingVisibility({
    chainStatus: "manual_review",
    submittedTxHash: txHash,
    orderStatus: "pending_payment",
    paymentStatus: "unpaid",
  });
  assert.equal(result.manualReview, true);
  assert.equal(result.showCountdown, false);
  assert.equal(result.showConfirmationProgress, false);
});

for (const state of [
  { chainStatus: "paid", orderStatus: "paid", paymentStatus: "paid" },
  { chainStatus: "paid", orderStatus: "delivered", paymentStatus: "paid" },
  { chainStatus: "expired", orderStatus: "expired", paymentStatus: "failed" },
  { chainStatus: "payment_failed", orderStatus: "failed", paymentStatus: "failed" },
  { chainStatus: "waiting_payment", orderStatus: "cancelled", paymentStatus: "unpaid" },
]) {
  test(`${state.orderStatus} BEP20 terminal state hides countdown and confirmation progress`, () => {
    const result = getBep20TimingVisibility({ ...state, submittedTxHash: txHash });
    assert.equal(result.terminal, true);
    assert.equal(result.showCountdown, false);
    assert.equal(result.showConfirmationProgress, false);
  });
}
