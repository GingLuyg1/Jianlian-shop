import crypto from "node:crypto";
import { createDajuHttpClient } from "../../lib/providers/daju/client-core.mjs";

const enabled = process.env.SUPPLIER_RECONCILIATION_ENABLED === "true";
const purchaseEnabled = process.env.SUPPLIER_AUTO_PURCHASE_ENABLED === "true";
const budgetKeys = [
  "SUPPLIER_MAX_SINGLE_PURCHASE_COST",
  "SUPPLIER_MAX_ORDER_PROCUREMENT_COST",
  "SUPPLIER_MAX_SKU_UNIT_COST",
  "SUPPLIER_MAX_PRICE_DRIFT_PERCENT",
  "SUPPLIER_MIN_GROSS_PROFIT",
  "SUPPLIER_MIN_GROSS_MARGIN",
  "SUPPLIER_DAILY_PROCUREMENT_BUDGET",
  "SUPPLIER_MINIMUM_BALANCE",
  "SUPPLIER_BALANCE_TTL_SECONDS",
];
function assertBudgetConfig() {
  if (budgetKeys.some((key) => !Number.isFinite(Number(process.env[key])) || Number(process.env[key]) <= 0)) {
    throw new Error("AUTO_PROCUREMENT_CONFIG_INCOMPLETE");
  }
}

if (purchaseEnabled) {
  throw new Error("SUPPLIER_PURCHASE_MODE_FORBIDDEN");
}
if (!enabled) {
  console.log("SUPPLIER_RECONCILIATION=DISABLED_NOOP");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceUrl || !serviceKey) throw new Error("SUPPLIER_RECONCILIATION_CONFIG_INCOMPLETE");
const service = createClient(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: attempts, error } = await service
  .from("supplier_purchase_attempts")
  .select("id,supplier,status,external_invoice_id,external_order_id")
  .in("status", ["SUBMITTING", "UNCERTAIN", "RECONCILING", "EXTERNAL_CREATED"])
  .limit(100);
if (error) throw new Error("SUPPLIER_RECONCILIATION_READ_FAILED");

let checked = 0;
for (const attempt of attempts ?? []) {
  if (attempt.supplier !== "daju") continue;
  const orderCode = attempt.external_order_id ?? attempt.external_invoice_id;
  if (!orderCode) continue;
  const client = createDajuHttpClient({
    baseUrl: process.env.DAJU_API_BASE_URL,
    apiKey: process.env.DAJU_API_KEY,
    timeoutMs: 8_000,
  });
  let status = "QUERY_FAILED";
  let resultClass = "manual_review";
  try {
    const order = await client.getOrder(orderCode);
    status = String(order.status ?? "UNKNOWN").toUpperCase();
    resultClass = ["SUCCEEDED", "COMPLETED", "DELIVERED"].includes(status) ? "provider_success" : "provider_state";
  } catch { /* keep the safe manual-review classification */ }
  const fingerprint = crypto.createHash("sha256").update(`${attempt.id}:${orderCode}:${status}`).digest("hex");
  const evidence = await service.rpc("internal_supplier_purchase_record_evidence", {
    p_attempt_id: attempt.id,
    p_external_order_row_id: null,
    p_status: status,
    p_result_class: resultClass,
    p_safe_fingerprint: fingerprint,
    p_checked_at: new Date().toISOString(),
  });
  if (evidence.error) throw new Error("SUPPLIER_RECONCILIATION_EVIDENCE_WRITE_FAILED");
  checked += 1;
}
console.log(`SUPPLIER_RECONCILIATION=PASS checked=${checked}`);
