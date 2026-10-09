import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {loadTs} from './payment-session-guard-harness.mjs';
import * as policy from '../../lib/payments/snpay-reconciliation-policy.mjs';
import * as crypto from '../../lib/payments/providers/snpay-core.mjs';
import * as local from '../../lib/delivery/local-stock-priority.mjs';
import * as routerCore from '../../lib/providers/core/supplier-router-core.mjs';
import * as dajuCore from '../../lib/providers/daju/fulfillment-core.mjs';
import * as mapper from '../../lib/providers/daju/mapper.mjs';
import * as protocol from '../../lib/providers/daju/protocol.mjs';
import * as candidate from '../../lib/providers/daju/fulfillment-candidate.mjs';

const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
// Preserve exact executable body, including row locks. Missing functions fail
// the acceptance rather than substituting a simplified implementation.
function canonical(file,name) {
 const text=source('supabase/migrations/'+file),start=text.search(new RegExp('create or replace function public\\.'+name+'\\(','i'));
 assert.ok(start>=0,name);const tail=text.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)?.[1];assert.ok(tag,name);
 const first=tail.indexOf(tag),end=tail.indexOf(tag,first+tag.length);assert.ok(end>first,name);
 return tail.slice(0,end+tag.length)+';';
}
function patchBlock(file,tag) {const text=source('supabase/migrations/'+file),start=text.indexOf('do $'+tag+'$');assert.ok(start>=0);return text.slice(start,text.indexOf('$'+tag+'$;',start+tag.length+5)+tag.length+4);}
export async function runSnpayOrderDbMatrix({sql,uid}) {
 assert.equal(await sql("select identity_token from public.ci_payment_watcher_database_identity;"),'jianlian-payment-watcher-ephemeral-v1');
 await sql(source('tests/fixtures/snpay-order-runtime-schema.sql'));
 await sql('create function public.is_admin() returns boolean language sql stable as $$select false$$;');
 const deliveryFile='20260709_digital_delivery_reserved_fulfillment_hardening.sql';
 for(const name of ['normalize_order_item_delivery_type','write_delivery_log','log_order_item_delivery_status','refresh_order_fulfillment_status','deliver_digital_order'])await sql(canonical(deliveryFile,name));
 await sql(canonical('20260710_order_payment_inventory_idempotency_fix.sql','complete_order_payment'));
 await sql("revoke execute on function public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz) from public,anon,authenticated;grant execute on function public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz) to service_role;");
 await sql(canonical('20260710_order_lifecycle_compatibility_baseline.sql','release_order_inventory'));
 await sql(canonical('20260724_order_expiration_chain_session_consistency.sql','expire_unpaid_order'));
 // Reproduce the canonical delivery patches in their actual migration order.
 await sql(patchBlock('20260810120000_daju_supplier_fulfillment_v1.sql','exclude_supplier_items'));
 await sql(patchBlock('20260810200000_daju_local_inventory_priority_v1.sql','patch_local_delivery'));
 const supplierFile='20260826190000_supplier_fulfillment_core_v1.sql';
 for(const name of ['claim_supplier_fulfillment','record_supplier_fulfillment_outcome','reserve_local_inventory_for_supplier_order','reserve_local_inventory_for_daju_order'])await sql(canonical(supplierFile,name));
 await sql(patchBlock(supplierFile,'patch_local_delivery'));
 const migration=source('supabase/migrations/20261009180000_order_reconciliation_inventory_boundary.sql');
 const unchangedRows=()=>sql("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(t)) from public.profiles t),'ledger',(select jsonb_agg(to_jsonb(t)) from public.balance_transactions t),'sessions',(select jsonb_agg(to_jsonb(t)) from public.payment_sessions t),'recharges',(select jsonb_agg(to_jsonb(t)) from public.account_recharges t));");
 const beforeMigration=await unchangedRows();
 const orderDefinitionBefore=await sql("select pg_get_functiondef('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)'::regprocedure);");
 await sql(migration);await assert.rejects(sql(migration),/UNKNOWN_PAYMENT_SESSION_LOCK_BASELINE/);
 assert.equal(await unchangedRows(),beforeMigration);console.log('ORDER_MIGRATION_ZERO_BUSINESS_MUTATION=yes');
 assert.equal(await sql("select pg_get_functiondef('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)'::regprocedure);"),orderDefinitionBefore);

 const oid=randomUUID(),sid=randomUUID(),iid=randomUUID(),pid=randomUUID(),inv=randomUUID(),sku=randomUUID();
 const now=Date.now(),created=new Date(now-600000).toISOString(),expiry=new Date(now-60000).toISOString(),paidAt=new Date(now-300000).toISOString();
 const quote=v=>v==null?'NULL':typeof v==='number'?String(v):typeof v==='object'?"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb":"'"+String(v).replace(/'/g,"''")+"'";
 const ident=v=>{assert.match(v,/^[a-z_]+$/);return v;};
 let queries=0,purchases=0,rpcCalls=0,override={},queryHook=null,deliveryFailure=false;
 const role="set request.jwt.claim.role='service_role';";
 const rpcArgs={complete_payment_session:['p_session_id','p_provider_transaction_id','p_paid_amount','p_currency','p_paid_at'],
  reserve_local_inventory_for_daju_order:['p_order_id','p_trigger_source'],deliver_digital_order:['p_order_id','p_trigger_source'],
  write_delivery_log:['p_order_id','p_order_item_id','p_inventory_id','p_trigger_source','p_event_type','p_message','p_detail'],
  claim_supplier_fulfillment:['p_order_id','p_order_item_id','p_supplier','p_request_id','p_supplier_product_id','p_supplier_sku','p_trigger_source'],
  record_supplier_fulfillment_outcome:['p_order_id','p_order_item_id','p_supplier','p_request_id','p_attempt_token','p_status','p_retryable','p_error_code','p_provider_order_code','p_delivery_content','p_supplier_unit_price','p_supplier_total_price','p_trigger_source']};
 const client={
  async rpc(name,args){assert.ok(rpcArgs[name],name);if(name==='complete_payment_session')rpcCalls++;
   if(deliveryFailure&&name==='deliver_digital_order')return{error:{message:'TEST_DELIVERY_THROW'},data:null};
   const values=rpcArgs[name].map(k=>typeof args[k]==='boolean'?String(args[k]):quote(args[k]));
   try{return{data:JSON.parse(await sql(role+`select public.${name}(${values.join(',')});`)||'null'),error:null};}catch(e){console.log('CI_ORDER_RPC_ERROR='+name+':'+e.message);return{data:null,error:e};}},
  from(table){assert.ok(['orders','order_items','payment_sessions','payment_reconciliations'].includes(table));let filters=[],op=null,payload=null;
   const q={select(){return q;},limit(){return q;},eq(k,v){filters.push(ident(k)+'='+quote(v));return q;},is(k,v){assert.equal(v,null);filters.push(ident(k)+' is null');return q;},in(k,v){filters.push(ident(k)+' in ('+v.map(quote).join(',')+')');return q;},
    update(v){assert.equal(table,'payment_sessions');op='update';payload=v;return q;},upsert(v){assert.equal(table,'payment_reconciliations');op='upsert';payload=v;return q;},
    async run(single=false){let query;if(op==='update')query=`update public.${table} set ${Object.entries(payload).map(([k,v])=>ident(k)+'='+quote(v)).join(',')} where ${filters.join(' and ')} returning *`;
     else if(op==='upsert'){const ks=Object.keys(payload);query=`insert into public.${table}(${ks.join(',')}) values(${ks.map(k=>quote(payload[k])).join(',')}) on conflict(dedupe_key) do update set ${ks.map(k=>k+'=excluded.'+k).join(',')} returning *`;}
     else query=`select * from public.${table} ${filters.length?'where '+filters.join(' and '):''}`;
     const data=JSON.parse(await sql(`with rows as (${query}) select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from rows;`));return{data:single?data[0]??null:data,error:null};},
    maybeSingle(){return q.run(true);},then(a,b){return q.run().then(a,b);}};return q;}
 };
 const binding={fulfillment_source:'supplier',supplier:'daju',supplier_product_id:45,supplier_sku:null,supplier_inputs_mapping:{},supplier_max_unit_cost:'7'};
 const fakeDaju={getProduct:async()=>({id:45,isAuto:true,stock:10,minQty:1,maxQty:10,price:'1',requiredInputs:[]}),
  purchase:async()=>{purchases++;await new Promise(r=>setTimeout(r,5));return{orderCode:'CI-SUPPLIER-ONE',delivered:['CI-FAKE-CARD-NOT-REAL'],unitPrice:'1',totalPrice:'1'};},getOrder:()=>{throw Error('UNEXPECTED_SUPPLIER_QUERY');}};
 const daju=loadTs('lib/providers/daju/fulfillment.ts',{'./client':{createDajuClient:()=>fakeDaju},'./fulfillment-candidate.mjs':candidate,'./fulfillment-core.mjs':dajuCore,'./mapper.mjs':mapper,'./protocol.mjs':protocol});
 const router=loadTs('lib/providers/core/supplier-router.ts',{'../daju/fulfillment':daju,'./supplier-router-core.mjs':routerCore});
 const delivery=loadTs('lib/delivery/delivery-service.ts',{'@/lib/providers/core/supplier-router':router,'./local-stock-priority.mjs':local});
 const forbidden=()=>{throw Error('EXTERNAL_NETWORK_FORBIDDEN');};
 const complete=loadTs('lib/payments/complete-payment-service.ts',{'@/lib/delivery/delivery-service':delivery,'@/lib/payments/payment-errors':{getSafeErrorMessage:()=> 'CI_ERROR'},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:forbidden}});
 const keys=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const env={SNPAY_MERCHANT_ID:'1074',SNPAY_API_BASE:'https://provider.test',SNPAY_SITE_URL:'https://site.test',SNPAY_PRIVATE_KEY_FILE:'CI-PRIVATE',SNPAY_PLATFORM_PUBLIC_KEY_FILE:'CI-PUBLIC',SNPAY_TIMEOUT_MS:'1000',SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true'};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const adapter=loadTs('lib/payments/providers/snpay.ts',{'node:fs':{readFileSync:p=>p==='CI-PRIVATE'?keys.privateKey:keys.publicKey},'@/lib/payments/providers/snpay-core.mjs':{...crypto,createSnpayClient:o=>crypto.createSnpayClient({...o,fetchImpl:async(u,i)=>{
  assert.equal(new URL(u).origin,'https://provider.test');assert.equal(new URL(u).pathname,'/api/pay/query');queries++;if(queryHook)await queryHook();
  const form=new URLSearchParams(i.body),body={code:0,pid:'1074',trade_no:form.get('trade_no'),out_trade_no:'PS-CI-ORDER',type:'wxpay',money:'1.00',status:'1',endtime:paidAt.replace(/\.\d{3}Z$/,'Z'),timestamp:String(Math.floor(Date.now()/1000)),...override};
  return Response.json({...body,sign:crypto.createSnpaySignature(body,keys.privateKey),sign_type:'RSA'});
 }})}}).snpayProvider;
 const worker=loadTs('lib/payments/snpay-reconciliation-service.ts',{'node:crypto':{randomUUID},'@/lib/payments/complete-payment-service':complete,'@/lib/payments/providers':{resolveProviderForExistingSession:s=>{assert.equal(s.provider,'snpay');return adapter;}},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:forbidden},'@/lib/payments/snpay-reconciliation-policy.mjs':policy}).reconcileSnpaySession;
 const run=()=>worker({sessionId:sid,execute:true},{client,nowMs:now});
 const completion=()=>complete.completePayment({paymentSessionId:sid,providerTransactionId:'CI-ORDER-TX',amount:1,currency:'CNY',paidAt,source:'callback'},client);
 const expire=()=>sql(role+`select public.expire_unpaid_order('${oid}','ci-race');`);
 async function setup(mode='digital') {
  await sql(`truncate public.digital_delivery_secrets,public.order_deliveries,public.order_items,public.order_payments,public.orders,public.digital_inventory,public.products,public.product_skus,public.supplier_fulfillment_requests,public.order_status_logs,public.order_item_delivery_logs,public.delivery_logs,public.chain_payment_sessions,public.payment_sessions,public.payment_reconciliations cascade;
  insert into public.products values('${pid}',0,'sold_out',now());insert into public.product_skus values('${sku}',0,'sold_out',now());
  insert into public.orders(id,order_no,user_id,status,payment_status,total_amount,currency,payment_method,created_at,payment_expires_at,fulfillment_status) values('${oid}','ORD-CI-ONE','${uid}','pending_payment','unpaid',1,'CNY','wechat','${created}','${expiry}','pending');
  insert into public.order_items(id,order_id,product_id,sku_id,quantity,delivery_type,product_snapshot) values('${iid}','${oid}','${pid}',${mode==='sku'?quote(sku):'NULL'},1,${quote(['manual','sku'].includes(mode)?'manual_delivery':'auto_delivery')},${quote(mode==='supplier'?{supplier_binding:binding}:{})});
  insert into public.payment_sessions(id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,currency,requested_amount,payable_amount,status,provider_order_no,created_at,expires_at) values('${sid}','PS-CI-ORDER','order','${oid}','ORD-CI-ONE','${uid}','wechat','snpay','CNY',1,1,'pending','CI-ORDER-TX','${created}','${expiry}');
  ${mode==='digital'?`insert into public.digital_inventory(id,product_id,status,content,order_id,reserved_order_id,reserved_order_item_id,reserved_at) values('${inv}','${pid}','reserved','CI-FAKE-INVENTORY','${oid}','${oid}','${iid}',now());`:''}`);
  queries=purchases=rpcCalls=0;override={};queryHook=null;deliveryFailure=false;
 }
 async function checkPaid(expectedDelivery=1) {
  const o=(await client.from('orders').eq('id',oid).maybeSingle()).data;assert.equal(o.payment_status,'paid');assert.equal(o.reservation_released_at,null);
  assert.equal(await sql(`select count(*) from public.order_payments where order_id='${oid}' and status='paid' and amount=1 and received_amount=1 and fee_amount=0;`),'1');
  assert.equal(await sql(`select status from public.payment_sessions where id='${sid}';`),'paid');
  assert.equal(await sql(`select count(*) from public.order_deliveries where order_id='${oid}' and delivery_status='delivered';`),String(expectedDelivery));
  assert.equal(await sql(`select balance from public.profiles where id='${uid}';`),'30.00');
  assert.equal(await sql(`select count(*) from public.balance_transactions where business_type='order_payment' and business_id='ORD-CI-ONE';`),'0');
 }
 const businessSnapshot=()=>sql(`select jsonb_build_object('orders',(select jsonb_agg(to_jsonb(t)) from public.orders t),'items',(select jsonb_agg(to_jsonb(t)) from public.order_items t),'stock',(select jsonb_agg(to_jsonb(t)) from public.digital_inventory t),'payments',(select jsonb_agg(to_jsonb(t)) from public.order_payments t),'deliveries',(select jsonb_agg(to_jsonb(t)) from public.order_deliveries t),'balance',(select balance from public.profiles where id='${uid}'),'ledger',(select jsonb_agg(to_jsonb(t)) from public.balance_transactions t));`);
 try {
  await setup();const dryBefore=await businessSnapshot(),drySession=await sql('select to_jsonb(t) from public.payment_sessions t;');
  assert.equal((await worker({sessionId:sid},{client,nowMs:now})).kind,'would_complete');assert.equal(rpcCalls,0);
  assert.equal(await businessSnapshot(),dryBefore);assert.equal(await sql('select to_jsonb(t) from public.payment_sessions t;'),drySession);assert.equal(await sql('select count(*) from public.payment_reconciliations;'),'0');console.log('ORDER_DRY_RUN_ZERO_MUTATION=yes');
  await setup();override={status:'0'};const unpaidBefore=await businessSnapshot();assert.equal((await run()).kind,'unpaid');assert.equal(queries,1);assert.equal(rpcCalls,0);assert.equal(await businessSnapshot(),unpaidBefore);
  assert.equal(await sql(`select count(*) from public.order_payments;`),'0');assert.equal(await sql(`select status from public.digital_inventory;`),'reserved');console.log('ORDER_PENDING_UNPAID_ZERO_BUSINESS_MUTATION=yes');
  await setup();const first=await run();assert.equal(first.completed,true,JSON.stringify(first));await checkPaid();await completion();await checkPaid();assert.equal(queries,1);console.log('ORDER_CANONICAL_RSA_PAYMENT_DELIVERY_EXACTLY_ONCE=yes');
  for(const mode of ['manual','supplier']){await setup(mode);assert.equal((await run()).completed,true);await completion();await checkPaid(mode==='manual'?0:1);assert.equal(purchases,mode==='manual'?0:1);console.log('ORDER_'+mode.toUpperCase()+'_RUNTIME_EXACTLY_ONCE=yes');}
  for(let i=0;i<10;i++){await setup('supplier');await Promise.all([completion(),completion()]);await delivery.deliverDigitalOrder(client,oid,'fulfillment_retry');await checkPaid();assert.equal(purchases,1);assert.equal(queries,0);assert.equal(await sql('select count(*) from public.supplier_fulfillment_requests;'),'1');}
  console.log('ORDER_SUPPLIER_CONCURRENT_DUPLICATE_COMPLETION_PASS=yes,rounds=10');
  for(let i=0;i<10;i++){await setup();await Promise.all([run(),run()]);await checkPaid();assert.equal(queries,1);}console.log('ORDER_WORKER_WORKER_RACE_PASS=yes,rounds=10');
  for(let i=0;i<10;i++){await setup();await Promise.all([run(),completion()]);await checkPaid();assert.ok(queries<=1);}console.log('ORDER_WORKER_CALLBACK_RACE_PASS=yes,rounds=10');
  for(let i=0;i<10;i++) {
  await setup();queryHook=async()=>{await expire();};assert.equal((await run()).kind,'manual_review');
   assert.equal(await sql('select count(*) from public.order_payments;'),'0');assert.equal(await sql('select status from public.digital_inventory;'),'available');
   assert.equal(await sql("select count(*) from public.payment_reconciliations where business_type='order' and result='manual_review' and provider_summary->>'paid'='true';"),'1');
   await sql('update public.payment_sessions set last_synced_at=null;');await run();await run();
   assert.equal(await sql("select count(*) from public.payment_reconciliations where provider_summary->>'paid'='true';"),'1');assert.equal(queries,1);
   await expire();assert.equal(await sql('select count(*) from public.order_deliveries;'),'0');
   await setup();await completion();await expire();await checkPaid();
   // Native concurrent transactions: either winner must retain inventory consistency.
   await setup();const race=await Promise.allSettled([completion(),expire()]);
   for(const r of race)if(r.status==='rejected')assert.match(r.reason.message,/payment session status does not allow completion|ORDER_RESERVED_PAYMENT_BOUNDARY/);
   const o=(await client.from('orders').eq('id',oid).maybeSingle()).data;
   if(o.payment_status==='paid')await checkPaid();else{assert.equal(o.status,'expired');assert.ok(o.reservation_released_at);assert.equal(await sql('select count(*) from public.order_payments;'),'0');assert.equal(await sql('select count(*) from public.order_deliveries;'),'0');}
  }console.log('ORDER_EXPIRATION_RACE_PASS=yes,rounds=10,both_winners=yes');
  for(const mode of ['manual','sku']){await setup(mode);await expire();await expire();assert.equal(await sql(`select stock from public.${mode==='sku'?'product_skus':'products'};`),'1');assert.equal((await run()).kind,'manual_review');assert.equal(queries,0);}console.log('ORDER_INVENTORY_RELEASE_ONCE=yes');
  await setup();override={endtime:new Date(Date.parse(expiry)+1000).toISOString().replace(/\.\d{3}Z$/,'Z')};assert.equal((await run()).reason,'order_paid_after_expiry');assert.equal(rpcCalls,0);console.log('ORDER_LATE_PAID_MANUAL_REVIEW=yes');
  await setup();deliveryFailure=true;assert.equal((await run()).completed,true);await checkPaid(0);assert.equal(await sql(`select last_error is not null from public.payment_sessions where id='${sid}';`),'t');
  deliveryFailure=false;await delivery.deliverDigitalOrder(client,oid,'admin_retry');await delivery.deliverDigitalOrder(client,oid,'admin_retry');await checkPaid();assert.equal(queries,1);assert.equal(rpcCalls,1);console.log('ORDER_DELIVERY_FAILURE_SAFE_RETRY=yes');
  // Direct canonical calls also reject released-but-pending orders and late time.
  await setup();await sql(role+`select public.release_order_inventory('${oid}','ci-release');`);await assert.rejects(completion(),/ORDER_RESERVED_PAYMENT_BOUNDARY/);assert.equal(await sql('select count(*) from public.order_payments;'),'0');
  await setup();await assert.rejects(complete.completePayment({paymentSessionId:sid,providerTransactionId:'CI-ORDER-TX',amount:1,currency:'CNY',paidAt:new Date(Date.parse(expiry)+1000).toISOString(),source:'callback'},client),/ORDER_TRUSTED_PAYMENT_TIME_BOUNDARY/);
  await setup('manual');await sql(`update public.orders set payment_method='usdt_bep20';update public.payment_sessions set provider='manual',channel_code='usdt_bep20',currency='USDT',payable_amount=0.14;`);
  await complete.completePayment({paymentSessionId:sid,providerTransactionId:'CI-BEP20-TX',amount:0.14,currency:'USDT',paidAt,source:'callback'},client);
  assert.equal(await sql('select amount||\'/\'||currency||\'/\'||received_amount||\'/\'||received_currency from public.order_payments;'),'1.000000/CNY/0.140000/USDT');
  console.log('BEP20_CONVERSION_CONTRACT_UNCHANGED=yes');
  console.log('ORDER_CANONICAL_RELEASED_AND_LATE_BOUNDARIES_PASS=yes');console.log('SNPAY_ORDER_NATIVE_DB_ACCEPTANCE_PASS=yes');
 } finally {for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
