import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBitrefillLiveClient,
  resolveBitrefillPackageUsdCost,
} from "./live-client.mjs";
import { zeroSupplierSummary } from "../core/supplier-router-core.mjs";
import type { SupplierFulfillmentSummary } from "../core/types";
import { notifySupplierInsufficientBalance } from "../core/supplier-balance-alert";

const AUTO_DELIVERY_TYPES = new Set(["automatic", "auto", "card", "account", "auto_delivery"]);
const DEFAULT_POLL_DELAYS_MS = [1500, 2000, 2500, 3000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BitrefillOrderCandidate = {
  orderId: string;
  orderItemId: string;
  productId: string;
  skuId: string | null;
  quantity: number;
  lineTotalCny: number;
  supplierProductId: string;
  supplierSku: string;
  maxUnitCostUsd: number | null;
  bindingRaw: Record<string, unknown>;
};

function createBitrefillLogicalKey(orderId: string, orderItemId: string) {
  return `bitrefill_live:${orderId}:${orderItemId}`;
}

function getUsdCnyRate(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.BITREFILL_USD_CNY_RATE ?? env.CNY_USDT_FIXED_RATE ?? 7.2);
  return Number.isFinite(raw) && raw > 0 ? raw : 7.2;
}

function getMaxOrderCostUsd(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.BITREFILL_MAX_ORDER_COST_USD ?? 50);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
}

function isLiveEnabled(env: NodeJS.ProcessEnv): boolean {
  return (
    env.SUPPLIER_AUTO_PURCHASE_ENABLED === "true"
    && env.BITREFILL_REAL_PURCHASE_ENABLED === "true"
    && Boolean(env.BITREFILL_API_KEY?.trim())
  );
}

export async function freezeBitrefillOrderBinding(
  service: SupabaseClient | null,
  input: { orderId: string; productId: string; skuId: string | null },
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!service || !isLiveEnabled(env)) return;

  const skuMeta = input.skuId
    ? ((await service.from("product_skus").select("metadata").eq("id", input.skuId).maybeSingle()).data?.metadata as Record<string, unknown> | null)
    : null;
  const prodMeta = (await service.from("products").select("metadata").eq("id", input.productId).maybeSingle()).data?.metadata as Record<string, unknown> | null;

  const supplier = String(skuMeta?.supplier ?? prodMeta?.supplier ?? "").trim();
  if (supplier !== "bitrefill") return;

  const autoEnabled = skuMeta?.supplier_auto_purchase_enabled ?? prodMeta?.supplier_auto_purchase_enabled;
  if (autoEnabled !== true) return;

  const supplierProductId = String(skuMeta?.supplier_product_id ?? prodMeta?.supplier_product_id ?? "").trim();
  const supplierSku = String(skuMeta?.supplier_sku ?? prodMeta?.supplier_sku ?? "").trim();
  if (!supplierProductId || !supplierSku) return;

  const maxUnitCost = skuMeta?.supplier_max_unit_cost ?? prodMeta?.supplier_max_unit_cost ?? null;

  const { data: items } = await service
    .from("order_items")
    .select("id,product_snapshot")
    .eq("order_id", input.orderId);

  for (const item of items ?? []) {
    const snap = (item.product_snapshot && typeof item.product_snapshot === "object" && !Array.isArray(item.product_snapshot))
      ? (item.product_snapshot as Record<string, unknown>)
      : {};
    if (snap.supplier_binding && typeof snap.supplier_binding === "object") continue;

    const nextSnap = {
      ...snap,
      supplier_binding: {
        fulfillment_source: "supplier",
        supplier: "bitrefill",
        website_product_id: input.productId,
        website_sku_id: input.skuId,
        supplier_product_id: supplierProductId,
        supplier_sku: supplierSku,
        supplier_currency: "USD",
        ...(maxUnitCost != null ? { supplier_max_unit_cost: maxUnitCost } : {}),
        supplier_auto_purchase_enabled: true,
      },
    };
    await service.from("order_items").update({ product_snapshot: nextSnap }).eq("id", item.id);
  }
}

