// Local disposable databases only. No Production connection or provider HTTP.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const expectedData = process.env.V13_EXPECTED_DATA_DIRECTORY;
assert.equal(host, "127.0.0.1");
assert.equal(port, "55433");
assert.ok(user && psql && expectedData && process.env.PGPASSWORD);
assert.match(resolve(expectedData).toLowerCase(), /[\\/]_bitrefill_v13_local_pg[\\/]data$/);
const bin = resolve(psql, "..", "..");
const executable = (name) => resolve(bin, "bin", `${name}.exe`);
const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "tests/fixtures/current-schema/supplier-v13-current-baseline.sql");
const migration = resolve(root, "supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql");
function run(file, args, expectedCode = 0) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true,
    env: process.env, maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedCode, `${file}: ${result.stderr}`);
  return `${result.stdout}${result.stderr}`.trim();
}
const connection = (db) => ["-h", host, "-p", port, "-U", user, "-d", db];
function query(db, sql) {
  return run(psql, ["-X", "-v", "ON_ERROR_STOP=1", ...connection(db), "-Atqc", sql]);
}
const base = "jianlian_bitrefill_v13_current_schema";
const identity = query("postgres", `select current_user || '|' ||
  current_setting('data_directory') || '|' || host(inet_server_addr())`);
assert.equal(identity, `${user}|${expectedData.replaceAll("\\", "/")}|127.0.0.1`);

const seed = `
insert into public.orders(id,order_no,user_id,status,payment_status)
values('a1000000-0000-4000-8000-000000000001','synthetic-dirty-v13',
       'd1000000-0000-4000-8000-000000000001','paid','paid');
insert into public.order_items(id,order_id,product_name,unit_price,line_total,quantity,delivery_type)
values
('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','SYNTHETIC',5,5,1,'automatic'),
('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','SYNTHETIC',5,5,1,'automatic');
insert into public.supplier_fulfillment_requests
(id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
values('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
'b1000000-0000-4000-8000-000000000001','bitrefill','synthetic-product','synthetic-package','synthetic-root-1','PENDING');`;
const cases = [
  ["logical", `alter table public.supplier_fulfillment_requests drop constraint supplier_fulfillment_requests_order_item_id_key;
    insert into public.supplier_fulfillment_requests
    (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
    values('c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001','bitrefill','synthetic-product','synthetic-package','synthetic-root-2','PENDING');`,
    "SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_LOGICAL_ROOT"],
  ["invoice", `update public.supplier_fulfillment_requests set provider_order_code='synthetic-invoice' where request_id='synthetic-root-1';
    insert into public.supplier_fulfillment_requests
    (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status,provider_order_code)
    values('c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002','bitrefill','synthetic-product','synthetic-package','synthetic-root-2','PENDING','synthetic-invoice');`,
    "SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_EXTERNAL_INVOICE"],
  ["orphan", `alter table public.supplier_fulfillment_requests drop constraint supplier_fulfillment_requests_order_item_id_fkey;
    update public.supplier_fulfillment_requests set order_item_id='b1000000-0000-4000-8000-000000000099';`,
    "SUPPLIER_PURCHASE_PREFLIGHT_ORPHAN_ROOT"],
  ["state", `alter table public.supplier_fulfillment_requests drop constraint supplier_fulfillment_requests_status_check;
    update public.supplier_fulfillment_requests set status='BROKEN';`,
    "SUPPLIER_PURCHASE_PREFLIGHT_INVALID_ROOT_STATE"],
  ["binding", `update public.supplier_fulfillment_requests set supplier_sku=null;`,
    "SUPPLIER_PURCHASE_PREFLIGHT_MISSING_FROZEN_BINDING"],
];
for (const [name, mutation, expected] of cases) {
  const db = `${base}_${name}`;
  assert.equal(query("postgres", `select count(*) from pg_database where datname='${db}'`), "0",
    `REFUSE_EXISTING_DATABASE_${name}`);
  run(executable("createdb"), ["-h", host, "-p", port, "-U", user, db]);
  try {
    run(psql, ["-X", "-v", "ON_ERROR_STOP=1", ...connection(db), "-f", fixture]);
    query(db, seed);
    query(db, mutation);
    const result = run(psql, ["-X", "-v", "ON_ERROR_STOP=1", ...connection(db), "-f", migration], 3);
    assert.ok(result.includes(expected), `${name}: ${result}`);
    assert.equal(query(db, `select count(*) from pg_tables where schemaname='public'
      and tablename in ('supplier_purchase_attempts','supplier_purchase_attempt_items',
      'supplier_external_orders','supplier_webhook_receipts','supplier_reconciliation_evidence')`), "0");
    assert.equal(query(db, `select count(*) from pg_proc where proname like 'internal_supplier_purchase_%'`), "0");
    console.log(`V13_CURRENT_DIRTY_${name.toUpperCase()}_FAIL_CLOSED_PASS`);
  } finally {
    assert.equal(query("postgres", `select current_setting('data_directory')`),
      expectedData.replaceAll("\\", "/"));
    run(executable("dropdb"), ["-h", host, "-p", port, "-U", user, db]);
  }
}
console.log("V13_CURRENT_DIRTY_PRE_MIGRATION_MATRIX_5_OF_5_PASS");
console.log("V13_CURRENT_DIRTY_EXTERNAL_CHILD_NOT_APPLICABLE_BEFORE_NEW_TABLE_EXISTS");
