// Local integration dependency only. Never constructs HTTP or reads credentials.
import { createHash } from "node:crypto";
import { BitrefillFakeTransport } from "./transport.mjs";
import { createBitrefillPurchaseRpcAdapter, runBitrefillSingleItemPurchase } from "./purchase-persistence.mjs";
import { deliverBitrefillSingleItem, loadBitrefillSingleItemCandidate,
  reconcileBitrefillSingleItem } from "./single-item-purchase.mjs";
import { collectFrozenSupplierCodes, executeSupplierHandlers,
  resolveSupplierHandlers, zeroSupplierSummary } from "../core/supplier-router-core.mjs";

const AUTO = new Set(["automatic", "auto", "card", "account", "auto_delivery"]);
const BLOCKED = new Set(["cancelled", "expired", "refunded", "failed"]);
function amount(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("BITREFILL_P2_FINANCIAL_EVIDENCE_INVALID");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

// No FX conversion: the charged item allocation, platform fee and supplier cost
// must have the same currency. Evidence comes from the injected synthetic ledger.
export function validateLocalFinancialEvidence(candidate, evidence, quote) {
  const { order, orderItem } = candidate;
  if (evidence?.source !== "synthetic_paid_ledger" || evidence.orderId !== order.id ||
      evidence.orderItemId !== orderItem.id || evidence.currency !== order.currency ||
      quote?.currency !== order.currency || quote.synthetic !== true ||
      evidence.fxSource !== "same_currency_no_conversion") {
    throw new Error("BITREFILL_P2_TRUSTED_FINANCIALS_REQUIRED");
  }
  const paid = amount(evidence.paidItemAmount);
  const fee = amount(evidence.paymentFee);
  const cost = amount(quote.amount);
  const minimum = amount(orderItem.product_snapshot.supplier_binding.supplier_min_unit_profit);
  const maximum = amount(evidence.maxUnitProfit);
  const sale = amount(String(orderItem.unit_price));
  if (paid <= 0n || paid > sale || fee > paid || paid - fee - cost < minimum ||
      paid - fee - cost > maximum) throw new Error("BITREFILL_P2_NET_PROFIT_BLOCKED");
  return { orderId: order.id, orderItemId: orderItem.id,
    productId: orderItem.product_id ?? null, skuId: orderItem.sku_id ?? null,
    paidItemAmount: evidence.paidItemAmount, paymentFee: evidence.paymentFee,
    currency: evidence.currency, fxSource: evidence.fxSource,
    maxUnitProfit: evidence.maxUnitProfit };
}

async function rows(service, table, columns, field, value) {
  const result = await service.from(table).select(columns).eq(field, value);
  if (result.error || !Array.isArray(result.data)) throw new Error("BITREFILL_P2_DATABASE_READ_FAILED");
  return result.data;
}

async function paidOrder(service, orderId) {
  const records = await rows(service, "orders", "id,status,payment_status,currency", "id", orderId);
  if (records.length !== 1 || records[0].payment_status !== "paid" || !records[0].status || BLOCKED.has(records[0].status)) {
    throw new Error("BITREFILL_P2_ORDER_NOT_ELIGIBLE");
  }
  return records[0];
}

export function createLocalBitrefillFulfillment({ transport, loadPricing, loadFinancialEvidence }) {
  if (!(transport instanceof BitrefillFakeTransport) || typeof loadPricing !== "function" ||
      typeof loadFinancialEvidence !== "function") throw new Error("BITREFILL_P2_FAKE_ONLY");
  return async (service, orderId, triggerSource = "local_p2") => {
    await paidOrder(service, orderId);
    const db = createBitrefillPurchaseRpcAdapter(service);
    const items = await rows(service, "order_items",
      "id,order_id,delivery_type,delivery_status,product_snapshot", "order_id", orderId);
    const summary = zeroSupplierSummary();
    for (const item of items) {
      const binding = item.product_snapshot?.supplier_binding;
      if (!AUTO.has(item.delivery_type) || binding?.supplier !== "bitrefill") continue;
      if (binding.fulfillment_source !== "supplier") throw new Error("BITREFILL_P2_BINDING_INVALID");
      if (item.delivery_status === "delivered") continue;
      summary.handled += 1;
      try {
        // Existing durable attempt always wins over repricing or another submit.
        const existing = await rows(service, "supplier_purchase_attempts",
          "id,status,external_invoice_id,supplier", "logical_request_key", `bitrefill:${item.id}:1`);
        if (existing.length > 1 || existing[0]?.supplier && existing[0].supplier !== "bitrefill") {
          throw new Error("BITREFILL_P2_ATTEMPT_CONFLICT");
        }
        let attempt = existing[0] ? { attemptId: existing[0].id, status: existing[0].status,
          invoiceId: existing[0].external_invoice_id } : null;
        if (!attempt) {
          const claim = await service.rpc("claim_supplier_fulfillment", {
            p_order_id: orderId, p_order_item_id: item.id, p_supplier: "bitrefill",
            p_request_id: `jianlian:${orderId}:${item.id}`,
            p_supplier_product_id: binding.supplier_product_id,
            p_supplier_sku: binding.supplier_sku, p_trigger_source: triggerSource,
          });
          if (claim.error || !claim.data || !["PURCHASE", "NONE", "QUERY"].includes(claim.data.action)) {
            throw new Error("BITREFILL_P2_ROOT_CLAIM_FAILED");
          }
          if (["FULFILLED", "FAILED", "FAILED_VALIDATION", "NEEDS_INPUT"].includes(claim.data.status)) {
            summary.failed += claim.data.status === "FULFILLED" ? 0 : 1;
            continue;
          }
          const candidate = await loadBitrefillSingleItemCandidate(service, orderId, item.id);
          const pricing = await loadPricing(candidate);
          const financial = await loadFinancialEvidence(candidate);
          const semanticContext = validateLocalFinancialEvidence(candidate, financial, pricing.quote);
          attempt = await runBitrefillSingleItemPurchase({ db, transport, candidate,
            ...pricing, semanticContext });
        }
        if (["SUBMITTING", "UNCERTAIN", "CLAIMED"].includes(attempt.status) || !attempt.invoiceId) {
          summary.uncertain += 1;
          continue;
        }
        // Re-read server payment state after the external request and before GET/delivery.
        await paidOrder(service, orderId);
        const result = await reconcileBitrefillSingleItem({ db, transport, attemptId: attempt.attemptId });
        for (const child of result.deliveryCandidates) {
          await paidOrder(service, orderId);
          await deliverBitrefillSingleItem({ db, transport, childRowId: child.childRowId });
          summary.fulfilled += 1;
        }
        if (result.deliveryCandidates.length === 0) {
          if (["FAILED", "REFUNDED"].includes(result.childStatus)) summary.failed += 1;
          else summary.uncertain += 1;
        }
      } catch {
        // No raw supplier response, pricing error or secret escapes this boundary.
        summary.failed += 1;
      }
    }
    return summary;
  };
}

// Reuses the existing router primitives; caller supplies the existing Daju
// handler. This factory is never registered by the active production registry.
export async function dispatchLocalPaidSuppliers({ service, orderId, bitrefill, daju,
  triggerSource = "local_p2" }) {
  await paidOrder(service, orderId);
  const items = await rows(service, "order_items",
    "delivery_type,delivery_status,product_snapshot", "order_id", orderId);
  const handlers = resolveSupplierHandlers(collectFrozenSupplierCodes(items), { bitrefill, daju });
  return executeSupplierHandlers(handlers, (handler) => handler(service, orderId, triggerSource));
}

export async function wakeLocalBitrefill({ service, transport, event, dispatch }) {
  if (!(transport instanceof BitrefillFakeTransport) || typeof dispatch !== "function" ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(event?.eventId ?? "") ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(event?.invoiceId ?? "")) throw new Error("BITREFILL_P2_WAKE_INVALID");
  const db = createBitrefillPurchaseRpcAdapter(service);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    eventId: event.eventId, invoiceId: event.invoiceId,
  })).digest("hex");
  const receipt = await db.recordWebhook(fingerprint, event.invoiceId);
  if (receipt.result !== "RECEIVED") return { reconciled: false };
  const attempt = await db.getAttemptByInvoice(event.invoiceId);
  const items = await db.getAttemptItems(attempt.id);
  if (items.length !== 1) throw new Error("BITREFILL_P2_WAKE_MAPPING_INVALID");
  const root = await db.getRoot(items[0].fulfillment_request_id);
  // The only dispatch argument is persisted order identity; injected webhook
  // statuses, codes and customer fields are ignored.
  return { reconciled: true, summary: await dispatch(root.order_id) };
}
