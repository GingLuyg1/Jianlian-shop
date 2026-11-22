import { parseKuajingZyBinding, cny, micros, need } from './purchase-policy.mjs';
import { parseKuajingZyCny } from './mall-order-contract.mjs';

const AUTO = new Set(['automatic','auto','card','account','auto_delivery']);
const money6 = n => (n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');
const read = async q => { const x=await q; need(!x.error && x.data != null,'STORE_READ_FAILED');return x.data; };

/** Uses existing generic supplier RPCs and immutable V1.3 units.
 * verifiedCosts is a trusted server accounting adapter, NEVER a public body,
 * customer fee_amount, assumed zero, provider response or browser snapshot.
 */
export function createKuajingZyPurchaseStore(service, {verifiedCosts, clock=Date.now, triggerSource='kuajingzy_v1'} = {}) {
  const rpc = async(name,args)=>{
    const x=await service.rpc(name,args); need(!x.error && x.data != null,'STORE_RPC_FAILED');return x.data;
  };
  const getAttempt = async id => read(service.from('supplier_purchase_attempts').select('*').eq('supplier','kuajingzy').eq('id',id).single());
  async function candidates(orderId, requireFinancials=true) {
    const order = await read(service.from('orders').select('id,user_id,payment_status,payment_method,status,currency,total_amount').eq('id',orderId).single());
    need(order.id === orderId && order.payment_status === 'paid' && order.currency === 'CNY'
      && !['cancelled','expired','refunded','failed'].includes(order.status),'ORDER_NOT_ELIGIBLE');
    const items = await read(service.from('order_items').select('id,order_id,product_id,sku_id,quantity,line_total,delivery_type,delivery_status,product_snapshot').eq('order_id',orderId).order('id'));
    const totalLines = items.reduce((n,i)=>n+micros(i.line_total),0n);
    const paid = micros(order.total_amount);
    need(totalLines>0n && paid>0n && paid<=totalLines,'PAID_ALLOCATION_INVALID');
    const targets = items.filter(i=>AUTO.has(i.delivery_type) && i.delivery_status !== 'delivered'
      && i.product_snapshot?.supplier_binding?.supplier==='kuajingzy');
    if (!targets.length) return [];
    let costs;
    if (requireFinancials) {
      need(order.payment_method==='balance','VERIFIED_PAYMENT_METHOD_UNSUPPORTED');
      need(typeof verifiedCosts==='function','VERIFIED_PAYMENT_COST_ADAPTER_REQUIRED');
      costs = await verifiedCosts(orderId);
      need(costs?.source==='verified_payment_costs' && costs.orderId===orderId
        && costs.settlementKind==='balance_ledger' && typeof costs.settlementId==='string'
        && costs.provider==='internal_balance' && costs.currency==='CNY'
        && costs.costScope==='order_settlement_only'
        && Number.isFinite(Date.parse(costs.checkedAt)) && Date.parse(costs.checkedAt)<=clock()
        && clock()-Date.parse(costs.checkedAt)<=60000, 'VERIFIED_PAYMENT_COST_EVIDENCE_REQUIRED');
      need(micros(costs.paymentFee)===0n && micros(costs.otherFees)===0n,
        'VERIFIED_PAYMENT_COST_EVIDENCE_REQUIRED');
    }
    return targets.map(i=>{
      need(i.order_id===orderId && Number.isSafeInteger(i.quantity) && i.quantity>=1 && i.quantity<=20,'ITEM_INVALID');
      const binding = parseKuajingZyBinding(i.product_snapshot.supplier_binding,i.product_id,i.sku_id);
      return {orderId,orderItemId:i.id,orderUserId:order.user_id,paymentMethod:order.payment_method,
        quantity:i.quantity,binding,bindingInvalid:false,orderFields:{},
        financials:costs ? {source:'verified_paid_order_allocation',orderId,orderItemId:i.id,currency:'CNY',
          paymentState:'paid',paidItemAmount:money6(paid*micros(i.line_total)/totalLines),
          // Charge the full order's known costs against each candidate, a
          // conservative bound. Never confuse the customer's fee with costs.
          paymentFee:String(costs.paymentFee),otherFees:String(costs.otherFees),checkedAt:costs.checkedAt} : null};
    });
  }
  return Object.freeze({
    loadCandidates:candidates,
    async revalidate(candidate) {
      const fresh=(await candidates(candidate.orderId)).find(x=>x.orderItemId===candidate.orderItemId);
      need(fresh,'ORDER_ITEM_NO_LONGER_PURCHASABLE');return fresh;
    },
    async orderCost(orderId) {
      const items=await read(service.from('order_items').select('quantity,product_id,sku_id,product_snapshot').eq('order_id',orderId));
      let total=0n;
      for(const i of items) {
        const raw=i.product_snapshot?.supplier_binding;
        if(raw?.supplier!=='kuajingzy')continue;
        const b=parseKuajingZyBinding(raw,i.product_id,i.sku_id);
        need(Number.isSafeInteger(i.quantity)&&i.quantity>0&&i.quantity<=20,'ORDER_QUANTITY_INVALID');
        total+=parseKuajingZyCny(b.maxUnitCost)*BigInt(i.quantity);
      }
      return total;
    },
    async find(key) {
      const x=await service.from('supplier_purchase_attempts').select('*').eq('supplier','kuajingzy').eq('logical_request_key',key).maybeSingle();
      need(!x.error,'ATTEMPT_READ_FAILED');return x.data;
    },
    get:getAttempt,
    items:id=>read(service.from('supplier_purchase_attempt_items').select('*').eq('attempt_id',id).order('unit_index')),
    async root(candidate,key) {
      const marker='kuajingzy_v1:'+String(triggerSource).replace(/[^A-Za-z0-9_:-]/g,'_').slice(0,50);
      const claim=await rpc('claim_supplier_fulfillment',{p_supplier:'kuajingzy',p_order_id:candidate.orderId,
        p_order_item_id:candidate.orderItemId,p_request_id:key,p_supplier_product_id:candidate.binding.productId,
        p_supplier_sku:candidate.binding.sku,p_trigger_source:marker});
      const root=await read(service.from('supplier_fulfillment_requests')
        .select('id,status,request_id,attempt_token,provider_order_code,trigger_source,order_id,order_item_id,supplier,supplier_product_id,supplier_sku')
        .eq('order_item_id',candidate.orderItemId).eq('supplier','kuajingzy').single());
      need(root.request_id===key && root.status==='PURCHASING' && root.attempt_token
        && root.order_id===candidate.orderId && root.order_item_id===candidate.orderItemId
        && root.supplier_product_id===candidate.binding.productId && root.supplier_sku===candidate.binding.sku
        && root.provider_order_code===null && /^kuajingzy_v1:[A-Za-z0-9_:-]{1,50}$/.test(root.trigger_source ?? ''),'ROOT_REQUIRES_MANUAL_REVIEW');
      need(claim.action==='PURCHASE' || claim.action==='NONE' && claim.status==='PURCHASING','ROOT_CLAIM_INVALID');
      return root;
    },
    claim:(key,semantic,units)=>rpc('internal_supplier_purchase_claim',{
      p_supplier:'kuajingzy',p_logical_key:key,p_semantic_hash:semantic,p_items:units}),
    transition:(id,from,to,invoice=null)=>rpc('internal_supplier_purchase_transition',{
      p_attempt_id:id,p_expected_status:from,p_next_status:to,p_external_invoice_id:invoice}),
    evidence:(id,status,resultClass,fingerprint)=>rpc('internal_supplier_purchase_record_evidence',{
      p_attempt_id:id,p_external_order_row_id:null,p_status:status,p_result_class:resultClass,
      p_safe_fingerprint:fingerprint,p_checked_at:new Date(clock()).toISOString()}),
    async manualReview(id) {
      const x=await service.from('supplier_purchase_attempts').update({status:'MANUAL_REVIEW'})
        .eq('supplier','kuajingzy').eq('id',id).in('status',['EXTERNAL_CREATED','RECONCILING']);
      need(!x.error,'MANUAL_REVIEW_WRITE_FAILED');
    },
    async deliver(attempt,content,result) {
      const units=await read(service.from('supplier_purchase_attempt_items').select('fulfillment_request_id').eq('attempt_id',attempt.id));
      need(units.length===result.quantity && new Set(units.map(x=>x.fulfillment_request_id)).size===1,'PRIVATE_ROOT_INVALID');
      const root=await read(service.from('supplier_fulfillment_requests').select('*').eq('id',units[0].fulfillment_request_id).single());
      need(root.supplier==='kuajingzy' && root.request_id===attempt.logical_request_key
        && root.attempt_token && ['PURCHASING','FULFILLED'].includes(root.status),'PRIVATE_ROOT_MISMATCH');
      const delivered=await read(service.from('order_deliveries')
        .select('delivery_no,delivery_type').eq('order_item_id',root.order_item_id).eq('delivery_status','delivered'));
      need(!delivered.length || delivered.length===1 && delivered[0].delivery_type==='supplier_delivery'
        && delivered[0].delivery_no===attempt.external_invoice_id,'DELIVERY_ALREADY_SATISFIED_ELSEWHERE');
      // Existing atomic RPC owns order_items + order_deliveries + private
      // digital_delivery_secrets + logs + refresh_order_fulfillment_status.
      const outcome=await rpc('record_supplier_fulfillment_outcome',{p_supplier:'kuajingzy',p_order_id:root.order_id,
        p_order_item_id:root.order_item_id,p_request_id:root.request_id,p_attempt_token:root.attempt_token,
        p_status:'FULFILLED',p_retryable:false,p_error_code:null,p_provider_order_code:attempt.external_invoice_id,
        p_delivery_content:content,p_supplier_unit_price:result.unitPrice,p_supplier_total_price:result.totalPrice,
        p_trigger_source:'kuajingzy_v1_private_delivery'});
      need(outcome.ok===true && outcome.status==='FULFILLED','PRIVATE_OUTCOME_NOT_COMMITTED');
      const committed=await read(service.from('order_deliveries').select('delivery_no,delivery_type')
        .eq('order_item_id',root.order_item_id).eq('delivery_status','delivered'));
      need(committed.length===1 && committed[0].delivery_type==='supplier_delivery'
        && committed[0].delivery_no===attempt.external_invoice_id,'PRIVATE_DELIVERY_COMMIT_UNVERIFIED');
      // A crash here is recoverable: the same RPC returns idempotent FULFILLED;
      // the immutable attempt can only be finalized, never re-submitted.
      const x=await service.from('supplier_purchase_attempts').update({status:'SUCCEEDED'})
        .eq('supplier','kuajingzy').eq('id',attempt.id).in('status',['EXTERNAL_CREATED','RECONCILING','SUCCEEDED']);
      need(!x.error,'ATTEMPT_FINALIZE_FAILED');
      need((await getAttempt(attempt.id)).status==='SUCCEEDED','ATTEMPT_FINALIZE_UNVERIFIED');
    },
  });
}