async function loadBitrefillCandidates(
  service: SupabaseClient,
  orderId: string
): Promise<BitrefillOrderCandidate[]> {
  const { data: order, error: orderErr } = await service
    .from("orders")
    .select("id,payment_status,status,currency,total_amount")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) return [];
  if (
    order.payment_status !== "paid"
    || ["cancelled", "expired", "refunded", "failed"].includes(String(order.status ?? ""))
  ) {
    return [];
  }

  const { data: items, error: itemsErr } = await service
    .from("order_items")
    .select("id,order_id,product_id,sku_id,quantity,line_total,delivery_type,delivery_status,product_snapshot")
    .eq("order_id", orderId)
    .order("id");
  if (itemsErr || !Array.isArray(items)) return [];

  const candidates: BitrefillOrderCandidate[] = [];
  for (const item of items) {
    if (!AUTO_DELIVERY_TYPES.has(String(item.delivery_type ?? ""))) continue;
    if (item.delivery_status === "delivered") continue;
    const binding = (item.product_snapshot as Record<string, unknown> | null)?.supplier_binding as
      | Record<string, unknown>
      | undefined;
    if (!binding || binding.supplier !== "bitrefill") continue;

    const supplierProductId = String(binding.supplier_product_id ?? binding.productId ?? "").trim();
    const supplierSku = String(binding.supplier_sku ?? binding.sku ?? "").trim();
    if (!supplierProductId || !supplierSku) continue;

    const maxCostRaw = binding.supplier_max_unit_cost ?? binding.maxUnitCost;
    const maxUnitCostUsd = maxCostRaw != null && Number.isFinite(Number(maxCostRaw)) && Number(maxCostRaw) > 0
      ? Number(maxCostRaw)
      : null;

    candidates.push({
      orderId,
      orderItemId: String(item.id),
      productId: String(item.product_id),
      skuId: item.sku_id ? String(item.sku_id) : null,
      quantity: Number(item.quantity ?? 1),
      lineTotalCny: Number(item.line_total ?? 0),
      supplierProductId,
      supplierSku,
      maxUnitCostUsd,
      bindingRaw: binding,
    });
  }
  return candidates;
}

async function commitBitrefillDelivery(input: {
  service: SupabaseClient;
  orderId: string;
  orderItemId: string;
  requestId: string;
  attemptToken: string;
  attemptId: string;
  invoiceId: string;
  content: string;
  actualUsdCost: number | null;
  quantity: number;
  usdCnyRate: number;
}) {
  const totalCny = input.actualUsdCost != null
    ? Number((input.actualUsdCost * input.usdCnyRate).toFixed(4))
    : null;
  const unitCny = totalCny != null && input.quantity > 0
    ? Number((totalCny / input.quantity).toFixed(4))
    : null;

  const { data: outcome, error: rpcErr } = await input.service.rpc("record_supplier_fulfillment_outcome", {
    p_supplier: "bitrefill",
    p_order_id: input.orderId,
    p_order_item_id: input.orderItemId,
    p_request_id: input.requestId,
    p_attempt_token: input.attemptToken,
    p_status: "FULFILLED",
    p_retryable: false,
    p_error_code: null,
    p_provider_order_code: input.invoiceId,
    p_delivery_content: input.content,
    p_supplier_unit_price: unitCny,
    p_supplier_total_price: totalCny,
    p_trigger_source: "bitrefill_live_private_delivery",
  });
  if (rpcErr || !outcome || (outcome as { ok?: boolean }).ok !== true) {
    throw new Error(`BITREFILL_DELIVERY_COMMIT_FAILED:${rpcErr?.message ?? "UNKNOWN"}`);
  }

  // Best-effort finalize attempt status (direct UPDATE may be ACL-restricted in some profiles)
  try {
    await input.service
      .from("supplier_purchase_attempts")
      .update({ status: "SUCCEEDED" })
      .eq("supplier", "bitrefill")
      .eq("id", input.attemptId)
      .in("status", ["EXTERNAL_CREATED", "RECONCILING", "SUCCEEDED"]);
  } catch {
    // Delivery is already atomically committed above.
  }
}

