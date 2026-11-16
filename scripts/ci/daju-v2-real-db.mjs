// Disposable CI PostgreSQL only. No service credentials or provider network.
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { purchaseDajuV2, frozenUnits, money } from "../../lib/providers/daju/purchase-v2.mjs";
import { createDajuV2Store } from "../../lib/providers/daju/purchase-v2-store.mjs";
import { repoOutcomeDefinition } from "../../tests/support/supplier-v13-local-fixture.mjs";
assert.equal(process.env.PGHOST,"127.0.0.1");
assert.equal(process.env.PGDATABASE,"jianlian_bitrefill_v13_db5_20261116");
assert.equal(process.env.CI,"true");
assert.match(process.env.PG_CONTAINER ?? "", /^[0-9a-f]{12,64}$/);
assert.ok(!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.DAJU_API_KEY);
function q(sql) {
  // Connect on the disposable container's loopback so the shared fixture's
  // existing server-side loopback guard stays intact (no guard relaxation).
  const x=spawnSync("docker",["exec","-i","--env","PGPASSWORD",process.env.PG_CONTAINER,"psql","-h","127.0.0.1","-U","postgres","-d",process.env.PGDATABASE,"-X","-v","ON_ERROR_STOP=1","-Atq"],{input:sql,encoding:"utf8"});
  if(x.status!==0) throw Error(x.stderr); return x.stdout.trim();
}
const data=q("select current_setting('data_directory')");
assert.equal(q("select host(inet_server_addr())"),"127.0.0.1");
const ddl = "set v13.expected_data_directory='"+data.replaceAll("'","''")+"';\n"
 +readFileSync("tests/fixtures/current-schema/supplier-v13-current-baseline.sql","utf8")
 +readFileSync("tests/fixtures/current-schema/supplier-v13-db5-delivery-support.sql","utf8")
 +repoOutcomeDefinition()+";\n"
 +readFileSync("supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql","utf8")
 +readFileSync("supabase/migrations/"+readdirSync("supabase/migrations").find(x=>x.endsWith("_daju_v2_attempt_delivery.sql")),"utf8");
