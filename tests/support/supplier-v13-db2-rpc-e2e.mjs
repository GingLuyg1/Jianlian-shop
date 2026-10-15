// Local disposable PostgreSQL only. No provider HTTP, payment, or Production.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const db = process.env.V13_PGDATABASE;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const dataDirectory = process.env.V13_EXPECTED_DATA_DIRECTORY;
assert.equal(host, "127.0.0.1", "LOCAL_LOOPBACK_ONLY");
assert.equal(port, "55433", "LOCAL_DISPOSABLE_PORT_ONLY");
assert.ok(["jianlian_bitrefill_v13_db2", "jianlian_bitrefill_v13_current_schema"].includes(db), "LOCAL_DISPOSABLE_DB_ONLY");
assert.ok(user && psql && dataDirectory && process.env.PGPASSWORD,
  "LOCAL_CONNECTION_CONFIGURATION_REQUIRED");
assert.match(resolve(dataDirectory).toLowerCase(), /[\\/]_bitrefill_v13_local_pg[\\/]data$/);

function q(sql) {
  return new Promise((resolveQuery, rejectQuery) => {
    const child = spawn(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port,
      "-U", user, "-d", db, "-Atqc", sql], { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.on("error", rejectQuery);
    child.on("close", (code) => code === 0
      ? resolveQuery(stdout.trim())
      : rejectQuery(new Error(`LOCAL_PSQL_FAILED(${code}): ${stderr.trim()}`)));
  });
}
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
async function fails(sql, code) {
  await assert.rejects(q(sql), (error) => error.message.includes(code), code);
}

assert.equal(await q("select current_setting('data_directory')"), dataDirectory.replaceAll("\\", "/"));
assert.equal(await q("select current_database() || '|' || host(inet_server_addr())"),
  `${db}|127.0.0.1`);
for (const role of ["anon", "authenticated"]) {
  assert.equal(await q(`select has_function_privilege('${role}',
    'public.internal_supplier_purchase_claim(text,text,text,jsonb)','EXECUTE')`), "f");
  assert.equal(await q(`select has_table_privilege('${role}',
    'public.supplier_purchase_attempts','SELECT')`), "f");
  await fails(`set role ${role}; select count(*) from public.supplier_purchase_attempts`,
    "permission denied");
  await fails(`set role ${role}; insert into public.supplier_purchase_attempts
    (supplier,logical_request_key,semantic_request_hash)
    values('bitrefill','forbidden-${role}','${"a".repeat(64)}')`, "permission denied");
  await fails(`set role ${role}; update public.supplier_purchase_attempts
    set status='MANUAL_REVIEW'`, "permission denied");
}
assert.equal(await q(`select has_function_privilege('service_role',
  'public.internal_supplier_purchase_claim(text,text,text,jsonb)','EXECUTE')`), "t");
assert.equal(await q(`select has_table_privilege('service_role',
  'public.supplier_purchase_attempts','INSERT')`), "f");
await fails(`set role service_role; insert into public.supplier_purchase_attempts
  (supplier,logical_request_key,semantic_request_hash)
  values('bitrefill','forbidden-service','${"a".repeat(64)}')`, "permission denied");
assert.equal(await q(`select count(*) from pg_class where relname in (
  'supplier_purchase_attempts','supplier_purchase_attempt_items','supplier_external_orders',
  'supplier_webhook_receipts','supplier_reconciliation_evidence') and relrowsecurity`), "5");
assert.equal(await q(`select count(*) from pg_policies where tablename in (
  'supplier_purchase_attempts','supplier_purchase_attempt_items','supplier_external_orders',
  'supplier_webhook_receipts','supplier_reconciliation_evidence')`), "0");
assert.equal(await q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'internal_supplier_purchase_%'
    and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]`), "6");
assert.equal(await q(`select count(*) from information_schema.routine_privileges
  where routine_schema='public' and routine_name like 'internal_supplier_purchase_%'
    and grantee='service_role' and privilege_type='EXECUTE'`), "6");
assert.equal(await q(`select count(*) from information_schema.routine_privileges
  where routine_schema='public' and routine_name like 'internal_supplier_purchase_%'
    and grantee in ('PUBLIC','anon','authenticated')`), "0");
const activation = async (metadata, stock = 0) => JSON.parse(await q(`set role service_role;
  select public.admin_evaluate_product_sku_activation('automatic','automatic',
    ${stock},${sqlString(JSON.stringify(metadata))}::jsonb,0)`));
const daju = {
  fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 123,
  supplier_sku: "5", supplier_max_unit_cost: "4.8", supplier_stock_snapshot: 5,
  supplier_stock_sync_status: "synced", supplier_stock_last_success_at: "2026-10-15T00:00:00Z",
  supplier_stock_stale: false,
};
const originalP23 = readFileSync(new URL("../../supabase/migrations/20261004180000_admin_catalog_transactional_bulk_activation_p2_3.sql", import.meta.url), "utf8");
const originalEvaluator = originalP23.match(/create or replace function public\.admin_evaluate_product_sku_activation\([\s\S]*?\$\$;/i)?.[0];
assert.ok(originalEvaluator, "P23_ORIGINAL_EVALUATOR_MISSING");
await q(originalEvaluator.replace("public.admin_evaluate_product_sku_activation(",
  "public.v13_test_original_sku_activation("));
for (const metadata of [
  daju,
  { ...daju, supplier_stock_stale: true },
  { ...daju, supplier_stock_sync_status: "error" },
  { ...daju, supplier_stock_snapshot: 0 },
  { ...daju, supplier_product_id: "123" },
  { ...daju, supplier_max_unit_cost: null },
  { ...daju, supplier_inputs_mapping: { note: "customer_note" } },
  { inventory_state: "requires_verification" },
  {},
]) {
  for (const stock of [0, 5, 6]) {
    assert.equal(await q(`select public.v13_test_original_sku_activation(
      'automatic','automatic',${stock},${sqlString(JSON.stringify(metadata))}::jsonb,0)
      = public.admin_evaluate_product_sku_activation(
      'automatic','automatic',${stock},${sqlString(JSON.stringify(metadata))}::jsonb,0)`), "t",
    "DAJU_P23_GOLDEN_MISMATCH");
  }
}
assert.deepEqual(await activation(daju, 5), {
  ready: true, stock: 5, source: "supplier", reasons: [],
  inventory_state: null, local_available_count: 0,
});
assert.deepEqual((await activation(daju, 0)).reasons,
  ["ZERO_STOCK", "SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"]);
assert.deepEqual((await activation({ ...daju, supplier_stock_stale: true }, 5)).reasons,
  ["SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"]);
const booleanEvidence = {
  fulfillment_source: "supplier", supplier: "bitrefill", supplier_product_id: "apple-us",
  supplier_sku: "apple-5", supplier_max_unit_cost: "4.8", supplier_inputs_mapping: {},
  supplier_quantity_known: false, supplier_stock_snapshot: null,
  supplier_availability: "AVAILABLE", supplier_available: true,
  supplier_stock_sync_status: "synced", supplier_stock_stale: false,
  supplier_stock_last_success_at: new Date().toISOString(),
};
assert.equal((await activation(booleanEvidence)).ready, true);
assert.equal((await activation({ ...booleanEvidence, supplier_availability: "UNKNOWN" })).ready, false);
assert.equal((await activation({ ...booleanEvidence, supplier_stock_stale: true })).ready, false);
assert.equal((await activation({ ...booleanEvidence, supplier_stock_sync_status: "error" })).ready, false);
assert.equal((await activation({ ...booleanEvidence,
  supplier_stock_last_success_at: "2020-01-01T00:00:00Z" })).ready, false);
assert.equal((await activation({ inventory_state: "requires_verification" })).ready, false);

const roots = Array.from({ length: 21 }, () => ({ root: randomUUID(), item: randomUUID() }));
const orderId = randomUUID();
await q(db === "jianlian_bitrefill_v13_current_schema"
  ? `insert into public.orders(id,order_no,user_id,payment_status,status)
     values('${orderId}','synthetic-v13-${orderId}','${randomUUID()}','paid','paid')`
  : `insert into public.orders(id,payment_status,status)
     values('${orderId}','paid','paid')`);
for (const { root, item } of roots) {
  await q(`insert into public.order_items(id,order_id,${db === "jianlian_bitrefill_v13_current_schema" ? "product_name,unit_price,line_total," : ""}quantity,delivery_type,product_snapshot)
    values('${item}','${orderId}',${db === "jianlian_bitrefill_v13_current_schema" ? "'SYNTHETIC_V13_PRODUCT',5,5," : ""}1,'auto_delivery',
      '{"supplier_binding":{"fulfillment_source":"supplier","supplier":"bitrefill",
      "supplier_product_id":"apple-us","supplier_sku":"apple-5"}}'::jsonb);
    insert into public.supplier_fulfillment_requests
      (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
    values('${root}','${orderId}','${item}','bitrefill','apple-us','apple-5','${root}','PENDING')`);
}
const items = roots.map(({ root, item }) => ({
  fulfillment_request_id: root, order_item_id: item, unit_index: 1,
  frozen_product_id: "apple-us", frozen_package_id: "apple-5", frozen_currency: "USD",
  frozen_face_value: "5.00", quoted_unit_cost: "4.80", max_unit_cost: "5.00",
}));
const hash = "a".repeat(64);
const keyA = `db2-${randomUUID()}`;
const keyB = `db2-${randomUUID()}`;
const claim = (key, units, semantic = hash, supplier = "bitrefill") => `set role service_role;
  select public.internal_supplier_purchase_claim(${sqlString(supplier)},${sqlString(key)},
    '${semantic}',${sqlString(JSON.stringify(units))}::jsonb)`;
const [first, second] = await Promise.all([q(claim(keyA, items.slice(0, 20))),
  q(claim(keyA, items.slice(0, 20)))]);
assert.deepEqual([JSON.parse(first).result, JSON.parse(second).result].sort(),
  ["ALREADY_CLAIMED", "CLAIMED"]);
await fails(claim(keyA, items.slice(0, 20), "b".repeat(64)),
  "SUPPLIER_PURCHASE_SEMANTIC_CONFLICT");
assert.equal(JSON.parse(await q(claim(keyB, items.slice(20)))).result, "CLAIMED");
const idA = JSON.parse(first).attempt_id;
const idB = JSON.parse(await q(claim(keyB, items.slice(20)))).attempt_id;
assert.equal(await q(`select string_agg(n::text,',' order by n) from
  (select count(*) n from public.supplier_purchase_attempt_items
   where attempt_id in ('${idA}','${idB}') group by attempt_id) s`), "1,20");

for (const id of [idA, idB]) {
  const transition = (expected, next, invoice = null) => `set role service_role;
    select public.internal_supplier_purchase_transition('${id}',
      '${expected}','${next}',${invoice === null ? "null" : sqlString(invoice)})`;
  assert.equal(JSON.parse(await q(transition("CLAIMED", "SUBMITTING"))).result, "TRANSITIONED");
  assert.equal(JSON.parse(await q(transition("CLAIMED", "SUBMITTING"))).result, "STATE_CONFLICT");
  assert.equal(JSON.parse(await q(transition("SUBMITTING", "EXTERNAL_CREATED", `invoice-${id}`))).result,
    "TRANSITIONED");
  assert.equal(JSON.parse(await q(transition("SUBMITTING", "EXTERNAL_CREATED", `invoice-${id}`))).result,
    "ALREADY_REGISTERED");
  await fails(transition("SUBMITTING", "EXTERNAL_CREATED", `other-${id}`),
    "SUPPLIER_PURCHASE_EXTERNAL_INVOICE_CONFLICT");
}
const firstChild = await q(`select id from public.supplier_purchase_attempt_items
  where attempt_id='${idA}' order by id limit 1`);
const recordChild = (itemId, orderId) => `set role service_role;
  select public.internal_supplier_purchase_record_child('${itemId}',${sqlString(orderId)})`;
assert.equal(JSON.parse(await q(recordChild(firstChild, `child-${firstChild}`))).result, "RECORDED");
assert.equal(JSON.parse(await q(recordChild(firstChild, `child-${firstChild}`))).result, "RECORDED");
await fails(recordChild(firstChild, `different-${firstChild}`), "SUPPLIER_PURCHASE_CHILD_IDENTITY_CONFLICT");
const secondChild = await q(`select id from public.supplier_purchase_attempt_items
  where attempt_id='${idA}' and id <> '${firstChild}' order by id limit 1`);
await fails(recordChild(secondChild, `child-${firstChild}`),
  "supplier_external_orders_provider_id_uidx");
await fails(recordChild(secondChild, "x".repeat(201)), "SUPPLIER_PURCHASE_CHILD_INPUT_INVALID");
for (const id of [idA, idB]) {
  const rows = (await q(`select id from public.supplier_purchase_attempt_items
    where attempt_id='${id}' order by id`)).split(/\r?\n/);
  for (const row of rows) {
    if (row === firstChild) continue;
    await q(recordChild(row, `child-${row}`));
  }
}
assert.equal(await q(`select count(*) from public.supplier_external_orders
  where attempt_id in ('${idA}','${idB}')`), "21");
assert.equal(await q(`select count(distinct order_item_id) from
  public.supplier_purchase_attempt_items where attempt_id in ('${idA}','${idB}')`), "21");
const childRowId = await q(`select id from public.supplier_external_orders
  where attempt_item_id='${firstChild}'`);
const pendingChildRowId = await q(`select id from public.supplier_external_orders
  where attempt_item_id='${secondChild}'`);
const fingerprint = "c".repeat(64);
const evidence = (childId, status, fp = fingerprint, source = "GET_RECONCILIATION") => `set role service_role;
  select public.internal_supplier_purchase_record_evidence('${idA}',
    '${childId}','${status}','${source}','${fp}',clock_timestamp())`;
assert.equal(JSON.parse(await q(evidence(childRowId, "DELIVERED"))).result, "RECORDED");
assert.equal(JSON.parse(await q(evidence(pendingChildRowId, "PENDING", "d".repeat(64)))).result,
  "RECORDED");
assert.equal(await q(`select normalized_status from public.supplier_external_orders
  where id='${pendingChildRowId}'`), "PENDING");
await fails(evidence(childRowId, "PENDING"), "SUPPLIER_EXTERNAL_ORDER_TERMINAL_IMMUTABLE");
assert.equal(await q(`select normalized_status from public.supplier_external_orders
  where id='${childRowId}'`), "DELIVERED");
const raceFingerprint = randomUUID().replaceAll("-", "").padEnd(64, "f");
const race = await Promise.all([
  q(evidence(pendingChildRowId, "DELIVERED", raceFingerprint, "WEBHOOK_GET")),
  q(evidence(pendingChildRowId, "DELIVERED", raceFingerprint, "POLL_GET")),
]);
assert.equal(JSON.parse(race[0]).evidence_id, JSON.parse(race[1]).evidence_id);
assert.equal(await q(`select count(*) from public.supplier_reconciliation_evidence
  where external_order_row_id='${pendingChildRowId}' and safe_fingerprint='${raceFingerprint}'`), "1");
const deliveryItemId = await q(`select i.order_item_id
  from public.supplier_external_orders e
  join public.supplier_purchase_attempt_items i on i.id=e.attempt_item_id
  where e.id='${pendingChildRowId}'`);
const deliveryInsert = () => q(`insert into public.order_deliveries
  (id,${db === "jianlian_bitrefill_v13_current_schema" ? "order_id," : ""}order_item_id,delivery_type,delivery_status)
  values('${randomUUID()}',${db === "jianlian_bitrefill_v13_current_schema" ? `'${orderId}',` : ""}'${deliveryItemId}','supplier_delivery','delivered')`);
const deliveryRace = await Promise.allSettled([deliveryInsert(), deliveryInsert()]);
assert.equal(deliveryRace.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(deliveryRace.filter((result) => result.status === "rejected").length, 1);
assert.equal(await q(`select count(*) from public.order_deliveries
  where order_item_id='${deliveryItemId}' and delivery_status='delivered'`), "1");
const deliveredFixture = items.find((item) => item.order_item_id === deliveryItemId);
assert.ok(deliveredFixture);
await fails(claim(`invalid-${randomUUID()}`, [deliveredFixture]),
  "SUPPLIER_PURCHASE_ALREADY_DELIVERED");
const webhookFingerprint = randomUUID().replaceAll("-", "").padEnd(64, "e");
const webhook = `set role service_role;
  select public.internal_supplier_purchase_record_webhook('bitrefill',
    '${webhookFingerprint}','invoice-${idA}',null)`;
const replay = (await q(`set role service_role;
  select public.internal_supplier_purchase_record_webhook('bitrefill',
    '${webhookFingerprint}','invoice-${idA}',null)
  from generate_series(1,100)`)).split(/\r?\n/).map(JSON.parse);
assert.equal(replay.filter((row) => row.result === "RECEIVED").length, 1);
assert.equal(replay.filter((row) => row.result === "ALREADY_RECEIVED").length, 99);
assert.equal(await q(`select count(*) from public.supplier_webhook_receipts
  where event_fingerprint='${webhookFingerprint}'`), "1");
assert.equal(JSON.parse(await q(webhook)).result, "ALREADY_RECEIVED");
await fails(`set role service_role;
  select public.internal_supplier_purchase_record_webhook('bitrefill',
    '${webhookFingerprint}','wrong-invoice',null)`,
  "SUPPLIER_PURCHASE_WEBHOOK_IDENTITY_CONFLICT");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0], frozen_currency: "US'D" }]),
  "SUPPLIER_PURCHASE_FROZEN_EVIDENCE_INVALID");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0], quoted_unit_cost: "-1" }]),
  "SUPPLIER_PURCHASE_ITEM_INPUT_INVALID");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0], frozen_face_value: null }]),
  "SUPPLIER_PURCHASE_FROZEN_EVIDENCE_INVALID");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0], order_item_id: randomUUID() }]),
  "SUPPLIER_PURCHASE_FROZEN_ORDER_MISMATCH");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0], frozen_product_id: "wrong" }]),
  "SUPPLIER_PURCHASE_FROZEN_ORDER_MISMATCH");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0] }], hash, "daju"),
"SUPPLIER_PURCHASE_FROZEN_ORDER_MISMATCH");
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0], fulfillment_request_id: null }]),
  "SUPPLIER_PURCHASE_ITEM_INPUT_INVALID");
await q(`update public.orders set payment_status='unpaid' where id='${orderId}'`);
await fails(claim(`invalid-${randomUUID()}`, [{ ...items[0] }]),
  "SUPPLIER_PURCHASE_ORDER_NOT_PURCHASABLE");
await q(`update public.orders set payment_status='paid' where id='${orderId}'`);
const dajuRoot = randomUUID();
const dajuItem = randomUUID();
await q(`insert into public.order_items(id,order_id,${db === "jianlian_bitrefill_v13_current_schema" ? "product_name,unit_price,line_total," : ""}quantity,delivery_type,product_snapshot)
  values('${dajuItem}','${orderId}',${db === "jianlian_bitrefill_v13_current_schema" ? "'SYNTHETIC_V13_DAJU',5,5," : ""}1,'auto_delivery',
    '{"supplier_binding":{"fulfillment_source":"supplier","supplier":"daju",
    "supplier_product_id":123}}'::jsonb);
  insert into public.supplier_fulfillment_requests
    (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
  values('${dajuRoot}','${orderId}','${dajuItem}','daju','123',null,
    '${dajuRoot}','PENDING')`);
assert.equal(JSON.parse(await q(claim(`daju-${randomUUID()}`, [{
  fulfillment_request_id: dajuRoot, order_item_id: dajuItem, unit_index: 1,
  frozen_product_id: "123", frozen_package_id: null, frozen_currency: "CNY",
  frozen_face_value: null, quoted_unit_cost: "4.8", max_unit_cost: "5.0",
}], hash, "daju"))).result, "CLAIMED");
await fails(recordChild(secondChild, "x'); drop table public.supplier_purchase_attempts;--"),
  "SUPPLIER_PURCHASE_CHILD_INPUT_INVALID");
assert.equal(await q("select to_regclass('public.supplier_purchase_attempts') is not null"), "t");
const uncertain = randomUUID();
await q(`insert into public.supplier_purchase_attempts
  (id,supplier,logical_request_key,semantic_request_hash)
  values('${uncertain}','bitrefill','uncertain-${uncertain}','${hash}')`);
await q(`set role service_role;
  select public.internal_supplier_purchase_transition('${uncertain}','CLAIMED','SUBMITTING')`);
await q(`set role service_role;
  select public.internal_supplier_purchase_transition('${uncertain}','SUBMITTING','UNCERTAIN')`);
assert.equal(await q(`select status || '|' || coalesce(external_invoice_id,'NONE')
  from public.supplier_purchase_attempts where id='${uncertain}'`), "UNCERTAIN|NONE");
await fails(`set role service_role;
  select public.internal_supplier_purchase_transition('${uncertain}','UNCERTAIN','SUBMITTING')`,
  "SUPPLIER_PURCHASE_TRANSITION_FORBIDDEN");
console.log("V13_DB2_RPC_CLAIM_20_PLUS_1_EXTERNAL_IDS_ACL_UNCERTAIN_EVIDENCE_WEBHOOK_PASS");