export async function reconcileBitrefillOrder(
  service: SupabaseClient,
  orderId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<SupplierFulfillmentSummary> {
  const summary = zeroSupplierSummary();
  if (!env.BITREFILL_API_KEY?.trim()) return summary;

  const candidates = await loadBitrefillCandidates(service, orderId);
  if (!candidates.length) return summary;

  const client = createBitrefillLiveClient({ apiKey: env.BITREFILL_API_KEY });
  const usdCnyRate = getUsdCnyRate(env);

  for (const candidate of candidates) {
    const logicalKey = createBitrefillLogicalKey(candidate.orderId, candidate.orderItemId);
    const { data: attempt } = await service
      .from("supplier_purchase_attempts")
      .select("id,status,external_invoice_id,logical_request_key")
      .eq("supplier", "bitrefill")
      .eq("logical_request_key", logicalKey)
      .maybeSingle();

    if (!attempt) continue;
    summary.handled++;
    if (attempt.status === "SUCCEEDED") {
      summary.fulfilled++;
      continue;
    }
    if (!attempt.external_invoice_id) {
      summary.uncertain++;
      continue;
    }

    const { data: root } = await service
      .from("supplier_fulfillment_requests")
      .select("id,request_id,attempt_token,status")
      .eq("order_item_id", candidate.orderItemId)
      .eq("supplier", "bitrefill")
      .maybeSingle();

    if (!root?.attempt_token) {
      summary.uncertain++;
      continue;
    }

    try {
      const result = await client.fetchDeliverables(String(attempt.external_invoice_id));
      if (result.delivered && result.content) {
        await commitBitrefillDelivery({
          service,
          orderId: candidate.orderId,
          orderItemId: candidate.orderItemId,
          requestId: String(root.request_id),
          attemptToken: String(root.attempt_token),
          attemptId: String(attempt.id),
          invoiceId: String(attempt.external_invoice_id),
          content: result.content,
          actualUsdCost: result.actualUsdCost,
          quantity: candidate.quantity,
          usdCnyRate,
        });
        summary.fulfilled++;
      } else {
        summary.uncertain++;
      }
    } catch {
      summary.uncertain++;
    }
  }

  return summary;
}

export async function fulfillBitrefillLiveOrderWithSupabase(
  service: SupabaseClient,
  orderId: string,
  triggerSource: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<SupplierFulfillmentSummary> {
  const summary = zeroSupplierSummary();
  if (!isLiveEnabled(env)) return summary;

  const candidates = await loadBitrefillCandidates(service, orderId);
  if (!candidates.length) return summary;

  const client = createBitrefillLiveClient({ apiKey: env.BITREFILL_API_KEY! });
  const usdCnyRate = getUsdCnyRate(env);
  const maxOrderCostUsd = getMaxOrderCostUsd(env);

  for (const candidate of candidates) {
    summary.handled++;
    const logicalKey = createBitrefillLogicalKey(candidate.orderId, candidate.orderItemId);

    try {
      // 1. If an attempt already exists, reconcile only — NEVER double-submit
      const { data: existingAttempt } = await service
        .from("supplier_purchase_attempts")
        .select("id,status,external_invoice_id")
        .eq("supplier", "bitrefill")
        .eq("logical_request_key", logicalKey)
        .maybeSingle();

      if (existingAttempt) {
        if (existingAttempt.status === "SUCCEEDED") {
          summary.fulfilled++;
          continue;
        }
        if (existingAttempt.external_invoice_id) {
          const rec = await reconcileBitrefillOrder(service, orderId, env);
          if (rec.fulfilled > 0) summary.fulfilled++;
          else summary.uncertain++;
          continue;
        }
        summary.uncertain++;
        continue;
      }

      // 2. Fresh pre-submit checks: product stock, USD price, cost cap, USD wallet balance
      const detail = await client.getProductDetail(candidate.supplierProductId);
      const unitUsdCost = resolveBitrefillPackageUsdCost(detail, candidate.supplierSku);
      const totalUsdCost = Number((unitUsdCost * candidate.quantity).toFixed(2));

      if (candidate.maxUnitCostUsd != null && unitUsdCost > candidate.maxUnitCostUsd) {
        throw new Error(`BITREFILL_UNIT_COST_EXCEEDED:${unitUsdCost}>${candidate.maxUnitCostUsd}`);
      }
      if (totalUsdCost > maxOrderCostUsd) {
        throw new Error(`BITREFILL_ORDER_COST_EXCEEDED:${totalUsdCost}>${maxOrderCostUsd}`);
      }

      const balance = await client.readUsdBalance();
      if (balance.availableUsd + 1e-9 < totalUsdCost) {
        void notifySupplierInsufficientBalance({
          supplierCode: "bitrefill",
          supplierName: "Bitrefill",
          orderId: candidate.orderId,
          orderItemId: candidate.orderItemId,
          productId: candidate.supplierProductId,
          reason: `USD_BALANCE_${balance.amountText}_LT_${totalUsdCost.toFixed(2)}`,
        });
        throw new Error(`BITREFILL_BALANCE_INSUFFICIENT:${balance.amountText}<${totalUsdCost.toFixed(2)}`);
      }

      // 3. Claim root & immutable purchase attempt before external network write
      const marker = `bitrefill_live:${String(triggerSource).replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 48)}`;
      const { error: claimRootErr } = await service.rpc("claim_supplier_fulfillment", {
        p_supplier: "bitrefill",
        p_order_id: candidate.orderId,
        p_order_item_id: candidate.orderItemId,
        p_request_id: logicalKey,
        p_supplier_product_id: candidate.supplierProductId,
        p_supplier_sku: candidate.supplierSku,
        p_trigger_source: marker,
      });
      if (claimRootErr) throw new Error(`BITREFILL_CLAIM_ROOT_FAILED:${claimRootErr.message}`);

      const { data: root, error: rootReadErr } = await service
        .from("supplier_fulfillment_requests")
        .select("id,status,request_id,attempt_token")
        .eq("order_item_id", candidate.orderItemId)
        .eq("supplier", "bitrefill")
        .single();
      if (rootReadErr || !root?.attempt_token) {
        throw new Error("BITREFILL_ROOT_READ_FAILED");
      }

      const semanticHash = createHash("sha256")
        .update(JSON.stringify({
          supplier: "bitrefill",
          orderId: candidate.orderId,
          orderItemId: candidate.orderItemId,
          productId: candidate.supplierProductId,
          sku: candidate.supplierSku,
          quantity: candidate.quantity,
        }))
        .digest("hex");

      const units = Array.from({ length: candidate.quantity }, (_, idx) => ({
        fulfillment_request_id: root.id,
        order_item_id: candidate.orderItemId,
        unit_index: idx + 1,
        frozen_product_id: candidate.supplierProductId,
        frozen_package_id: candidate.supplierSku,
        frozen_currency: "USD",
        frozen_face_value: String(candidate.supplierSku),
      }));

      const { data: claimData, error: attemptErr } = await service.rpc("internal_supplier_purchase_claim", {
        p_supplier: "bitrefill",
        p_logical_key: logicalKey,
        p_semantic_hash: semanticHash,
        p_items: units,
      });
      if (attemptErr || !claimData) {
        throw new Error(`BITREFILL_ATTEMPT_CLAIM_FAILED:${attemptErr?.message ?? "UNKNOWN"}`);
      }

      const attemptId = String((claimData as { attempt_id?: string; id?: string }).attempt_id ?? (claimData as { id?: string }).id ?? "");
      if (!attemptId) throw new Error("BITREFILL_ATTEMPT_ID_MISSING");

      // Transition CLAIMED -> SUBMITTING before external POST
      const { error: subErr } = await service.rpc("internal_supplier_purchase_transition", {
        p_attempt_id: attemptId,
        p_expected_status: "CLAIMED",
        p_next_status: "SUBMITTING",
        p_external_invoice_id: null,
      });
      if (subErr) throw new Error(`BITREFILL_TRANSITION_SUBMITTING_FAILED:${subErr.message}`);

      // 4. Execute single MCP buy-products USD balance purchase
      let purchased: { invoiceId: string; uncertain: boolean };
      try {
        purchased = await client.purchaseWithUsdBalance({
          productId: candidate.supplierProductId,
          packageValue: candidate.supplierSku,
          quantity: candidate.quantity,
        });
      } catch (buyErr) {
        const msg = buyErr instanceof Error ? buyErr.message : "BITREFILL_BUY_FAILED";
        console.error("[Bitrefill] buy-products failed", {
          orderId: candidate.orderId,
          productId: candidate.supplierProductId,
          sku: candidate.supplierSku,
          code: msg,
        });
        const submitted = Boolean((buyErr as { submitted?: boolean })?.submitted);
        if (!submitted) {
          await service.rpc("internal_supplier_purchase_transition", {
            p_attempt_id: attemptId,
            p_expected_status: "SUBMITTING",
            p_next_status: "FAILED_PRE_SUBMIT",
            p_external_invoice_id: null,
          });
          summary.failed++;
        } else {
          summary.uncertain++;
        }
        continue;
      }

      // 5. Persist external invoice ID immediately
      await service.rpc("internal_supplier_purchase_transition", {
        p_attempt_id: attemptId,
        p_expected_status: "SUBMITTING",
        p_next_status: "EXTERNAL_CREATED",
        p_external_invoice_id: purchased.invoiceId,
      });

      // 6. Poll REST GET /v2/invoices/{invoiceId} until delivered (bounded ~9s)
      let delivered = false;
      for (let i = 0; i <= DEFAULT_POLL_DELAYS_MS.length; i++) {
        if (i > 0) await sleep(DEFAULT_POLL_DELAYS_MS[i - 1]);
        try {
          const res = await client.fetchDeliverables(purchased.invoiceId);
          if (res.delivered && res.content) {
            await commitBitrefillDelivery({
              service,
              orderId: candidate.orderId,
              orderItemId: candidate.orderItemId,
              requestId: String(root.request_id),
              attemptToken: String(root.attempt_token),
              attemptId,
              invoiceId: purchased.invoiceId,
              content: res.content,
              actualUsdCost: res.actualUsdCost ?? totalUsdCost,
              quantity: candidate.quantity,
              usdCnyRate,
            });
            delivered = true;
            summary.fulfilled++;
            break;
          }
          if (res.failed) {
            break;
          }
        } catch {
          // Keep polling within bounded window
        }
      }

      if (!delivered) {
        summary.uncertain++;
      }
    } catch (err) {
      console.error("[Bitrefill] fulfillment error", {
        orderId: candidate.orderId,
        productId: candidate.supplierProductId,
        sku: candidate.supplierSku,
        error: err instanceof Error ? err.message : String(err),
      });
      summary.failed++;
    }
  }

  return summary;
}
