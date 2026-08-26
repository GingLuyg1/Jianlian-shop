import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createDajuClient } from "./client";
import { classifyDajuFulfillmentCandidate } from "./fulfillment-candidate.mjs";
import { fulfillDajuCandidates, reconcileDajuExistingCandidate } from "./fulfillment-core.mjs";
import {
  parseDajuProductBinding,
  validateDajuExistingOrderReconciliation,
  validateDajuPurchaseReadiness,
} from "./mapper.mjs";
import { createDajuRequestId } from "./protocol.mjs";
import type { DajuClient } from "./types";
import type {
  SupplierClaim,
  SupplierFulfillmentCandidate,
  SupplierFulfillmentStore,
  SupplierFulfillmentSummary,
  SupplierOutcomeInput,
} from "../core/types";

type DajuBinding = NonNullable<ReturnType<typeof parseDajuProductBinding>>;

export type DajuFulfillmentCandidate = SupplierFulfillmentCandidate<DajuBinding>;
export type DajuClaim = SupplierClaim;
export type DajuOutcomeInput = SupplierOutcomeInput;
export type DajuFulfillmentStore = SupplierFulfillmentStore<DajuBinding>;
export type DajuFulfillmentSummary = SupplierFulfillmentSummary;

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
        const classification = classifyDajuFulfillmentCandidate(item);
        if (classification.kind === "skip") continue;
        const binding = classification.kind === "daju" ? classification.binding : null;
        candidates.push({
          orderId,
          orderItemId: String(item.id),
          quantity: Number(item.quantity),
          binding,
          bindingInvalid: classification.kind === "validation" || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1,
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
      if (!candidate.binding || candidate.bindingInvalid) {
        throw new Error("SUPPLIER_BINDING_REQUIRES_MANUAL_REVIEW");
      }
      const { data, error } = await service.rpc("claim_daju_supplier_fulfillment", {
        p_order_id: candidate.orderId,
        p_order_item_id: candidate.orderItemId,
        p_request_id: requestId,
        p_supplier_product_id: candidate.binding.productId,
        p_supplier_sku: candidate.binding.sku,
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

export async function reconcileDajuExistingOrderWithSupabase(input: {
  service: SupabaseClient;
  orderId: string;
  orderItemId: string;
  orderCode: string;
  triggerSource: string;
}) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(input.orderCode)) {
    throw new Error("DAJU_RECONCILIATION_ORDER_CODE_INVALID");
  }
  const store = createSupabaseDajuFulfillmentStore(input.service);
  const candidates = await store.loadCandidates(input.orderId);
  const candidate = candidates.find((entry) => entry.orderItemId === input.orderItemId);
  if (!candidate) throw new Error("DAJU_RECONCILIATION_ITEM_NOT_FOUND");
  return reconcileDajuExistingCandidate({
    candidate,
    store,
    client: createDajuClient(),
    orderCode: input.orderCode,
    triggerSource: input.triggerSource,
    createRequestId: createDajuRequestId,
    validateReconciliation: validateDajuExistingOrderReconciliation,
    outcome: (target: DajuFulfillmentCandidate, claim: DajuClaim, requestId: string, state: DajuOutcomeInput["state"], retryable: boolean, code: string | null, extra?: Partial<DajuOutcomeInput>) =>
      outcome(target, claim, requestId, state, retryable, code, extra, input.triggerSource),
  }) as Promise<{ ok: true; orderCode: string; requestId: string; deliveredCount: number }>;
}
