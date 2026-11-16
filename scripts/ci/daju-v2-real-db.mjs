// Disposable CI PostgreSQL only. No service credentials or provider network.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
