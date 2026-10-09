import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs,source} from '../helpers/payment-session-guard-harness.mjs';
const {enrichAdminOrderSessionEvidence:enrich}=loadTs('lib/payments/admin-order-session-evidence.ts',{});
const raw={order_id:'ORDER',user_id:'USER',payment_no:'AUTO-PS-ONE',provider_trade_no:'TX'};
const payment={business_type:'order',business_no:'ORD-ONE',channel:'wechat',payable_currency:'CNY',payable_amount:100,provider_trade_no:null,paid_at:null};
const session={id:'SESSION',business_type:'order',business_id:'ORDER',business_no:'ORD-ONE',user_id:'USER',session_no:'PS-ONE',channel_code:'wechat',currency:'CNY',payable_amount:100,provider:'snpay',status:'paid',provider_transaction_id:'TX',paid_at:'2026-01-01T00:00:00Z',reconcile_status:'matched'};
function client(rows,error=null){return{from(table){assert.equal(table,'payment_sessions');const filters=[];const q={select(v){assert.ok(!/metadata|payment_url|qr_code/.test(v));return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},limit(){return q;},then(a,b){return Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r))),error}).then(a,b);}};return q;}};}
test('historical provider enriched only from exact pinned session relation',async()=>{
 const r=await enrich(client([session]),raw,payment);assert.equal(r.provider,'snpay');assert.equal(r.session_evidence_status,'pinned');assert.equal(r.payment_session_status,'paid');assert.equal(r.reconciliation_status,'matched');assert.equal(r.provider_trade_no,'TX');
});
for(const [label,patch] of Object.entries({business_no:{business_no:'OTHER'},channel:{channel_code:'alipay'},currency:{currency:'USD'},amount:{payable_amount:103},user:{user_id:'OTHER'},business_id:{business_id:'OTHER'},session_no:{session_no:'OTHER',provider_transaction_id:'OTHER'}}))test(`historical ${label} mismatch cannot fabricate provider`,async()=>{const r=await enrich(client([{...session,...patch}]),raw,payment);assert.equal(r.provider,undefined);assert.equal(r.session_evidence_status,'ambiguous_or_missing');});
test('ambiguous or missing/error evidence is explicitly unavailable, no channel inference',async()=>{for(const [rows,error]of [[[],null],[[session,session],null],[[],{code:'TEST'}]]){const r=await enrich(client(rows,error),raw,payment);assert.equal(r.provider,undefined);}});
test('Admin shows session/fulfillment and cash fee estimate separately; never labels estimate actual',()=>{const ui=source('components/admin/payments/AdminPaymentRecordsPage.tsx');for(const field of ['payment_session_no','payment_session_status','reconciliation_status','fulfillment_status','实际收银台手续费/总额'])assert.ok(ui.includes(field));assert.ok(ui.includes('未提供；预计约 3%，以收银台实际金额为准'));});
