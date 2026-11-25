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
  const load=()=>read(service.from('orders').select('id,order_no,user_id,payment_status,payment_method,currency,total_amount,paid_at').eq('id',orderId).single());
  const order=await load();
  const supportedMethods=new Set(['balance','alipay','wechat','wechat_pay','usdt_bep20']);
  const eligible=o=>o.id===orderId&&uuid(o.user_id)&&o.payment_status==='paid'&&supportedMethods.has(o.payment_method)&&o.currency==='CNY';
  need(eligible(order),'ORDER_UNSUPPORTED_OR_UNPAID');
  const total=settlementMicros(order.total_amount);
  need(total>0n,'AMOUNT_MISMATCH');

  let settlementKind='balance_ledger',settlementId=orderId,transactionNo=String(order.order_no||orderId),provider='internal_balance';
  if (order.payment_method==='balance') {
    const rows=await read(service.from('balance_transactions')
      .select('id,transaction_no,user_id,business_type,business_id,direction,status,currency,amount,balance_before,balance_after')
      .eq('business_type','order_payment').eq('business_id',orderId)
      .eq('direction','debit').eq('status','completed').eq('currency','CNY').limit(2));
    need(Array.isArray(rows)&&rows.length===1,'LEDGER_EXACT_MATCH_REQUIRED');
    const t=rows[0];
    need(uuid(t.id)&&typeof t.transaction_no==='string'&&/^[A-Za-z0-9:_-]{1,120}$/.test(t.transaction_no)
      && t.user_id===order.user_id&&t.business_type==='order_payment'&&t.business_id===orderId
      && t.direction==='debit'&&t.status==='completed'&&t.currency==='CNY','LEDGER_IDENTITY_MISMATCH');
    const amount=settlementMicros(t.amount);
    need(amount>0n&&amount===total,'AMOUNT_MISMATCH');
    need(settlementMicros(t.balance_before)-settlementMicros(t.balance_after)===amount,'BALANCE_DELTA_MISMATCH');
    settlementId=t.id;transactionNo=t.transaction_no;
  } else if (order.payment_method==='alipay'||order.payment_method==='wechat'||order.payment_method==='wechat_pay') {
    const sessions=await read(service.from('payment_sessions')
      .select('id,provider_transaction_id,status,payable_amount')
      .eq('business_type','order').eq('business_id',orderId)
      .in('status',['paid','completed','succeeded']).limit(2));
    need(Array.isArray(sessions)&&sessions.length>=1,'PAYMENT_SESSION_REQUIRED');
    const s=sessions[0];
    settlementKind='payment_session';
    settlementId=String(s.id);
    transactionNo=String(s.provider_transaction_id||s.id);
    provider=order.payment_method==='wechat_pay'?'wechat':order.payment_method;
  } else if (order.payment_method==='usdt_bep20') {
    need(Boolean(order.paid_at),'BEP20_PAID_AT_REQUIRED');
    settlementKind='bep20_chain';
    settlementId=order.id;
    transactionNo=String(order.order_no||order.id);
    provider='usdt_bep20';
  }
  const final=await load();
  need(eligible(final)&&final.user_id===order.user_id&&settlementMicros(final.total_amount)===total,'ORDER_CHANGED');
  const checked=clock();
  need(Number.isFinite(started)&&Number.isFinite(checked)&&checked>=started&&checked-started<=maxReadAgeMs,'STALE_READ');
  return Object.freeze({source:'verified_payment_costs',orderId,settlementKind,
    settlementId,transactionNo,provider,currency:'CNY',
    paymentFee:'0.000000',otherFees:'0.000000',costScope:'order_settlement_only',
    checkedAt:new Date(checked).toISOString()});
}
