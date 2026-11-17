const fail=code=>{throw new Error('MERCHANT_COST_'+code);};
const need=(ok,code)=>{if(!ok)fail(code);};
export function settlementMicros(value) {
  const text=typeof value==='number'&&Number.isFinite(value)?String(value):value;
  need(typeof text==='string'&&/^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(text),'DECIMAL_INVALID');
  const [a,b='']=text.split('.'),n=BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));
  need(typeof value!=='number'||n<=BigInt(Number.MAX_SAFE_INTEGER),'NUMERIC_UNSAFE');
  return n;
}
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const read=async q=>{let r;try{r=await q;}catch{fail('READ_FAILED');}need(r&&!r.error&&r.data!=null,'READ_FAILED');return r.data;};
/** Fresh read of the existing internal balance settlement, no mutations.
 * Zero is a structural order-settlement contract, NOT recharge funding costs.
 */
export async function getVerifiedMerchantCostsForOrderCore(service,orderId,{clock=Date.now,maxReadAgeMs=30000}={}) {
  need(uuid(orderId)&&service&&typeof service.from==='function','INPUT_INVALID');
  need(Number.isSafeInteger(maxReadAgeMs)&&maxReadAgeMs>0&&maxReadAgeMs<=60000,'TTL_INVALID');
  const started=clock();
  const load=()=>read(service.from('orders').select('id,user_id,payment_status,payment_method,currency,total_amount').eq('id',orderId).single());
  const order=await load();
  const eligible=o=>o.id===orderId&&uuid(o.user_id)&&o.payment_status==='paid'&&o.payment_method==='balance'&&o.currency==='CNY';
  need(eligible(order),'ORDER_UNSUPPORTED_OR_UNPAID');
  const rows=await read(service.from('balance_transactions')
    .select('id,transaction_no,user_id,business_type,business_id,direction,status,currency,amount,balance_before,balance_after')
    .eq('business_type','order_payment').eq('business_id',orderId)
    .eq('direction','debit').eq('status','completed').eq('currency','CNY').limit(2));
  need(Array.isArray(rows)&&rows.length===1,'LEDGER_EXACT_MATCH_REQUIRED');
  const t=rows[0];
  need(uuid(t.id)&&typeof t.transaction_no==='string'&&/^[A-Za-z0-9:_-]{1,120}$/.test(t.transaction_no)
    && t.user_id===order.user_id&&t.business_type==='order_payment'&&t.business_id===orderId
    && t.direction==='debit'&&t.status==='completed'&&t.currency==='CNY','LEDGER_IDENTITY_MISMATCH');
  const amount=settlementMicros(t.amount),total=settlementMicros(order.total_amount);
  need(amount>0n&&amount===total,'AMOUNT_MISMATCH');
  need(settlementMicros(t.balance_before)-settlementMicros(t.balance_after)===amount,'BALANCE_DELTA_MISMATCH');
  const final=await load();
  need(eligible(final)&&final.user_id===order.user_id&&settlementMicros(final.total_amount)===total,'ORDER_CHANGED');
  const checked=clock();
  need(Number.isFinite(started)&&Number.isFinite(checked)&&checked>=started&&checked-started<=maxReadAgeMs,'STALE_READ');
  return Object.freeze({source:'verified_payment_costs',orderId,settlementKind:'balance_ledger',
    settlementId:t.id,transactionNo:t.transaction_no,provider:'internal_balance',currency:'CNY',
    paymentFee:'0.000000',otherFees:'0.000000',costScope:'order_settlement_only',
    checkedAt:new Date(checked).toISOString()});
}
