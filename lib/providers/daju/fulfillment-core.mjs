import { decideDajuError, decideDajuOrderResult, joinDajuDeliveredSecrets } from "./workflow.mjs";

async function record(store, outcome) {
  try {
    await store.recordOutcome(outcome);
    return true;
  } catch {
    return false;
  }
}

function safeError(error) {
  if (error && typeof error === "object" && typeof error.code === "string") {
    return {
      code: error.code,
      kind: typeof error.kind === "string" ? error.kind : "http",
      orderCode: typeof error.orderCode === "string" ? error.orderCode : null,
    };
  }
  return { code: "UPSTREAM_UNAVAILABLE", kind: "transport", orderCode: null };
}

export async function fulfillDajuCandidates(input) {
  const summary = { handled: input.candidates.length, fulfilled: 0, failed: 0, uncertain: 0, needsInput: 0 };
  for (const candidate of input.candidates) {
    const requestId = input.createRequestId(candidate.orderId, candidate.orderItemId);
    if (!requestId) { summary.failed += 1; continue; }
    let claim;
    try {
      claim = await input.store.claim(candidate, requestId, input.triggerSource);
    } catch {
      summary.uncertain += 1;
      continue;
    }
    if (claim.action === "NONE") {
      if (claim.status === "FULFILLED") summary.fulfilled += 1;
      else if (["PURCHASING", "UNCERTAIN", "RECONCILIATION"].includes(claim.status)) summary.uncertain += 1;
      else summary.failed += 1;
      continue;
    }
    if (!candidate.binding || candidate.bindingInvalid) {
      await record(input.store, input.outcome(candidate, claim, requestId, "FAILED_VALIDATION", false, "SUPPLIER_BINDING_INVALID"));
      summary.failed += 1;
      continue;
    }

    let orderResult;
    if (claim.action === "QUERY") {
      if (!claim.orderCode) { summary.uncertain += 1; continue; }
      try {
        orderResult = await input.client.getOrder(claim.orderCode);
      } catch (error) {
        await record(input.store, input.outcome(candidate, claim, requestId, "RECONCILIATION", false, safeError(error).code, { orderCode: claim.orderCode }));
        summary.uncertain += 1;
        continue;
      }
    } else {
      let product;
      try {
        product = await input.client.getProduct(candidate.binding.productId);
      } catch (error) {
        await record(input.store, input.outcome(candidate, claim, requestId, "PENDING", true, safeError(error).code));
        summary.failed += 1;
        continue;
      }
      const readiness = input.validateReadiness({ product, binding: candidate.binding, quantity: candidate.quantity, orderFields: candidate.orderFields });
      if (!readiness.ok) {
        const state = readiness.code === "NEEDS_INPUT" ? "NEEDS_INPUT" : "FAILED_VALIDATION";
        await record(input.store, input.outcome(candidate, claim, requestId, state, false, readiness.code, { supplierUnitPrice: product.price }));
        if (state === "NEEDS_INPUT") summary.needsInput += 1; else summary.failed += 1;
        continue;
      }
      try {
        orderResult = await input.client.purchase({
          productId: candidate.binding.productId,
          requestId,
          quantity: candidate.quantity,
          sku: candidate.binding.sku,
          inputs: readiness.inputs,
        });
      } catch (error) {
        const safe = safeError(error);
        const decision = decideDajuError(safe);
        await record(input.store, input.outcome(candidate, claim, requestId, decision.state, decision.retryable, decision.code, {
          orderCode: safe.orderCode,
          supplierUnitPrice: product.price,
        }));
        if (decision.state === "UNCERTAIN") summary.uncertain += 1; else summary.failed += 1;
        continue;
      }
    }

    let decision = decideDajuOrderResult(orderResult);
    if (decision.kind === "query_order") {
      try {
        orderResult = await input.client.getOrder(decision.orderCode);
        decision = decideDajuOrderResult(orderResult);
      } catch (error) {
        await record(input.store, input.outcome(candidate, claim, requestId, "RECONCILIATION", false, safeError(error).code, {
          orderCode: decision.orderCode,
          supplierUnitPrice: orderResult.unitPrice,
          supplierTotalPrice: orderResult.totalPrice,
        }));
        summary.uncertain += 1;
        continue;
      }
    }
    if (decision.kind === "fulfilled") {
      const deliveredContent = joinDajuDeliveredSecrets(orderResult.delivered);
      if (!deliveredContent) { summary.uncertain += 1; continue; }
      const saved = await record(input.store, input.outcome(candidate, claim, requestId, "FULFILLED", false, null, {
        orderCode: orderResult.orderCode,
        deliveredContent,
        supplierUnitPrice: orderResult.unitPrice,
        supplierTotalPrice: orderResult.totalPrice,
      }));
      if (saved) summary.fulfilled += 1; else summary.uncertain += 1;
      continue;
    }
    await record(input.store, input.outcome(candidate, claim, requestId, "RECONCILIATION", false, decision.code ?? "DELIVERY_PENDING", {
      orderCode: orderResult.orderCode,
      supplierUnitPrice: orderResult.unitPrice,
      supplierTotalPrice: orderResult.totalPrice,
    }));
    summary.uncertain += 1;
  }
  return summary;
}

export async function reconcileDajuExistingCandidate(input) {
  const requestId = input.createRequestId(input.candidate.orderId, input.candidate.orderItemId);
  if (!requestId || !input.candidate.binding || input.candidate.bindingInvalid) {
    throw new Error("DAJU_RECONCILIATION_CANDIDATE_INVALID");
  }
  const claim = await input.store.claim(input.candidate, requestId, input.triggerSource);
  if (
    claim.action !== "NONE"
    || claim.status !== "PURCHASING"
    || !claim.attemptToken
    || (claim.orderCode && claim.orderCode !== input.orderCode)
  ) {
    throw new Error("DAJU_RECONCILIATION_STATE_CHANGED");
  }
  const order = await input.client.getOrder(input.orderCode);
  const validation = input.validateReconciliation({
    order,
    orderCode: input.orderCode,
    requestId,
    candidate: input.candidate,
  });
  if (!validation.ok) throw new Error(validation.code);
  const deliveredContent = joinDajuDeliveredSecrets(order.delivered);
  if (!deliveredContent) throw new Error("DAJU_RECONCILIATION_DELIVERY_MISSING");
  await input.store.recordOutcome(input.outcome(
    input.candidate,
    claim,
    requestId,
    "FULFILLED",
    false,
    null,
    {
      orderCode: order.orderCode,
      deliveredContent,
      supplierUnitPrice: order.unitPrice,
      supplierTotalPrice: order.totalPrice,
    }
  ));
  return { ok: true, orderCode: order.orderCode, requestId, deliveredCount: order.delivered.length };
}
