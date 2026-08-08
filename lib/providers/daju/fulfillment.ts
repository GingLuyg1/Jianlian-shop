import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createDajuClient } from "./client";
import { fulfillDajuCandidates } from "./fulfillment-core.mjs";
import {
  isDajuSupplierMetadata,
  parseDajuProductBinding,
  validateDajuPurchaseReadiness,
} from "./mapper.mjs";
import { createDajuRequestId } from "./protocol.mjs";
import type { DajuClient } from "./types";

type DajuBinding = NonNullable<ReturnType<typeof parseDajuProductBinding>>;

export type DajuFulfillmentCandidate = {
  orderId: string;
  orderItemId: string;
  quantity: number;
  binding: DajuBinding | null;
  bindingInvalid: boolean;
  orderFields: Record<string, unknown>;
};

export type DajuClaim = {
  action: "PURCHASE" | "QUERY" | "NONE";
  requestId: string;
  attemptToken: string | null;
  status: string;
  orderCode: string | null;
};

export type DajuOutcomeInput = {
  orderId: string;
  orderItemId: string;
  requestId: string;
  attemptToken: string | null;
  state: "PENDING" | "FULFILLED" | "FAILED" | "UNCERTAIN" | "RECONCILIATION" | "NEEDS_INPUT" | "FAILED_VALIDATION";
  retryable: boolean;
  code: string | null;
  orderCode: string | null;
  deliveredContent: string | null;
  supplierUnitPrice: string | null;
  supplierTotalPrice: string | null;
  triggerSource: string;
};

export type DajuFulfillmentStore = {
  loadCandidates(orderId: string): Promise<DajuFulfillmentCandidate[]>;
  claim(candidate: DajuFulfillmentCandidate, requestId: string, triggerSource: string): Promise<DajuClaim>;
  recordOutcome(input: DajuOutcomeInput): Promise<void>;
};

export type DajuFulfillmentSummary = {
  handled: number;
  fulfilled: number;
  failed: number;
  uncertain: number;
  needsInput: number;
};

function parseClaim(value: unknown): DajuClaim {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("SUPPLIER_CLAIM_INVALID");
  const data = row as Record<string, unknown>;
  if (!["PURCHASE", "QUERY", "NONE"].includes(String(data.action))) throw new Error("SUPPLIER_CLAIM_INVALID");
  if (typeof data.request_id !== "string" || typeof data.status !== "string") throw new Error("SUPPLIER_CLAIM_INVALID");
  return {
    action: data.action as DajuClaim["action"],
    requestId: data.request_id,
    attemptToken: typeof data.attempt_token === "string" ? data.attempt_token : null,
    status: data.status,
    orderCode: typeof data.provider_order_code === "string" ? data.provider_order_code : null,
  };
}

