import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getVerifiedMerchantCostsForOrderCore as get,settlementMicros} from '../../lib/payments/verified-merchant-costs-core.mjs';
const id='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
function fixture({orderPatch={},ledgerPatch={},count=1,change=false}={}) {
 const order={id,user_id:user,payment_status:'paid',payment_method:'balance',currency:'CNY',total_amount:'0.090000',...orderPatch};
 const row={id:'00000000-0000-4000-8000-000000000003',transaction_no:'BT_SYNTHETIC',user_id:user,business_type:'order_payment',business_id:id,direction:'debit',status:'completed',currency:'CNY',amount:'0.09',balance_before:'19.632',balance_after:'19.542',...ledgerPatch};
 const calls=[];let reads=0;
 return {calls,service:{from(table){assert(['orders','balance_transactions'].includes(table));calls.push(table);const b={select(){return b;},eq(){return b;},limit(n){assert.equal(n,2);return b;},single(){return b;},then(resolve){return Promise.resolve({data:table==='orders'?{...order,...(change&&reads++?{payment_status:'refunded'}:{})}:Array.from({length:count},()=>({...row})),error:null}).then(resolve);}};return b;}}};
}
test('real ledger identity, exact delta and zero order settlement cost, no fake session',async()=>{
 const f=fixture(),r=await get(f.service,id);assert.equal(r.settlementKind,'balance_ledger');assert.equal(r.settlementId,'00000000-0000-4000-8000-000000000003');
 assert.equal(r.transactionNo,'BT_SYNTHETIC');assert.equal(r.paymentFee,'0.000000');assert.equal(r.otherFees,'0.000000');assert.equal(r.costScope,'order_settlement_only');
 assert(!('paymentSessionId'in r));assert(!('BALANCE_FUNDING_COST_VERIFIED_ZERO'in r));assert.deepEqual(f.calls,['orders','balance_transactions','orders']);
});
for(const [label,options] of Object.entries({zero:{count:0},duplicate:{count:2},unpaid:{orderPatch:{payment_status:'unpaid'}},wrongMethod:{orderPatch:{payment_method:'alipay'}},
 wrongOrder:{ledgerPatch:{business_id:user}},wrongUser:{ledgerPatch:{user_id:id}},direction:{ledgerPatch:{direction:'credit'}},
 amount:{ledgerPatch:{amount:'0.10'}},delta:{ledgerPatch:{balance_after:'19.543'}},currency:{ledgerPatch:{currency:'USD'}},
 pending:{ledgerPatch:{status:'pending'}},negative:{ledgerPatch:{amount:'-0.09'}},identity:{ledgerPatch:{id:null}},changed:{change:true}}))
 test(label+' fails closed',async()=>{await assert.rejects(get(fixture(options).service,id));});
test('stale or backwards clock evidence fails closed',async()=>{
 for(const times of [[0,30001],[100,99]]){let i=0;await assert.rejects(get(fixture().service,id,{clock:()=>times[i++]}),/STALE/);}
});
test('customer fee metadata does not supply merchant cost or enable unsupported method',async()=>{
 await assert.rejects(get(fixture({orderPatch:{payment_method:'wechat',fee_amount:0,metadata:{merchant_fee:0}}}).service,id));
 const f=fixture({ledgerPatch:{fee_amount:-1,metadata:{fee_amount:999}}});assert.equal((await get(f.service,id)).paymentFee,'0.000000');
});
test('six-place comparisons are exact, unsafe numbers and invalid decimals reject',()=>{
 assert.equal(settlementMicros('0.09'),settlementMicros('0.090000'));for(const x of ['-1','1e2','0.0000001',Infinity])assert.throws(()=>settlementMicros(x));
});
test('zero cost scope is backed by the existing internal settlement implementation',()=>{
 const service=fs.readFileSync('lib/orders/balance-payment-service.ts','utf8');
 const sql=fs.readFileSync('supabase/migrations/20260703_balance_order_payment.sql','utf8');
 assert.match(service,/service\.rpc\("pay_order_with_balance"/);
 assert.match(sql,/insert into public\.balance_transactions/i);
 assert.match(sql,/public\.complete_order_payment/);
 assert.doesNotMatch(service,/createPaymentSession|createPayment\(|queryPayment\(/);
 assert.doesNotMatch(sql,/http_post|net\.http|payment_sessions/i);
});
