import { runSupplierReconciliation } from "./supplier-reconciliation-runtime.mjs";
import { createDajuHttpClient } from "../../lib/providers/daju/client-core.mjs";

const enabled = process.env.SUPPLIER_RECONCILIATION_ENABLED === "true";
const purchaseEnabled = process.env.SUPPLIER_AUTO_PURCHASE_ENABLED === "true";
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
const checked = await runSupplierReconciliation({
  service,
  getOrder(orderCode) {
    return createDajuHttpClient({
      baseUrl: process.env.DAJU_API_BASE_URL,
      apiKey: process.env.DAJU_API_KEY,
      timeoutMs: 8_000,
    }).getOrder(orderCode);
  },
});
console.log(`SUPPLIER_RECONCILIATION=PASS checked=${checked}`);
