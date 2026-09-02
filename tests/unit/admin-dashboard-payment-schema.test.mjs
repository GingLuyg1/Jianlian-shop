import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_PAYMENT_CALLBACKS_SELECT,
  DASHBOARD_PAYMENT_CHANNELS_SELECT,
  DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT,
  normalizeDashboardPaymentCallback,
  normalizeDashboardPaymentChannel,
  normalizeDashboardPaymentReconciliation,
} from "../../lib/admin/dashboard-payment-schema.mjs";

function fields(select) {
  return new Set(select.split(","));
}

test("dashboard payment selects use the migrated production column contracts", () => {
  assert.deepEqual(fields(DASHBOARD_PAYMENT_CALLBACKS_SELECT), new Set(["id", "channel", "business_id", "process_result", "received_at"]));
  assert.deepEqual(fields(DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT), new Set(["id", "result", "created_at"]));
  assert.deepEqual(fields(DASHBOARD_PAYMENT_CHANNELS_SELECT), new Set(["code", "display_name", "enabled", "configured", "provider", "network", "merchant_id", "api_url"]));

  assert.equal(fields(DASHBOARD_PAYMENT_CALLBACKS_SELECT).has("business_no"), false);
  assert.equal(fields(DASHBOARD_PAYMENT_RECONCILIATIONS_SELECT).has("reconciliation_status"), false);
  assert.equal(fields(DASHBOARD_PAYMENT_CHANNELS_SELECT).has("channel_code"), false);
});

test("dashboard payment mappers preserve UI semantics without legacy database columns", () => {
  assert.deepEqual(normalizeDashboardPaymentCallback({ id: "callback", channel: "usdt_bep20", business_id: "order", process_result: "amount_mismatch", received_at: "2026-09-02T00:00:00Z" }), {
    id: "callback", channel: "usdt_bep20", businessId: "order", status: "amount_mismatch", createdAt: "2026-09-02T00:00:00Z",
  });
  assert.deepEqual(normalizeDashboardPaymentReconciliation({ id: "reconciliation", result: "mismatched", created_at: "2026-09-02T00:00:00Z" }), {
    id: "reconciliation", status: "mismatched", createdAt: "2026-09-02T00:00:00Z",
  });
  assert.deepEqual(normalizeDashboardPaymentChannel({ code: "usdt_bep20", display_name: "USDT-BEP20", enabled: true, configured: true, provider: "crypto_address", network: "BSC", merchant_id: null, api_url: null }), {
    code: "usdt_bep20", label: "USDT-BEP20", enabled: true, configured: true, provider: "crypto_address", network: "BSC", merchantId: null, apiUrl: null,
  });
});
