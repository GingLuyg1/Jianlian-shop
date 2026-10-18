// Local integration dependency only. Never constructs HTTP or reads credentials.
import { createHash } from "node:crypto";
import { BitrefillFakeTransport } from "./transport.mjs";
import { createBitrefillPurchaseRpcAdapter, runBitrefillSingleItemPurchase } from "./purchase-persistence.mjs";
import { deliverBitrefillSingleItem, loadBitrefillSingleItemCandidate,
  prepareBitrefillSingleItem, reconcileBitrefillSingleItem } from "./single-item-purchase.mjs";
import { collectFrozenSupplierCodes, executeSupplierHandlers,
  resolveSupplierHandlers, zeroSupplierSummary } from "../core/supplier-router-core.mjs";
import { assertSyntheticBalance, decimalMicros, normalizeBitrefillSyntheticQuote } from "./quote-core.mjs";

const AUTO = new Set(["automatic", "auto", "card", "account", "auto_delivery"]);
const ELIGIBLE = new Set(["paid", "processing", "delivered", "completed"]);
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
  assertLocalPaymentEligibility(evidence);
  const paid = amount(evidence.paidItemAmount);
  const fee = amount(evidence.paymentFee);
  const cost = amount(quote.amount);
  const otherFees = amount(evidence.otherFees);
  const minimum = amount(orderItem.product_snapshot.supplier_binding.supplier_min_unit_profit);
  const maximum = amount(evidence.maxUnitProfit);
  const sale = amount(String(orderItem.unit_price));
  if (paid <= 0n || paid > sale || fee + otherFees > paid || paid - fee - otherFees - cost < minimum ||
      paid - fee - otherFees - cost > maximum) throw new Error("BITREFILL_P2_NET_PROFIT_BLOCKED");
  return { orderId: order.id, orderItemId: orderItem.id,
    productId: orderItem.product_id ?? null, skuId: orderItem.sku_id ?? null,
    paidItemAmount: evidence.paidItemAmount, paymentFee: evidence.paymentFee,
    currency: evidence.currency, fxSource: evidence.fxSource,
    maxUnitProfit: evidence.maxUnitProfit, otherFees: evidence.otherFees };
}

export function assertLocalPaymentEligibility(evidence) {
  if (evidence?.source !== "synthetic_paid_ledger" || evidence.paymentState !== "paid" ||
      evidence.refundState !== "none" || evidence.disputeState !== "none") {
    throw new Error("BITREFILL_P3_PAYMENT_RISK_MANUAL_REVIEW");
  }
}

async function recordRootManualState(service, orderId, itemId, claim, status, code) {
  if (!claim?.attempt_token) return;
  const result = await service.rpc("record_supplier_fulfillment_outcome", {
    p_order_id: orderId, p_order_item_id: itemId, p_supplier: "bitrefill",
    p_request_id: claim.request_id, p_attempt_token: claim.attempt_token,
    p_status: status, p_retryable: false, p_error_code: code,
    p_provider_order_code: null, p_delivery_content: null,
    p_supplier_unit_price: null, p_supplier_total_price: null, p_trigger_source: "local_p3_guard",
  });
  if (result.error) throw new Error("BITREFILL_P3_SAFE_OUTCOME_WRITE_FAILED");
}

async function rows(service, table, columns, field, value) {
  const result = await service.from(table).select(columns).eq(field, value);
  if (result.error || !Array.isArray(result.data)) throw new Error("BITREFILL_P2_DATABASE_READ_FAILED");
  return result.data;
}

async function paidOrder(service, orderId) {
  const records = await rows(service, "orders", "id,status,payment_status,currency", "id", orderId);
  if (records.length !== 1 || records[0].payment_status !== "paid" || !ELIGIBLE.has(records[0].status)) {
    throw new Error("BITREFILL_P2_ORDER_NOT_ELIGIBLE");
  }
  return records[0];
}

