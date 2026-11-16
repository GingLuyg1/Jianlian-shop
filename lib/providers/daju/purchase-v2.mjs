import { createHash } from "node:crypto";
import { validateDajuPurchaseReadiness, compareDajuDecimal } from "./mapper.mjs";
import { createDajuRequestId } from "./protocol.mjs";
import { joinDajuDeliveredSecrets } from "./workflow.mjs";

const fail = code => { throw new Error(code); };
export function money(value) {
  const s = String(value ?? "");
  if (!/^(0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(s)) fail("DAJU_V2_MONEY_INVALID");
  const [a,b=""] = s.split("."); return BigInt(a)*1000000n+BigInt(b.padEnd(6,"0"));
}
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonicalMoney = value => { const n=money(value);return `${n/1000000n}.${String(n%1000000n).padStart(6,"0")}`; };
const inputIdentity = candidate => Object.entries(candidate.binding.inputsMapping).sort(([a],[b])=>a.localeCompare(b)).map(([field,source])=>[field,String(candidate.orderFields[source]??"")]);
export function purchasePolicy(env, orderId) {
  if (env.SUPPLIER_AUTO_PURCHASE_ENABLED !== "true") fail("DAJU_V2_MASTER_DISABLED");
  // General enabled mode remains deliberately unavailable before a canary release.
  if (env.DAJU_AUTO_PURCHASE_MODE !== "canary" || !env.DAJU_AUTO_PURCHASE_CANARY_ORDER_ID || env.DAJU_AUTO_PURCHASE_CANARY_ORDER_ID !== orderId) fail("DAJU_V2_CANARY_DISABLED");
  const cap = money(env.DAJU_AUTO_PURCHASE_MAX_ORDER_CNY);
  if (cap <= 0n) fail("DAJU_V2_CAP_INVALID"); return cap;
}
function inspect(product, candidate) {
  const ready = validateDajuPurchaseReadiness({ product, binding: candidate.binding, quantity: candidate.quantity, orderFields: candidate.orderFields });
  if (!ready.ok) fail("DAJU_V2_READINESS_FAILED");
  if (product.isSku && (!candidate.binding.sku || !product.skuVariants.some(x => (typeof x === "string" ? x : x.sku) === candidate.binding.sku))) fail("DAJU_V2_SKU_MISMATCH");
  if (!product.isSku && candidate.binding.sku) fail("DAJU_V2_SKU_MISMATCH");
  return { price: canonicalMoney(product.price), id: product.id, sku: candidate.binding.sku, required: [...product.requiredInputs].sort(), inputs: ready.inputs };
}
export function frozenUnits(candidate, rootId, price) {
  if (!Number.isSafeInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 20 || !candidate.binding || candidate.bindingInvalid) fail("DAJU_V2_CANDIDATE_INVALID");
  return Array.from({length:candidate.quantity}, (_,i) => ({fulfillment_request_id:rootId,order_item_id:candidate.orderItemId,unit_index:i+1,frozen_product_id:String(candidate.binding.productId),frozen_package_id:candidate.binding.sku,frozen_currency:"CNY",frozen_face_value:null,quoted_unit_cost:canonicalMoney(price),max_unit_cost:canonicalMoney(candidate.binding.maxUnitCost)}));
}

// No POST here. Both paid-order replay and the GET-only worker use this bridge.
export async function reconcileDajuAttempt({ db, client, attempt }) {
  if (attempt.status === "SUCCEEDED") return { fulfilled: true, idempotent: true };
  if (!["EXTERNAL_CREATED","RECONCILING"].includes(attempt.status) || !attempt.external_invoice_id) return { uncertain: true };
  const units = await db.items(attempt.id);
  if (!units.length || new Set(units.map(x=>x.order_item_id)).size !== 1 || new Set(units.map(x=>x.fulfillment_request_id)).size !== 1) fail("DAJU_V2_MIXED_ATTEMPT");
  let order;
  try { order = await client.getOrder(attempt.external_invoice_id); }
  catch { await db.evidence(attempt.id,"UNKNOWN","QUERY_FAILED",hash([attempt.id,"QUERY_FAILED"])); return {uncertain:true}; }
  const sample = units[0];
  const valid = order.orderCode === attempt.external_invoice_id && order.requestId === attempt.logical_request_key
    && String(order.productId) === sample.frozen_product_id && order.sku === sample.frozen_package_id
    && order.quantity === units.length && units.every(x=>x.frozen_product_id===sample.frozen_product_id && x.frozen_package_id===sample.frozen_package_id && x.frozen_currency==="CNY" && compareDajuDecimal(order.unitPrice,x.quoted_unit_cost)===0 && compareDajuDecimal(order.unitPrice,x.max_unit_cost)<=0)
    && money(order.totalPrice) === money(order.unitPrice)*BigInt(units.length);
  if (!valid) { await db.evidence(attempt.id,"UNKNOWN","IDENTITY_OR_COST_MISMATCH",hash([attempt.id,"MISMATCH"])); return {uncertain:true}; }
  const status = String(order.status).toLowerCase();
  const delivered = ["fulfilled","completed","delivered","succeeded"].includes(status);
  const content = delivered ? joinDajuDeliveredSecrets(order.delivered) : null;
  if (delivered && (!content || order.delivered.length !== units.length)) { await db.evidence(attempt.id,"UNKNOWN","DELIVERY_INVALID",hash([attempt.id,"DELIVERY_INVALID"])); return {uncertain:true}; }
  const normalized = delivered ? "DELIVERED" : ["failed","rejected","cancelled","canceled"].includes(status) ? "FAILED" : status === "refunded" ? "REFUNDED" : ["processing","in_progress"].includes(status) ? "PROCESSING" : ["pending","created","waiting"].includes(status) ? "PENDING" : "UNKNOWN";
  const fingerprint = hash([attempt.id,order.orderCode,order.requestId,order.quantity,order.unitPrice,order.totalPrice,normalized]);
  try {
    await db.evidence(attempt.id,normalized,delivered?"DAJU_AUTHORITATIVE_DELIVERED":"PROVIDER_STATE",fingerprint);
  } catch (error) {
    // Another GET-only worker may have completed the same atomic delivery.
    if (db.get) {
      try { if ((await db.get(attempt.id)).status === "SUCCEEDED") return {fulfilled:true,idempotent:true}; }
      catch { /* Preserve the original evidence failure. */ }
    }
    throw error;
  }
  if (!delivered) return {uncertain:true};
  await db.deliver(attempt.id, fingerprint, content); return {fulfilled:true};
}

export async function purchaseDajuV2({ db, client, candidate, env = process.env }) {
  const key = createDajuRequestId(candidate.orderId,candidate.orderItemId);
  if (!key || !candidate.binding || candidate.bindingInvalid || !Number.isSafeInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 20) fail("DAJU_V2_CANDIDATE_INVALID");
  const existing = await db.find(key);
  if (existing) {
    const units = await db.items(existing.id);
    if (!units.length || units.length !== candidate.quantity || units.some(x=>x.order_item_id!==candidate.orderItemId || x.frozen_product_id!==String(candidate.binding.productId) || x.frozen_package_id!==candidate.binding.sku || compareDajuDecimal(x.max_unit_cost,candidate.binding.maxUnitCost)!==0)) fail("DAJU_V2_SEMANTIC_DRIFT");
    if (hash({key,units:frozenUnits(candidate,units[0].fulfillment_request_id,units[0].quoted_unit_cost),inputs:inputIdentity(candidate)}) !== existing.semantic_request_hash) fail("DAJU_V2_SEMANTIC_DRIFT");
    return reconcileDajuAttempt({db,client,attempt:existing});
  }
  const cap = purchasePolicy(env,candidate.orderId);
  if (money(candidate.binding.maxUnitCost)*BigInt(candidate.quantity) > cap) fail("DAJU_V2_ORDER_CAP_EXCEEDED");
  if (await db.orderCost(candidate.orderId) > cap) fail("DAJU_V2_ORDER_CAP_EXCEEDED");
  const first = inspect(await client.getProduct(candidate.binding.productId),candidate);
  const root = await db.root(candidate,key);
  if (!root.id || !root.attempt_token || root.request_id !== key || root.status !== "PURCHASING") fail("DAJU_V2_ROOT_INVALID");
  const units = frozenUnits(candidate,root.id,first.price);
  const semantic = hash({key,units,inputs:inputIdentity(candidate)});
  const claim = await db.claim(key,semantic,units);
  if (!claim.attempt_id || !["CLAIMED","ALREADY_CLAIMED"].includes(claim.result)) fail("DAJU_V2_CLAIM_FAILED");
  if (claim.result !== "CLAIMED") return reconcileDajuAttempt({db,client,attempt:await db.get(claim.attempt_id)});
  const second = inspect(await client.getProduct(candidate.binding.productId),candidate);
  if (hash(first)!==hash(second)) fail("DAJU_V2_FRESH_DETAIL_DRIFT");
  const balance = await client.getBalance();
  if (money(balance.balance) < money(candidate.binding.maxUnitCost)*BigInt(candidate.quantity)) fail("DAJU_V2_BALANCE_INSUFFICIENT");
  purchasePolicy(env,candidate.orderId);
  const submit = await db.transition(claim.attempt_id,"CLAIMED","SUBMITTING");
  if (submit.result !== "TRANSITIONED" || submit.status !== "SUBMITTING") return {uncertain:true};
  let result;
  try {
    result = await client.purchase({productId:candidate.binding.productId,requestId:key,quantity:candidate.quantity,sku:candidate.binding.sku,inputs:second.inputs});
    if (typeof result?.orderCode !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(result.orderCode)) fail("DAJU_V2_RESPONSE_INVALID");
  } catch {
    await db.transition(claim.attempt_id,"SUBMITTING","UNCERTAIN"); return {uncertain:true};
  }
  const saved = await db.transition(claim.attempt_id,"SUBMITTING","EXTERNAL_CREATED",result.orderCode);
  if (!["TRANSITIONED","ALREADY_REGISTERED"].includes(saved.result)) return {uncertain:true};
  return reconcileDajuAttempt({db,client,attempt:await db.get(claim.attempt_id)});
}