q(ddl);
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const trusted=sql=>q("set role service_role; set request.jwt.claim.role='service_role'; "+sql);
for(const role of ["anon","authenticated"])assert.equal(q(`select has_function_privilege('${role}','public.internal_supplier_purchase_deliver_daju_attempt(uuid,text,uuid,text,text)','EXECUTE')`),"f");
assert.equal(q("select has_function_privilege('service_role','public.internal_supplier_purchase_deliver_daju_attempt(uuid,text,uuid,text,text)','EXECUTE')"),"t");
const order=randomUUID(),item=randomUUID(),root=randomUUID(),token=randomUUID(),user=randomUUID();
const request=`jianlian:${order}:${item}`;
function seed(itemId,rootId,req) {q(`insert into public.order_items(id,order_id,product_name,unit_price,line_total,quantity,delivery_type,product_snapshot) values('${itemId}','${order}','SYNTHETIC',2,2,1,'auto_delivery','{"supplier_binding":{"fulfillment_source":"supplier","supplier":"daju","supplier_product_id":10,"supplier_sku":null}}'); insert into public.supplier_fulfillment_requests(id,order_id,order_item_id,supplier,supplier_product_id,request_id,attempt_token,status) values('${rootId}','${order}','${itemId}','daju','10',${quote(req)},'${token}','PURCHASING')`);}
q(`insert into public.orders(id,order_no,user_id,payment_status,status) values('${order}','SYNTHETIC-${order}','${user}','paid','paid')`);
seed(item,root,request);
const units=[{fulfillment_request_id:root,order_item_id:item,unit_index:1,frozen_product_id:"10",frozen_package_id:null,frozen_currency:"CNY",frozen_face_value:null,quoted_unit_cost:"0.50",max_unit_cost:"1.00"}];
const otherItem=randomUUID(),otherRoot=randomUUID();seed(otherItem,otherRoot,`jianlian:${order}:${otherItem}`);
const mixed=[...units,{...units[0],fulfillment_request_id:otherRoot,order_item_id:otherItem}];
assert.throws(()=>trusted(`select public.internal_supplier_purchase_claim('daju','mixed-test','${"b".repeat(64)}',${quote(JSON.stringify(mixed))}::jsonb)`),/DAJU_SINGLE_ORDER_ITEM_REQUIRED/);
const claim=JSON.parse(trusted(`select public.internal_supplier_purchase_claim('daju',${quote(request)},'${"a".repeat(64)}',${quote(JSON.stringify(units))}::jsonb)`));
const id=claim.attempt_id;
assert.equal(claim.result,"CLAIMED");
trusted(`select public.internal_supplier_purchase_transition('${id}','CLAIMED','SUBMITTING');select public.internal_supplier_purchase_transition('${id}','SUBMITTING','EXTERNAL_CREATED','synthetic-provider-order')`);
const fp="c".repeat(64);
const deliver=`select public.internal_supplier_purchase_deliver_daju_attempt('${id}',${quote(request)},'${token}','${fp}','SYNTHETIC_PRIVATE_SECRET')`;
assert.throws(()=>trusted(deliver),/DAJU_DELIVERED_EVIDENCE_REQUIRED/);
trusted(`select public.internal_supplier_purchase_record_evidence('${id}',null,'DELIVERED','DAJU_AUTHORITATIVE_DELIVERED','${fp}',clock_timestamp())`);
trusted("begin;"+deliver+";rollback;");
assert.equal(q("select count(*) from public.order_deliveries"),"0");
assert.equal(q(`select status from public.supplier_purchase_attempts where id='${id}'`),"RECONCILING");
const first=JSON.parse(trusted(deliver));assert.equal(first.ok,true);
const second=JSON.parse(trusted(deliver));assert.equal(second.idempotent,true);
assert.equal(q("select count(*) from public.order_deliveries"),"1");
assert.equal(q("select count(*) from public.digital_delivery_secrets"),"1");
assert.equal(q(`select status from public.supplier_purchase_attempts where id='${id}'`),"SUCCEEDED");
assert.equal(q("select count(*) from public.delivery_logs where row_to_json(delivery_logs)::text like '%SYNTHETIC_PRIVATE_SECRET%'"),"0");
assert.equal(q("select count(*) from public.supplier_reconciliation_evidence where row_to_json(supplier_reconciliation_evidence)::text like '%SYNTHETIC_PRIVATE_SECRET%'"),"0");
assert.equal(q("select position('e.supplier=''bitrefill''' in pg_get_functiondef('public.internal_supplier_purchase_deliver_child(uuid,text,uuid,text)'::regprocedure))>0"),"t");
console.log("DAJU_V2_REAL_DB_TEST=PASS ACL/SINGLE_ITEM/EVIDENCE/ROLLBACK/PRIVATE_DELIVERY/IDEMPOTENCY/REDACTION");

