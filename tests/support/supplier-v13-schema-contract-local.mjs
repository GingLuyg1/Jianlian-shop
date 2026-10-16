// Guarded local-only policy, ACL, trigger and function-security checks.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";

const db = process.env.V13_DB_NAME;
const data = process.env.V13_EXPECTED_DATA_DIRECTORY?.replaceAll("\\", "/");
const psql = process.env.V13_PSQL_PATH;
assert.match(db ?? "", /^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$/);
assert.equal(process.env.V13_PGHOST, "127.0.0.1");
assert.equal(process.env.V13_PGPORT, "55433");
assert.ok(psql && data && process.env.V13_PGUSER && process.env.PGPASSWORD);
assert.equal(basename(dirname(data)).toLowerCase(), "_bitrefill_v13_local_pg");
assert.equal(basename(data).toLowerCase(), "data");
function sql(query, expectSuccess = true) {
  const result = spawnSync(psql, ["-w", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", "127.0.0.1", "-p", "55433", "-U", process.env.V13_PGUSER,
    "-d", db, ...(process.argv.includes("--db9-owner") ? ["-c", "set role postgres"] : []),
    "-c", query], { encoding: "utf8", windowsHide: true,
    env: process.env, maxBuffer: 1024 * 1024 });
  assert.equal(result.status === 0, expectSuccess, result.stderr);
  return { out: result.stdout.trim(), error: result.stderr.trim() };
}
assert.equal(sql("select current_database()||'|'||current_setting('data_directory')||'|'||host(inet_server_addr())").out,
  `${db}|${data}|127.0.0.1`);
const policyCount = Number(sql(`select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  and c.relname in ('orders','order_items','order_deliveries','digital_delivery_secrets','digital_inventory')`).out);
assert.equal(policyCount, 11);
assert.equal(sql(`select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where c.relname in ('order_deliveries','supplier_fulfillment_requests')
  and t.tgname in ('order_deliveries_set_updated_at','supplier_fulfillment_requests_set_updated_at')
  and not t.tgisinternal`).out, "2");
const acl = sql(`select
  has_table_privilege('service_role','public.supplier_fulfillment_requests','SELECT,INSERT,UPDATE')::text||'|'||
  has_table_privilege('anon','public.supplier_fulfillment_requests','SELECT')::text||'|'||
  has_table_privilege('service_role','public.order_deliveries','SELECT,INSERT,UPDATE,DELETE')::text||'|'||
  has_function_privilege('anon','public.is_admin()','EXECUTE')::text||'|'||
  has_function_privilege('authenticated','public.is_admin()','EXECUTE')::text`).out;
assert.equal(acl, "true|false|true|false|true");
const functionSecurity = sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='is_admin'
  and p.prosecdef and p.prorettype='boolean'::regtype
  and p.proconfig=ARRAY['search_path=public']::text[]`).out;
assert.equal(functionSecurity, "2");
const helperSecurity = sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('log_order_item_delivery_status','write_delivery_log','refresh_order_fulfillment_status')
  and not p.prosecdef and p.proconfig=ARRAY['search_path=pg_catalog']::text[]
  and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('authenticated',p.oid,'EXECUTE')
  and has_function_privilege('service_role',p.oid,'EXECUTE')`).out;
assert.equal(helperSecurity, "3");
const outcomeSecurity = sql(`select p.prosecdef::text||'|'||p.proconfig::text||'|'||
  has_function_privilege('anon',p.oid,'EXECUTE')::text||'|'||
  has_function_privilege('service_role',p.oid,'EXECUTE')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='record_supplier_fulfillment_outcome'`).out;
assert.equal(outcomeSecurity, "true|{\"search_path=pg_catalog, public\"}|false|true");
const authSecurity = sql(`select
  has_function_privilege('anon','auth.role()','EXECUTE')::text||'|'||
  has_function_privilege('service_role','auth.role()','EXECUTE')::text||'|'||
  has_function_privilege('anon','auth.uid()','EXECUTE')::text`).out;
