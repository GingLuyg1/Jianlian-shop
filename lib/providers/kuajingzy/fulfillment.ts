import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createKuajingZyProductionRuntime } from "./purchase-server";
import type { SupplierFulfillmentSummary } from "../core/types";

// Existing paid-order supplier router entry. Default literal gate is closed.
export async function fulfillKuajingZyOrderWithSupabase(
  service:SupabaseClient,orderId:string,triggerSource:string,
):Promise<SupplierFulfillmentSummary> {
  return createKuajingZyProductionRuntime({service}).fulfillPaidOrder(orderId,triggerSource);
}
