import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYMENT_SESSION_EXPIRY_MINUTES,
  PAYMENT_SESSION_EXPIRY_MS,
  createPaymentExpiryWindow,
  isPaymentExpired,
} from "../../lib/payments/payment-expiry.mjs";

test("the shared payment window is exactly 15 minutes", () => {
  const window = createPaymentExpiryWindow(new Date("2026-09-18T00:00:00.000Z"));
  assert.equal(PAYMENT_SESSION_EXPIRY_MINUTES, 15);
  assert.equal(PAYMENT_SESSION_EXPIRY_MS, 900_000);
  assert.equal(window.createdAt, "2026-09-18T00:00:00.000Z");
  assert.equal(window.expiresAt, "2026-09-18T00:15:00.000Z");
});

test("14:59 remains valid and the exact 15:00 boundary is expired", () => {
  const expiry = "2026-09-18T00:15:00.000Z";
  assert.equal(isPaymentExpired(expiry, new Date("2026-09-18T00:14:59.000Z")), false);
  assert.equal(isPaymentExpired(expiry, new Date("2026-09-18T00:15:00.000Z")), true);
  assert.equal(isPaymentExpired(expiry, new Date("2026-09-18T00:15:01.000Z")), true);
});

test("invalid persisted expiry never becomes an implicit valid deadline", () => {
  assert.equal(isPaymentExpired(null), false);
  assert.equal(isPaymentExpired("not-a-date"), false);
});
