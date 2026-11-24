import type { SupabaseClient } from "@supabase/supabase-js";

import { fulfillDajuOrderWithSupabase } from "../daju/fulfillment";
import { fulfillKuajingZyOrderWithSupabase } from "../kuajingzy/fulfillment";
import { fulfillBitrefillLiveOrderWithSupabase } from "../bitrefill/live-fulfillment";
import { getBitrefillPinHandler } from "../bitrefill/pin-runtime.mjs";
import { ensureBitrefillProductionRuntime } from "../bitrefill/production-server";
import {
  collectFrozenSupplierCodes,
  executeSupplierHandlers,
  resolveSupplierHandlers,
} from "./supplier-router-core.mjs";
import type { SupplierFulfillmentSummary } from "./types";

type SupplierFulfillmentHandler = (
  service: SupabaseClient,
  orderId: string,
  triggerSource: string,
) => Promise<SupplierFulfillmentSummary>;

const SUPPLIER_REGISTRY: Readonly<Record<string, SupplierFulfillmentHandler>> = {
  daju: fulfillDajuOrderWithSupabase,
  kuajingzy: fulfillKuajingZyOrderWithSupabase,
};

export { collectFrozenSupplierCodes } from "./supplier-router-core.mjs";
export { canSupplierAutoPurchase, discoverSupplierProvider } from "./supplier-router-core.mjs";

export async function fulfillSupplierOrderWithSupabase(
  service: SupabaseClient,
  orderId: string,
  triggerSource: string,
  localBitrefill?: SupplierFulfillmentHandler,
): Promise<SupplierFulfillmentSummary> {
  const { data, error } = await service
    .from("order_items")
    .select("delivery_type,delivery_status,product_snapshot")
    .eq("order_id", orderId);
  if (error) throw new Error("SUPPLIER_ROUTER_ITEMS_READ_FAILED");

  const supplierCodes = collectFrozenSupplierCodes(data ?? []);
  let bitrefillHandler: SupplierFulfillmentHandler | null = localBitrefill ?? null;
  if (!bitrefillHandler && supplierCodes.includes("bitrefill")) {
    if (process.env.BITREFILL_REAL_PURCHASE_ENABLED === "true") {
      bitrefillHandler = fulfillBitrefillLiveOrderWithSupabase;
    } else {
      ensureBitrefillProductionRuntime();
      bitrefillHandler = getBitrefillPinHandler();
    }
  }
  const handlers = resolveSupplierHandlers(supplierCodes, bitrefillHandler
    ? { ...SUPPLIER_REGISTRY, bitrefill: bitrefillHandler } : SUPPLIER_REGISTRY);
  return executeSupplierHandlers(handlers, (handler) =>
    handler(service, orderId, triggerSource),
  );
}