export function createLocalBitrefillFulfillment({ transport, loadPricing, loadFinancialEvidence, loadSupplierBalance }) {
  if (!(transport instanceof BitrefillFakeTransport) || typeof loadPricing !== "function" ||
      typeof loadFinancialEvidence !== "function" || typeof loadSupplierBalance !== "function") throw new Error("BITREFILL_P2_FAKE_ONLY");
  return async (service, orderId, triggerSource = "local_p2") => {
    const order = await paidOrder(service, orderId);
    const db = createBitrefillPurchaseRpcAdapter(service);
    const items = await rows(service, "order_items",
      "id,order_id,product_id,sku_id,quantity,unit_price,delivery_type,delivery_status,product_snapshot", "order_id", orderId);
    const summary = zeroSupplierSummary();
    for (const item of items) {
      const binding = item.product_snapshot?.supplier_binding;
      if (!AUTO.has(item.delivery_type) || binding?.supplier !== "bitrefill") continue;
      if (binding.fulfillment_source !== "supplier") throw new Error("BITREFILL_P2_BINDING_INVALID");
      if (item.delivery_status === "delivered") continue;
      summary.handled += 1;
      let rootClaim = null;
      try {
        const financial = await loadFinancialEvidence({ order, orderItem: item });
        assertLocalPaymentEligibility(financial);
        // Existing durable attempt always wins over repricing or another submit.
        const existing = await rows(service, "supplier_purchase_attempts",
          "id,status,external_invoice_id,supplier", "logical_request_key", `bitrefill:${item.id}:1`);
        if (existing.length > 1 || existing[0]?.supplier && existing[0].supplier !== "bitrefill") {
          throw new Error("BITREFILL_P2_ATTEMPT_CONFLICT");
        }
        let attempt = existing[0] ? { attemptId: existing[0].id, status: existing[0].status,
          invoiceId: existing[0].external_invoice_id } : null;
        if (!attempt || attempt.status === "CLAIMED") {
          const claim = await service.rpc("claim_supplier_fulfillment", {
            p_order_id: orderId, p_order_item_id: item.id, p_supplier: "bitrefill",
            p_request_id: `jianlian:${orderId}:${item.id}`,
            p_supplier_product_id: binding.supplier_product_id,
            p_supplier_sku: binding.supplier_sku, p_trigger_source: triggerSource,
          });
          if (claim.error || !claim.data || !["PURCHASE", "NONE", "QUERY"].includes(claim.data.action)) {
            throw new Error("BITREFILL_P2_ROOT_CLAIM_FAILED");
          }
          rootClaim = claim.data;
          if (["FULFILLED", "FAILED", "FAILED_VALIDATION", "NEEDS_INPUT"].includes(claim.data.status)) {
            summary.failed += claim.data.status === "FULFILLED" ? 0 : 1;
            continue;
          }
          const candidate = await loadBitrefillSingleItemCandidate(service, orderId, item.id);
          const pricing = await loadPricing(candidate);
          const quote = normalizeBitrefillSyntheticQuote(pricing.quote);
          if (decimalMicros(quote.maxAllowedSpend) > decimalMicros(binding.supplier_max_unit_cost)) {
            throw new Error("BITREFILL_QUOTE_SPEND_BLOCKED");
          }
          let balance;
          try { balance = await loadSupplierBalance(candidate, quote); }
          catch { throw new Error("BITREFILL_SUPPLIER_BALANCE_MANUAL_REVIEW"); }
          assertSyntheticBalance(balance, quote);
          const semanticContext = { ...validateLocalFinancialEvidence(candidate, financial, quote), quote };
          attempt = await runBitrefillSingleItemPurchase({ db, transport, candidate,
            ...pricing, quote, semanticContext, beforeSubmit: async () => {
              normalizeBitrefillSyntheticQuote(quote);
              const freshCandidate = await loadBitrefillSingleItemCandidate(service, orderId, item.id);
              prepareBitrefillSingleItem({ ...freshCandidate, ...pricing, quote });
              const freshFinancial = await loadFinancialEvidence(freshCandidate);
              const freshContext = { ...validateLocalFinancialEvidence(freshCandidate, freshFinancial, quote), quote };
              if (JSON.stringify(freshContext) !== JSON.stringify(semanticContext)) {
                const error = new Error("BITREFILL_P3_FROZEN_FINANCE_CHANGED");
                error.submitted = false;
                throw error;
              }
            } });
        }
        if (["SUBMITTING", "UNCERTAIN", "CLAIMED"].includes(attempt.status) || !attempt.invoiceId) {
          summary.uncertain += 1;
          // A CAS loser may observe the winner actively SUBMITTING. It must not
          // invalidate that worker's root or authorize any replacement submit.
          if (attempt.status === "UNCERTAIN") {
            await recordRootManualState(service, orderId, item.id, rootClaim, "UNCERTAIN", "BITREFILL_SUBMIT_UNCERTAIN");
          }
          continue;
        }
        // Re-read server payment state after the external request and before GET/delivery.
        await paidOrder(service, orderId);
        const result = await reconcileBitrefillSingleItem({ db, transport, attemptId: attempt.attemptId });
        for (const child of result.deliveryCandidates) {
          const guardDelivery = async () => {
            const freshOrder = await paidOrder(service, orderId);
            assertLocalPaymentEligibility(await loadFinancialEvidence({ order: freshOrder, orderItem: item }));
          };
          await guardDelivery();
          await deliverBitrefillSingleItem({ db, transport, childRowId: child.childRowId, beforePrivateWrite: guardDelivery });
          summary.fulfilled += 1;
        }
        if (result.deliveryCandidates.length === 0) {
          if (["FAILED", "REFUNDED"].includes(result.childStatus)) summary.failed += 1;
          else summary.uncertain += 1;
        }
      } catch (error) {
        // No raw supplier response, pricing error or secret escapes this boundary.
        const code = typeof error?.message === "string" ? error.message : "";
        if (/^BITREFILL_(?:UNKNOWN_CHILD|SINGLE_ITEM_MAPPING_REQUIRED|PRIVATE_DELIVERY_IDENTITY_MISMATCH)/.test(code)) {
          const roots = await rows(service, "supplier_fulfillment_requests",
            "request_id,attempt_token,status", "order_item_id", item.id);
          if (roots.length === 1 && roots[0].status === "PURCHASING") {
            await recordRootManualState(service, orderId, item.id, roots[0], "UNCERTAIN", "BITREFILL_CHILD_IDENTITY_MANUAL_REVIEW");
          }
        }
        if (/^BITREFILL_(?:SYNTHETIC_QUOTE|QUOTE_|P2_(?:NET_PROFIT|TRUSTED_FINANCIALS|FINANCIAL_EVIDENCE)|SUPPLIER_BALANCE|FRESH_PRODUCT|PACKAGE_DRIFT)/.test(code)) {
          await recordRootManualState(service, orderId, item.id, rootClaim, "FAILED_VALIDATION", "BITREFILL_PREPURCHASE_MANUAL_REVIEW");
        }
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