export function createSupabaseDajuFulfillmentStore(service: SupabaseClient): DajuFulfillmentStore {
  return {
    async loadCandidates(orderId) {
      const { data: order, error: orderError } = await service
        .from("orders")
        .select("id,payment_status,status,customer_email,customer_name,customer_phone,customer_note")
        .eq("id", orderId)
        .maybeSingle();
      if (orderError || !order) throw new Error("SUPPLIER_ORDER_READ_FAILED");
      if (order.payment_status !== "paid" || ["cancelled", "expired", "refunded", "failed"].includes(String(order.status))) {
        throw new Error("SUPPLIER_ORDER_NOT_ELIGIBLE");
      }
      const { data: items, error: itemError } = await service
        .from("order_items")
        .select("id,order_id,product_id,sku_id,quantity,delivery_type,delivery_status,product_snapshot")
        .eq("order_id", orderId);
      if (itemError) throw new Error("SUPPLIER_ITEMS_READ_FAILED");
      const candidates: DajuFulfillmentCandidate[] = [];
      for (const item of items ?? []) {
        if (!["automatic", "auto", "card", "account"].includes(String(item.delivery_type))) continue;
        const { data: product, error: productError } = await service.from("products").select("id,metadata").eq("id", item.product_id).maybeSingle();
        if (productError || !product) throw new Error("SUPPLIER_PRODUCT_READ_FAILED");
        let skuMetadata: unknown = null;
        if (item.sku_id) {
          const { data: sku, error: skuError } = await service.from("product_skus").select("id,metadata").eq("id", item.sku_id).maybeSingle();
          if (skuError || !sku) throw new Error("SUPPLIER_SKU_READ_FAILED");
          skuMetadata = sku.metadata;
        }
        if (!isDajuSupplierMetadata(product.metadata, skuMetadata)) continue;
        const snapshot = item.product_snapshot && typeof item.product_snapshot === "object" && !Array.isArray(item.product_snapshot)
          ? item.product_snapshot as Record<string, unknown>
          : {};
        const snapshotBinding = snapshot.supplier_binding;
        const binding = parseDajuProductBinding(snapshotBinding);
        candidates.push({
          orderId,
          orderItemId: String(item.id),
          quantity: Number(item.quantity),
          binding,
          bindingInvalid: !isDajuSupplierMetadata(snapshotBinding) || !binding || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1,
          orderFields: {
            customer_email: order.customer_email,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            customer_note: order.customer_note,
          },
        });
      }
      return candidates;
    },
    async claim(candidate, requestId, triggerSource) {
      const { data, error } = await service.rpc("claim_daju_supplier_fulfillment", {
        p_order_id: candidate.orderId,
        p_order_item_id: candidate.orderItemId,
        p_request_id: requestId,
        p_supplier_product_id: candidate.binding?.productId ?? null,
        p_supplier_sku: candidate.binding?.sku ?? null,
        p_trigger_source: triggerSource,
      });
      if (error) throw new Error("SUPPLIER_CLAIM_FAILED");
      const claim = parseClaim(data);
      if (claim.requestId !== requestId) throw new Error("SUPPLIER_CLAIM_MISMATCH");
      return claim;
    },
    async recordOutcome(outcome) {
      const { error } = await service.rpc("record_daju_supplier_fulfillment_outcome", {
        p_order_id: outcome.orderId,
        p_order_item_id: outcome.orderItemId,
        p_request_id: outcome.requestId,
        p_attempt_token: outcome.attemptToken,
        p_status: outcome.state,
        p_retryable: outcome.retryable,
        p_error_code: outcome.code,
        p_provider_order_code: outcome.orderCode,
        p_delivery_content: outcome.deliveredContent,
        p_supplier_unit_price: outcome.supplierUnitPrice,
        p_supplier_total_price: outcome.supplierTotalPrice,
        p_trigger_source: outcome.triggerSource,
      });
      if (error) throw new Error("SUPPLIER_OUTCOME_WRITE_FAILED");
    },
  };
}

function outcome(
  candidate: DajuFulfillmentCandidate,
  claim: DajuClaim,
  requestId: string,
  state: DajuOutcomeInput["state"],
  retryable: boolean,
  code: string | null,
  extra: Partial<DajuOutcomeInput> = {},
  triggerSource = "system"
): DajuOutcomeInput {
  return {
    orderId: candidate.orderId,
    orderItemId: candidate.orderItemId,
    requestId,
    attemptToken: claim.attemptToken,
    state,
    retryable,
    code,
    orderCode: null,
    deliveredContent: null,
    supplierUnitPrice: null,
    supplierTotalPrice: null,
    triggerSource,
    ...extra,
  };
}

export async function fulfillDajuOrderItems(input: {
  store: DajuFulfillmentStore;
  client: DajuClient;
  orderId: string;
  triggerSource: string;
}): Promise<DajuFulfillmentSummary> {
  const candidates = await input.store.loadCandidates(input.orderId);
  return fulfillDajuCandidates({
    candidates,
    store: input.store,
    client: input.client,
    triggerSource: input.triggerSource,
    createRequestId: createDajuRequestId,
    validateReadiness: validateDajuPurchaseReadiness,
    outcome: (candidate: DajuFulfillmentCandidate, claim: DajuClaim, requestId: string, state: DajuOutcomeInput["state"], retryable: boolean, code: string | null, extra?: Partial<DajuOutcomeInput>) =>
      outcome(candidate, claim, requestId, state, retryable, code, extra, input.triggerSource),
  }) as Promise<DajuFulfillmentSummary>;
}

export async function fulfillDajuOrderWithSupabase(service: SupabaseClient, orderId: string, triggerSource: string) {
  const store = createSupabaseDajuFulfillmentStore(service);
  const candidates = await store.loadCandidates(orderId);
  if (candidates.length === 0) {
    return { handled: 0, fulfilled: 0, failed: 0, uncertain: 0, needsInput: 0 } satisfies DajuFulfillmentSummary;
  }
  return fulfillDajuOrderItems({
    store: { ...store, loadCandidates: async () => candidates },
    client: createDajuClient(),
    orderId,
    triggerSource,
  });
}