// Two independent PostgreSQL connections race the real transition RPC while
// invoking the production orchestration. The provider is an in-process fake:
// this job has no provider credentials and never sends a network purchase.
function qa(sql) {
 return new Promise((resolve,reject)=>{
  const child=spawn("docker",["exec","-i","--env","PGPASSWORD",process.env.PG_CONTAINER,"psql","-h","127.0.0.1","-U","postgres","-d",process.env.PGDATABASE,"-X","-v","ON_ERROR_STOP=1","-Atq"]);
  let out="",err="";child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>err+=x);child.on("error",reject);child.on("close",code=>code===0?resolve(out.trim()):reject(Error(err)));child.stdin.end("set role service_role; set request.jwt.claim.role='service_role'; "+sql);
 });
}
const recoveryItem=randomUUID(),recoveryRoot=randomUUID();
const recoveryKey=`jianlian:${order}:${recoveryItem}`;
seed(recoveryItem,recoveryRoot,recoveryKey);
q(`update public.supplier_fulfillment_requests set trigger_source='daju_v2:paid_order' where id='${recoveryRoot}'`);
const candidate={orderId:order,orderItemId:recoveryItem,quantity:1,binding:{productId:10,sku:null,maxUnitCost:"1.00",inputsMapping:{}},orderFields:{}};
const service={from(table){let filters=[];const b={select(){return b},eq(k,v){assert.match(k,/^[a-z_]+$/);filters.push(`${k}=${quote(v)}`);return b;},single:async()=>({data:JSON.parse(q(`select row_to_json(t) from public.${table} t where ${filters.join(" and ")}`))}),maybeSingle:async()=>{const raw=q(`select row_to_json(t) from public.${table} t where ${filters.join(" and ")}`);return {data:raw?JSON.parse(raw):null};}};return b;}};
const rootStore=createDajuV2Store(service,{claim:async()=>({action:"NONE",status:"PURCHASING"})},"paid_order");
const resumedRoot=await rootStore.root(candidate,recoveryKey);
assert.equal(resumedRoot.id,recoveryRoot);assert.equal(resumedRoot.attempt_token,token);
const recoveryUnits=frozenUnits(candidate,recoveryRoot,"0.50");
const semantic=createHash("sha256").update(JSON.stringify({key:recoveryKey,units:recoveryUnits,inputs:[]})).digest("hex");
const recoveredClaim=JSON.parse(trusted(`select public.internal_supplier_purchase_claim('daju',${quote(recoveryKey)},'${semantic}',${quote(JSON.stringify(recoveryUnits))}::jsonb)`));
assert.equal(recoveredClaim.result,"CLAIMED");
const recoveredId=recoveredClaim.attempt_id;
let winners=0,posts=0,arrivals=0,release;
const barrier=new Promise(r=>release=r);
const db={
 find:async()=>JSON.parse(q(`select row_to_json(t) from public.supplier_purchase_attempts t where id='${recoveredId}'`)),
 get:async()=>JSON.parse(q(`select row_to_json(t) from public.supplier_purchase_attempts t where id='${recoveredId}'`)),
 items:async()=>JSON.parse(q(`select json_agg(t order by unit_index) from public.supplier_purchase_attempt_items t where attempt_id='${recoveredId}'`)),
 orderCost:async()=>money("1"),
 transition:async(id,from,to,invoice=null)=>{
  const result=JSON.parse(await qa(`select public.internal_supplier_purchase_transition('${id}',${quote(from)},${quote(to)},${invoice===null?"null":quote(invoice)})`));
  if(to==="SUBMITTING"&&result.result==="TRANSITIONED")winners++;return result;
 },
 evidence:async(id,status,result,fp)=>trusted(`select public.internal_supplier_purchase_record_evidence('${id}',null,${quote(status)},${quote(result)},${quote(fp)},clock_timestamp())`),
 deliver:async(id,fp,content)=>trusted(`select public.internal_supplier_purchase_deliver_daju_attempt('${id}',${quote(recoveryKey)},'${token}',${quote(fp)},${quote(content)})`),
};
const client={
 getProduct:async()=>({id:10,isAuto:true,stock:10,minQty:1,maxQty:20,isSku:false,skuVariants:[],price:"0.50",requiredInputs:[]}),
 getBalance:async()=>{if(++arrivals===2)release();await barrier;return {balance:"10"};},
 purchase:async()=>{posts++;return {orderCode:"synthetic-recovery-invoice"};},
 getOrder:async()=>({orderCode:"synthetic-recovery-invoice",requestId:recoveryKey,productId:10,sku:null,quantity:1,unitPrice:"0.50",totalPrice:"0.50",status:"delivered",delivered:["SYNTHETIC_RECOVERY_SECRET"]}),
};
const env={SUPPLIER_AUTO_PURCHASE_ENABLED:"true",DAJU_AUTO_PURCHASE_MODE:"canary",DAJU_AUTO_PURCHASE_CANARY_ORDER_ID:order,DAJU_AUTO_PURCHASE_MAX_ORDER_CNY:"1"};
await Promise.all([1,2].map(()=>purchaseDajuV2({db,client,candidate,env})));
assert.equal(winners,1);assert.equal(posts,1);
assert.equal(q(`select count(*) from public.supplier_purchase_attempts where logical_request_key=${quote(recoveryKey)}`),"1");
assert.equal(q(`select count(*) from public.supplier_purchase_attempts where id='${recoveredId}' and external_invoice_id='synthetic-recovery-invoice'`),"1");
assert.equal(q(`select count(*) from public.order_deliveries where order_item_id='${recoveryItem}'`),"1");
await purchaseDajuV2({db,client,candidate,env});assert.equal(posts,1);
q(`update public.supplier_fulfillment_requests set trigger_source='legacy' where id='${otherRoot}'`);
await assert.rejects(rootStore.root({...candidate,orderItemId:otherItem},`jianlian:${order}:${otherItem}`),/ROOT_INVALID/);
console.log("DAJU_V2_PRE_V13_ROOT_RECOVERY=PASS DAJU_V2_CLAIMED_CONCURRENCY=PASS V1_3_ATTEMPT_COUNT=1 SUBMITTING_TRANSITION_WINNER=1 PROVIDER_POST_COUNT=1 EXTERNAL_ID_COUNT=1 HISTORICAL_ROOT_POST_COUNT=0");
