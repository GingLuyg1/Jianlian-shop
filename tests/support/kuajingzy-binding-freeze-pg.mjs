import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),psql=process.env.KJ_PSQL??'psql',port=process.env.KJ_PGPORT??'5432';
assert.equal(process.env.KJ_PGHOST,'127.0.0.1');
assert(['5432','55439'].includes(port));
assert.equal(process.env.KJ_PGDATABASE,'kuajingzy_freeze_isolated');
const args=['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',process.env.KJ_PGUSER??'postgres','-d','kuajingzy_freeze_isolated'];
function q(sql,allow=false){const r=spawnSync(psql,[...args,'-Atq'],{input:sql,encoding:'utf8',timeout:15000,windowsHide:true});if(allow)return r;
assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const file=n=>fs.readFileSync(path.join(root,n),'utf8').replaceAll('\r\n','\n');
q(file('tests/fixtures/kuajingzy-order-create-support.sql'));
q(file('tests/fixtures/kuajingzy-order-create-base.sql'));
const migration=file('supabase/migrations/20261117184700_kuajingzy_order_binding_freeze_v1.sql');
const before=q("select 'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure::oid");
q("revoke all on function public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text) from public");
const acl=q("select proacl::text from pg_proc where oid="+before);
q(migration);q(migration);
assert.equal(q("select 'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure::oid"),before);
assert.equal(q("select proacl::text from pg_proc where oid="+before),acl);
let checks=2;
const product='30000000-0000-4000-8000-000000000001',sku='40000000-0000-4000-8000-000000000001';
const literal=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
const binding={fulfillment_source:'supplier',supplier:'kuajingzy',supplier_product_id:'imp_8f97c91003b23347934cb14e',supplier_sku:'9',
supplier_currency:'CNY',supplier_max_unit_cost:'0.10',supplier_min_unit_profit:'0.01',supplier_min_margin_bps:100,supplier_auto_purchase_enabled:false};
function set(meta){q("update product_skus set metadata="+literal(meta)+" where id='"+sku+"'");}
function create(key,shipping={}){
return "select row_to_json(r) from public.create_order_with_item(p_product_id=>'"+product+"',p_quantity=>1,p_shipping_address=>"+literal(shipping)+",p_sku_id=>'"+sku+"',p_payment_method=>'balance',p_client_request_id=>'"+key+"') r";
}
set({...binding,website_product_id:'FORGED',website_sku_id:'FORGED'});
const order=JSON.parse(q(create('first',{supplier_product_id:'FORGED',supplier_max_unit_cost:'999',supplier_auto_purchase_enabled:true})));
const snapshot=JSON.parse(q("select product_snapshot from order_items where order_id='"+order.order_id+"'"));
assert.equal(snapshot.supplier_binding.website_product_id,product);assert.equal(snapshot.supplier_binding.website_sku_id,sku);
assert.equal(snapshot.supplier_binding.supplier_product_id,binding.supplier_product_id);assert.equal(snapshot.supplier_binding.supplier_max_unit_cost,'0.10');
assert.equal(snapshot.supplier_binding.supplier_auto_purchase_enabled,false);assert.equal(order.total_amount,1.23);
assert.equal(q('select count(*) from digital_inventory'), '0');checks+=7;
set({...binding,supplier_product_id:'changed',supplier_max_unit_cost:'0.20'});
assert.deepEqual(JSON.parse(q("select product_snapshot from order_items where order_id='"+order.order_id+"'")),snapshot);
assert.equal(JSON.parse(q(create('first'))).order_id,order.order_id);checks+=2;
q('update products set metadata='+literal({...binding,website_product_id:'FORGED'})+" where id='"+product+"'");
set({supplier_max_unit_cost:'0.11'});
const fallback=JSON.parse(q(create('fallback')));
const inherited=JSON.parse(q("select product_snapshot from order_items where order_id='"+fallback.order_id+"'")).supplier_binding;
assert.equal(inherited.supplier_max_unit_cost,'0.11');assert.equal(inherited.supplier_product_id,binding.supplier_product_id);
assert.equal(inherited.website_product_id,product);checks+=3;
q("update products set metadata='{}'::jsonb where id='"+product+"'");
for(const key of Object.keys(binding)){
 const bad={...binding};delete bad[key];
 // Without supplier declaration this is an ordinary local product; it must
 // still not be silently sold without local inventory.
 set(bad);const countBefore=q('select count(*) from orders');const r=q(create('missing_'+key),true);
 if(key==='supplier') {
   if(r.status===0){const o=JSON.parse(r.stdout.trim());assert.equal(JSON.parse(q("select product_snapshot from order_items where order_id='"+o.order_id+"'")).supplier_binding,null);}
 }else {assert.notEqual(r.status,0);assert.match(r.stderr,/KUAJINGZY_BINDING_INCOMPLETE/);assert.equal(q('select count(*) from orders'),countBefore);}
 checks++;
}
for(const patch of [{supplier_sku:9},{supplier_auto_purchase_enabled:'true'},{supplier_max_unit_cost:'-1'},
{supplier_min_unit_profit:'0'},{supplier_currency:'USD'},{supplier_min_margin_bps:10000}]){
 set({...binding,...patch});assert.match(q(create('invalid_'+checks),true).stderr,/KUAJINGZY_BINDING_INCOMPLETE/);checks++;
}
set({fulfillment_source:'local',supplier:'local'});q("insert into digital_inventory(product_id,sku_id,status) values('"+product+"','"+sku+"','available')");
const local=JSON.parse(q(create('local')));
assert.equal(JSON.parse(q("select product_snapshot from order_items where order_id='"+local.order_id+"'")).supplier_binding,null);
assert.equal(q("select count(*) from digital_inventory where status='reserved'"),'1');checks+=2;
set({fulfillment_source:'supplier',supplier:'daju',supplier_product_id:10,supplier_sku:null,supplier_max_unit_cost:'1'});
const daju=JSON.parse(q(create('daju')));
assert.equal(JSON.parse(q("select product_snapshot from order_items where order_id='"+daju.order_id+"'")).supplier_binding.supplier,'daju');checks++;
set({});q("insert into bitrefill_pin_private.sale_authorizations values('"+product+"','"+sku+"')");
const bit=JSON.parse(q(create('bitrefill')));
assert.equal(JSON.parse(q("select product_snapshot from order_items where order_id='"+bit.order_id+"'")).supplier_binding.supplier,'bitrefill');checks++;
q('delete from bitrefill_pin_private.sale_authorizations');
// A source drift invalidates the exact fingerprint; migration must leave it intact.
const definition=q("select pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure)");
q(definition.replace('v_quantity integer :=','v_quantity integer /* drift */ :='));
const failed=q(migration,true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/SOURCE_DRIFT/);checks++;
console.log(JSON.stringify({LOCAL_POSTGRES_FREEZE:'PASS',checks,REAL_SUPPLIER_REQUESTS:0,PRODUCTION_CHANGED:'NO'}));
