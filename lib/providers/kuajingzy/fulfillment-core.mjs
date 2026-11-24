import { createHash } from 'node:crypto';
import { classifySupplierSubmitBoundary } from '../core/purchase-identity-core.mjs';
import { freezeKuajingZyMallRequest, parseKuajingZyCny } from './mall-order-contract.mjs';
import { assertKuajingZyCanaryScope } from './canary-scope.mjs';
import { KUAJINGZY_DURABLE_SUBMIT, commitKuajingZyPrivateDelivery, classifyKuajingZyOrder } from './purchase-client.mjs';
import { assertKuajingZyPurchaseGates, assertKuajingZyFinancials, inspectKuajingZyProduct,
  formatCny, cny, micros, need } from './purchase-policy.mjs';

const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const money6 = n => (n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');
export function createKuajingZyRequestId(orderId, orderItemId) {
  need(/^[A-Za-z0-9_-]{1,60}$/.test(orderId ?? '') && /^[A-Za-z0-9_-]{1,60}$/.test(orderItemId ?? ''), 'REQUEST_ID_INVALID');
  const key = 'jianlian:'+orderId+':'+orderItemId;
  need(key.length <= 120, 'REQUEST_ID_TOO_LONG'); return key;
}
export function createKuajingZyFrozenUnits(candidate, rootId, expectedAmount) {
  const total = parseKuajingZyCny(expectedAmount)*100n, q = BigInt(candidate.quantity);
  const base = total/q, remainder = total%q;
  // Exact allocation of the confirmed aggregate across existing V1.3 units.
  // No new frozen-payload table/metadata, and no lossy aggregate division.
  return Array.from({length:candidate.quantity},(_,i)=>{
    const cost = base + (BigInt(i) < remainder ? 1n : 0n);
    need(cost > 0n && cost <= parseKuajingZyCny(candidate.binding.maxUnitCost)*100n, 'UNIT_COST_ALLOCATION_INVALID');
    return {fulfillment_request_id:rootId,order_item_id:candidate.orderItemId,unit_index:i+1,
      frozen_product_id:candidate.binding.productId,frozen_package_id:candidate.binding.sku,
      frozen_currency:'CNY',frozen_face_value:null,quoted_unit_cost:money6(cost),
      max_unit_cost:money6(parseKuajingZyCny(candidate.binding.maxUnitCost)*100n)};
  });
}
function reconstruct(candidate, key, units) {
  need(units.length === candidate.quantity && units.length > 0
    && new Set(units.map(x=>x.fulfillment_request_id)).size === 1, 'FROZEN_UNITS_MISMATCH');
  let amount = 0n;
  const canonical = units.map((u,i)=>{
    need(u.order_item_id === candidate.orderItemId && u.unit_index === i+1
      && u.frozen_product_id === candidate.binding.productId && u.frozen_package_id === candidate.binding.sku
      && u.frozen_currency === 'CNY' && u.frozen_face_value == null
      && parseKuajingZyCny(cny(u.max_unit_cost)) === parseKuajingZyCny(candidate.binding.maxUnitCost), 'FROZEN_IDENTITY_DRIFT');
    const cost = micros(u.quoted_unit_cost);
    need(cost > 0n && cost <= parseKuajingZyCny(candidate.binding.maxUnitCost)*100n, 'FROZEN_COST_INVALID');
    amount += cost;
    return {...u,quoted_unit_cost:money6(cost),max_unit_cost:money6(parseKuajingZyCny(candidate.binding.maxUnitCost)*100n)};
  });
  need(amount%1000n === 0n, 'FROZEN_CONFIRMATION_PRECISION');
  const expectedAmount = money6(amount).slice(0,-3);
  const frozen = freezeKuajingZyMallRequest({key,itemId:candidate.binding.productId,
    skuId:candidate.binding.sku ?? undefined,quantity:candidate.quantity,expectedAmount});
  // Persisted hash commits the exact wire body/key plus immutable per-unit
  // allocations and frozen website binding. Reconstructible after a crash.
  const identity = canonical.map(({fulfillment_request_id,order_item_id,unit_index,frozen_product_id,
    frozen_package_id,frozen_currency,frozen_face_value,quoted_unit_cost,max_unit_cost})=>({
      fulfillment_request_id,order_item_id,unit_index,frozen_product_id,frozen_package_id,
      frozen_currency,frozen_face_value,quoted_unit_cost,max_unit_cost}));
  return { frozen, expectedAmount, semanticHash:hash({key,body:frozen.body,units:identity,binding:candidate.binding}) };
}
function verify(attempt, candidate, key, units) {
  need(attempt.supplier === 'kuajingzy' && attempt.logical_request_key === key, 'ATTEMPT_IDENTITY_MISMATCH');
  const frozen = reconstruct(candidate,key,units);
  need(attempt.semantic_request_hash === frozen.semanticHash, 'FROZEN_REQUEST_DRIFT');
  return frozen;
}
const outcome = (state, classification, extra={}) => Object.freeze({state,classification,fulfilled:false,...extra});

export async function reconcileKuajingZyAttempt({db,client,candidate,attempt}) {
  const key = createKuajingZyRequestId(candidate.orderId,candidate.orderItemId);
  const saved = verify(attempt,candidate,key,await db.items(attempt.id));
  if (attempt.status === 'SUCCEEDED') return outcome('SUCCEEDED','ORDER_COMPLETED',{fulfilled:true,idempotent:true});
  if (!['EXTERNAL_CREATED','RECONCILING'].includes(attempt.status) || !attempt.external_invoice_id) {
    const next = classifySupplierSubmitBoundary({submitMayHaveLeft:true,externalInvoiceId:attempt.external_invoice_id});
    return outcome('UNCERTAIN','DEBIT_UNCONFIRMED',{next:next.next});
  }
  let result;
  try {
    result = await client.getOrder(attempt.external_invoice_id,{
      itemId:candidate.binding.productId,skuId:candidate.binding.sku,
      quantity:candidate.quantity,expectedAmount:saved.expectedAmount});
  } catch {
    await db.evidence(attempt.id,'UNKNOWN','QUERY_FAILED',hash([attempt.id,'QUERY_FAILED']));
    return outcome('RECONCILIATION','DEBIT_UNCONFIRMED',{next:'QUERY_ONLY'});
  }
  const valid = result.orderCode === attempt.external_invoice_id && result.itemId === candidate.binding.productId
    && result.skuId === candidate.binding.sku && result.quantity === candidate.quantity
    && result.currency === 'CNY' && parseKuajingZyCny(result.totalPrice) === parseKuajingZyCny(saved.expectedAmount);
  const classification = classifyKuajingZyOrder(result);
  const fingerprint = hash([attempt.id,result.orderCode,result.status,result.totalPrice,result.refundStatus,result.refundAmount]);
  if (!valid || result.refundStatus !== 'none' || result.status === 'cancelled') {
    await db.evidence(attempt.id,'UNKNOWN',!valid?'IDENTITY_OR_COST_MISMATCH':'REFUND_OR_CANCELLED',fingerprint);
    await db.manualReview(attempt.id);
    return outcome('MANUAL_REVIEW',classification ?? 'DEBIT_UNCONFIRMED');
  }
  if (result.status !== 'completed') {
    await db.evidence(attempt.id,'PROCESSING','PROVIDER_STATE',fingerprint);
    return outcome('RECONCILIATION',classification,{next:'QUERY_ONLY'});
  }
  if (!result.deliveryPresent || result.deliveryCount !== candidate.quantity) {
    await db.evidence(attempt.id,'UNKNOWN','DELIVERY_COUNT_MISMATCH',fingerprint);
    await db.manualReview(attempt.id);
    return outcome('MANUAL_REVIEW','DEBIT_UNCONFIRMED');
  }
  try { await db.evidence(attempt.id,'DELIVERED','KUAJINGZY_AUTHORITATIVE_DELIVERED',fingerprint); }
  catch (error) {
    if ((await db.get(attempt.id)).status==='SUCCEEDED') return outcome('SUCCEEDED','ORDER_COMPLETED',{fulfilled:true,idempotent:true});
    throw error;
  }
  try {
    await commitKuajingZyPrivateDelivery(result,content=>db.deliver(attempt,content,result));
  } catch (error) {
    if(error?.message==='KUAJINGZY_PRIVATE_DELIVERY_NOT_VERIFIED') {
      await db.manualReview(attempt.id);
      return outcome('MANUAL_REVIEW','DEBIT_UNCONFIRMED');
    }
    // Validated count but duplicate/invalid secret or commit failure. The raw
    // secret never leaves the private boundary, including in thrown errors.
    return outcome('RECONCILIATION','DEBIT_UNCONFIRMED',{next:'QUERY_ONLY'});
  }
  return outcome('SUCCEEDED','ORDER_COMPLETED',{fulfilled:true});
}

export async function fulfillKuajingZyCandidate({db,client,candidate,env={},releaseGate=false,clock=Date.now,pollDelaysMs=[]}) {
  need(candidate && candidate.binding && !candidate.bindingInvalid
    && Number.isSafeInteger(candidate.quantity) && candidate.quantity>=1 && candidate.quantity<=20, 'CANDIDATE_INVALID');
  const key = createKuajingZyRequestId(candidate.orderId,candidate.orderItemId);
  let attempt = await db.find(key);
  // Recovery is permitted with purchase gates disabled, but can never POST.
  if (attempt && attempt.status !== 'CLAIMED') return reconcileKuajingZyAttempt({db,client,candidate,attempt});
  const cap = assertKuajingZyPurchaseGates({env,binding:candidate.binding,releaseGate});
  assertKuajingZyCanaryScope(candidate,env,cap);
  const orderCap = await db.orderCost(candidate.orderId);
  need(orderCap <= cap, 'ORDER_CAP_EXCEEDED');
  let saved;
  if (attempt) {
    saved = verify(attempt,candidate,key,await db.items(attempt.id));
  } else {
    const quote = inspectKuajingZyProduct({...await client.getProduct(candidate.binding.productId),candidate});
    assertKuajingZyFinancials(candidate,quote.expectedAmount,clock());
    const root = await db.root(candidate,key);
    const units = createKuajingZyFrozenUnits(candidate,root.id,quote.expectedAmount);
    saved = reconstruct(candidate,key,units);
    const claim = await db.claim(key,saved.semanticHash,units);
    need(['CLAIMED','ALREADY_CLAIMED'].includes(claim.result) && claim.attempt_id, 'CLAIM_FAILED');
    attempt = await db.get(claim.attempt_id);
    saved = verify(attempt,candidate,key,await db.items(attempt.id));
    if (attempt.status !== 'CLAIMED') return reconcileKuajingZyAttempt({db,client,candidate,attempt});
  }
  // CLAIMED is provably before submission. Recheck everything on crash resume.
  const quote = inspectKuajingZyProduct({...await client.getProduct(candidate.binding.productId),candidate});
  need(parseKuajingZyCny(quote.expectedAmount) === parseKuajingZyCny(saved.expectedAmount), 'FROZEN_QUOTE_CHANGED');
  const balance = await client.getBalance();
  need(balance.currency === 'CNY' && parseKuajingZyCny(cny(balance.availableBalance)) >= parseKuajingZyCny(saved.expectedAmount), 'BALANCE_INSUFFICIENT');
  const fresh = await db.revalidate(candidate);
  const freshCap = assertKuajingZyPurchaseGates({env,binding:fresh.binding,releaseGate});
  assertKuajingZyCanaryScope(fresh,env,freshCap);
  need(fresh.orderId === candidate.orderId && fresh.orderItemId === candidate.orderItemId
    && fresh.orderUserId === candidate.orderUserId && fresh.paymentMethod === candidate.paymentMethod,
  'PRE_SUBMIT_IDENTITY_CHANGED');
  need(JSON.stringify(fresh.binding) === JSON.stringify(candidate.binding) && fresh.quantity === candidate.quantity, 'PRE_SUBMIT_IDENTITY_CHANGED');
  assertKuajingZyFinancials(fresh,saved.expectedAmount,clock());
  need(await db.orderCost(candidate.orderId) <= freshCap, 'ORDER_CAP_EXCEEDED');
  const submit = await db.transition(attempt.id,'CLAIMED','SUBMITTING');
  if (submit.result !== 'TRANSITIONED' || submit.status !== 'SUBMITTING') return outcome('UNCERTAIN','DEBIT_UNCONFIRMED',{next:'OBSERVE_DURABLE_STATE'});
  let result;
  try { result = await client.purchase(saved.frozen,KUAJINGZY_DURABLE_SUBMIT,fresh.binding); }
  catch (error) {
    // Also persist proven no-debit responses as non-retryable. Unknown errors,
    // crashes and conflict responses cannot turn into a fresh purchase.
    await db.transition(attempt.id,'SUBMITTING','UNCERTAIN');
    const safeCode = [
      typeof error?.code === 'string' && /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : 'UNKNOWN',
      Number.isInteger(error?.httpStatus) ? String(error.httpStatus) : null,
      typeof error?.providerCode === 'string' && /^[A-Z0-9_]{1,60}$/.test(error.providerCode) ? error.providerCode : null,
    ].filter(Boolean).join(':');
    if (typeof db.recordErrorCode === 'function') {
      await db.recordErrorCode(attempt.id, safeCode).catch(() => {});
    }
    console.warn('[kuajingzy] submit uncertain', { attemptId: attempt.id, safeCode, classification: error?.classification ?? null });
    const allowed = ['NO_DEBIT_PRICE_CHANGED','NO_DEBIT_INSUFFICIENT_BALANCE','IDEMPOTENCY_CONFLICT'];
    return outcome('UNCERTAIN',allowed.includes(error?.classification)?error.classification:'DEBIT_UNCONFIRMED',{next:'MANUAL_REVIEW'});
  }
  // Persist external ID BEFORE GET/materialization. A failed write leaves the
  // durable SUBMITTING state; replay is manual review, never another purchase.
  await db.transition(attempt.id,'SUBMITTING','EXTERNAL_CREATED',result.orderCode);
  let reconciled = await reconcileKuajingZyAttempt({db,client,candidate,attempt:await db.get(attempt.id)});
  for (const delayMs of pollDelaysMs) {
    if (reconciled.fulfilled || reconciled.state !== 'RECONCILIATION' || reconciled.classification !== 'ORDER_PROCESSING') break;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    reconciled = await reconcileKuajingZyAttempt({db,client,candidate,attempt:await db.get(attempt.id)});
  }
  return reconciled;
}