assert.equal(authSecurity, "false|true|true");
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'internal_supplier_purchase_%'
  and p.prosecdef and p.proconfig=ARRAY['search_path=pg_catalog']::text[]
  and not has_function_privilege('anon',p.oid,'EXECUTE')
  and has_function_privilege('service_role',p.oid,'EXECUTE')`).out, "6");
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('supplier_purchase_guard_attempt_item','supplier_purchase_guard_attempt_update',
     'supplier_purchase_guard_external_order')
  and not p.prosecdef and p.proconfig=ARRAY['search_path=pg_catalog']::text[]
  and not has_function_privilege('anon',p.oid,'EXECUTE')`).out, "3");
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where ((n.nspname='public' and p.proname in
    ('is_admin','set_updated_at','admin_evaluate_product_sku_activation',
     'record_supplier_fulfillment_outcome','log_order_item_delivery_status',
     'write_delivery_log','refresh_order_fulfillment_status'))
    or (n.nspname='auth' and p.proname in ('uid','role')))
  and p.proowner=current_user::regrole`).out, "10");
assert.equal(sql(`select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and t.tgenabled='O' and t.tgname in
    ('order_deliveries_set_updated_at','supplier_fulfillment_requests_set_updated_at',
     'supplier_purchase_attempt_item_guard','supplier_purchase_attempt_update_guard',
     'supplier_external_order_guard')`).out, "5");

// One synthetic transaction verifies the two transitive updated_at triggers.
sql(`begin;
do $db7$
declare v_order uuid:=gen_random_uuid(); v_item uuid:=gen_random_uuid();
  v_root uuid:=gen_random_uuid(); v_delivery uuid:=gen_random_uuid();
begin
  insert into public.orders(id,order_no,user_id,status,payment_status)
    values(v_order,'synthetic-db7-'||v_order,gen_random_uuid(),'paid','paid');
  insert into public.order_items(id,order_id,product_name,unit_price,line_total)
    values(v_item,v_order,'SYNTHETIC_DB7',1,1);
  insert into public.supplier_fulfillment_requests
    (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id)
    values(v_root,v_order,v_item,'bitrefill','synthetic-product','synthetic-package',
      'synthetic-db7-'||v_root);
  insert into public.order_deliveries(id,order_id,order_item_id,delivery_status)
    values(v_delivery,v_order,v_item,'pending');
  update public.supplier_fulfillment_requests set updated_at='2000-01-01' where id=v_root;
  update public.order_deliveries set updated_at='2000-01-01' where id=v_delivery;
  if (select updated_at from public.supplier_fulfillment_requests where id=v_root)
      < now()-interval '1 minute'
    or (select updated_at from public.order_deliveries where id=v_delivery)
      < now()-interval '1 minute' then
    raise exception 'DB7_TRIGGER_NOT_FIRED';
  end if;
end
$db7$;
rollback;`);

// Auth test body derives only from a synthetic JWT claim in this local fixture.
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const own = sql(`begin;
insert into public.orders(id,order_no,user_id,status,payment_status)
  values('33333333-3333-4333-8333-333333333333','synthetic-db7-policy','${user}','paid','paid');
set role authenticated;
select set_config('request.jwt.claim.sub','${user}',true);
select count(*) from public.orders where order_no='synthetic-db7-policy';
select set_config('request.jwt.claim.sub','${other}',true);
select count(*) from public.orders where order_no='synthetic-db7-policy';
rollback;`).out.split(/\r?\n/).filter((line) => /^[01]$/.test(line));
assert.deepEqual(own, ["1", "0"]);
const anonRead = sql(`begin; set role anon; select count(*) from public.orders; rollback;`).out;
assert.match(anonRead, /\b0\b/);
assert.match(sql(`begin; set role anon; insert into public.orders
  (id,order_no,user_id) values(gen_random_uuid(),'synthetic-denied',gen_random_uuid());`, false).error,
  /permission denied|row-level security/i);
assert.match(sql(`begin; set role anon; update public.supplier_fulfillment_requests
  set status='FAILED' where false;`, false).error, /permission denied/i);
assert.match(sql(`begin; set role anon; delete from public.supplier_fulfillment_requests
  where false;`, false).error, /permission denied/i);
console.log(JSON.stringify({ local_policy_pass: true, local_acl_pass: true,
  local_trigger_pass: true, local_function_security_pass: true,
  modeled_policies: policyCount }));
