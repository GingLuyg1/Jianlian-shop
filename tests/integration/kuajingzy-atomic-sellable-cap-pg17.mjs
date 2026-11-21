// Opt-in standalone runner. Only the loopback disposable database is accepted.
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { bootstrap, query, definition, connection } from "../support/kuajingzy-atomic-cap-local.mjs";
import { read, migrationPath, createSignature, releaseSignature, fingerprint } from "../support/kuajingzy-atomic-cap-patch.mjs";

bootstrap();
const initialCreate = definition(createSignature);
const initialRelease = definition(releaseSignature);
const acls = () => query(`select jsonb_agg(jsonb_build_array(oid,proacl::text,proowner,prosecdef,proconfig) order by oid)
 from pg_proc where oid in ('${createSignature}'::regprocedure,'${releaseSignature}'::regprocedure)`);
const beforeAcl = acls();
const schema = () => query("select count(*) from information_schema.columns where table_schema='public'");
const beforeSchema = schema();
const migration = read(migrationPath);
query(migration);
query(migration);
assert.equal(acls(), beforeAcl);
assert.equal(schema(), beforeSchema);
assert.equal(query(`select has_function_privilege('anon','${createSignature}','execute')
 or has_function_privilege('anon','${releaseSignature}','execute')`), "f");

const product = "30000000-0000-4000-8000-000000000001";
const sku = "40000000-0000-4000-8000-000000000001";
const binding = { fulfillment_source: "supplier", supplier: "kuajingzy", supplier_product_id: "item9",
  supplier_sku: "9", supplier_currency: "CNY", supplier_max_unit_cost: "0.10",
  supplier_min_unit_profit: "0.01", supplier_min_margin_bps: 100,
  supplier_auto_purchase_enabled: false };
const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
function reset(cap = 5, metadata = binding, delivery = "automatic") {
  query(`truncate order_deliveries,order_items,orders,order_status_logs,digital_inventory,bitrefill_pin_private.sale_authorizations;
    update products set status='active',metadata='{}',delivery_type='${delivery}',stock=5;
    update product_skus set status='active',stock=${cap},delivery_type='${delivery}',metadata=${literal(metadata)};`);
}
const stock = () => Number(query("select stock from product_skus where id='" + sku + "'"));
const count = table => Number(query("select count(*) from " + table));
const create = (key, qty = 1, withSku = true) => `select row_to_json(r) from public.create_order_with_item(
 p_product_id=>'${product}',p_quantity=>${qty},p_sku_id=>${withSku ? "'" + sku + "'" : "null"},
 p_payment_method=>'balance',p_client_request_id=>'${key}') r;`;
const order = (key, qty = 1, withSku = true) => JSON.parse(query(create(key, qty, withSku)));
const release = id => JSON.parse(query(`select public.release_order_inventory('${id}','test')`));
function pending(sql) {
  const child = connection();
  let out = "", err = "";
  child.stdout.on("data", part => { out += part; });
  child.stderr.on("data", part => { err += part; });
  const done = once(child, "close").then(([status]) => ({ status, out, err }));
  child.stdin.end(sql);
  return done;
}
async function race(sqls) {
  // All contender connections wait behind a shared advisory barrier before entering
  // the real RPC transactions. No in-memory stock or lock simulation is involved.
  const gate = connection();
  let output = "";
  gate.stdout.on("data", part => { output += part; });
  gate.stderr.on("data", () => {});
  const gateClosed = once(gate, "close");
  gate.stdin.write("select pg_advisory_lock(814631); select 'BARRIER_READY';\n");
  const deadline = Date.now() + 7000;
  while (!output.includes("BARRIER_READY") && Date.now() < deadline) await delay(20);
  assert.ok(output.includes("BARRIER_READY"));
  const jobs = sqls.map(sql => pending("begin; select pg_advisory_xact_lock_shared(814631); " + sql + "; commit;"));
  try {
    let waiting = 0;
    while (waiting < sqls.length && Date.now() < deadline) {
      waiting = Number(query("select count(*) from pg_locks where locktype='advisory' and objid=814631 and not granted"));
      if (waiting < sqls.length) await delay(20);
    }
    assert.equal(waiting, sqls.length, "All independent connections must reach the barrier");
  } finally {
    gate.stdin.end("select pg_advisory_unlock(814631);\n");
    await gateClosed;
  }
  return Promise.all(jobs);
}

reset(1);
const cap1 = await race([create("cap1-a"), create("cap1-b")]);
assert.equal(cap1.filter(x => x.status === 0).length, 1);
assert.equal(cap1.filter(x => x.status !== 0).length, 1);
assert.match(cap1.find(x => x.status !== 0).err, /KUAJINGZY_SELLABLE_CAP_EXHAUSTED/);
assert.equal(stock(), 0); assert.equal(count("orders"), 1); assert.equal(count("order_items"), 1);
assert.equal(query("select status from product_skus"), "sold_out");

reset(2);
assert.ok((await race([create("cap2-a"), create("cap2-b")])).every(x => x.status === 0));
assert.equal(stock(), 0); assert.equal(count("orders"), 2);

reset(1);
assert.match(query(create("too-many", 2), true).stderr, /KUAJINGZY_SELLABLE_CAP_EXHAUSTED/);
assert.equal(stock(), 1); assert.equal(count("orders"), 0); assert.equal(count("order_items"), 0);

reset();
const repeated = await race([create("same-key", 2), create("same-key", 2)]);
assert.ok(repeated.every(x => x.status === 0));
const ids = repeated.map(x => JSON.parse(x.out.trim().split(/\r?\n/).find(line => line.startsWith("{"))).order_id);
assert.equal(ids[0], ids[1]); assert.equal(stock(), 3); assert.equal(count("orders"), 1);
assert.equal(order("same-key", 2).order_id, ids[0]); assert.equal(stock(), 3);
const marker = JSON.parse(query("select product_snapshot->'sellable_cap_reservation' from order_items"));
assert.deepEqual(marker, { version: 1, model: "MODEL_C", provider: "kuajingzy", sku_id: sku, quantity: 2, reserved: true });

for (const action of ["cancel", "expire"]) {
  reset();
  const id = order(action, 2).order_id;
  assert.equal(stock(), 3);
  if (action === "expire") query(`update orders set payment_expires_at=now()-interval '1 minute' where id='${id}'`);
  const call = `select public.${action}_unpaid_order('${id}','test')`;
  const first = JSON.parse(query(call));
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(stock(), 5);
  assert.equal(JSON.parse(query(call)).ok, true);
  assert.equal(stock(), 5);
  assert.equal(release(id).code, "ALREADY_RELEASED");
  assert.equal(stock(), 5);
}

reset();
const concurrentRelease = order("double-release", 2).order_id;
const releases = await race([ `select public.release_order_inventory('${concurrentRelease}','cancel')`,
  `select public.release_order_inventory('${concurrentRelease}','expire')` ]);
assert.ok(releases.every(x => x.status === 0));
assert.equal(stock(), 5);

for (const state of ["paid", "processing", "delivered", "completed", "refunded"]) {
  reset();
  const id = order("paid-" + state, 2).order_id;
  query(`update orders set payment_status='paid',status='${state}' where id='${id}'`);
  assert.equal(release(id).code, "ORDER_NOT_RELEASABLE");
  assert.equal(stock(), 3);
}
reset();
const unknownPayment = order("unknown-payment", 2).order_id;
query("update orders set payment_status='unknown'");
assert.equal(release(unknownPayment).released_kuajingzy_cap, 0);
assert.equal(stock(), 3);
for (const mutation of [
  "product_snapshot - 'sellable_cap_reservation'",
  "jsonb_set(product_snapshot,'{sellable_cap_reservation,version}','2')",
  "jsonb_set(product_snapshot,'{sellable_cap_reservation,model}','\"OTHER\"')",
  "jsonb_set(product_snapshot,'{sellable_cap_reservation,provider}','\"daju\"')",
  "jsonb_set(product_snapshot,'{sellable_cap_reservation,reserved}','false')",
  "jsonb_set(product_snapshot,'{sellable_cap_reservation,quantity}','1')",
  "jsonb_set(product_snapshot,'{sellable_cap_reservation,sku_id}','\"wrong\"')",
]) {
  reset();
  const id = order("marker", 2).order_id;
  query("update order_items set product_snapshot=" + mutation);
  assert.equal(release(id).released_kuajingzy_cap, 0); assert.equal(stock(), 3);
}
reset();
const delivered = order("delivered", 2).order_id;
query("insert into order_deliveries select id,'delivered' from order_items");
assert.equal(release(delivered).released_kuajingzy_cap, 0); assert.equal(stock(), 3);

for (const status of ["draft", "inactive", "disabled", "sold_out"]) {
  reset();
  const id = order("release-status", 2).order_id;
  query("update product_skus set status='" + status + "'");
  assert.equal(release(id).released_kuajingzy_cap, 1);
  assert.equal(stock(), 5);
  assert.equal(query("select status from product_skus"), status === "sold_out" ? "active" : status);
}

reset();
query(`create function cap_test_insert_failure() returns trigger language plpgsql as $$
 begin raise exception 'SYNTHETIC_INSERT_FAILURE'; end $$;
 create trigger cap_test_insert_failure before insert on order_items for each row execute function cap_test_insert_failure();`);
assert.match(query(create("rollback", 2), true).stderr, /SYNTHETIC_INSERT_FAILURE/);
assert.equal(stock(), 5); assert.equal(count("orders"), 0); assert.equal(count("order_items"), 0);
query("drop trigger cap_test_insert_failure on order_items; drop function cap_test_insert_failure()");

// Non-MODEL_C paths retain their prior accounting.
reset(5, { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 10, supplier_max_unit_cost: "1" });
const daju = order("daju");
assert.equal(stock(), 5); assert.equal(release(daju.order_id).released_kuajingzy_cap, 0);
reset(5, {});
query(`insert into bitrefill_pin_private.sale_authorizations values('${product}','${sku}')`);
const bitrefill = order("bitrefill");
assert.equal(stock(), 5); assert.equal(release(bitrefill.order_id).released_kuajingzy_cap, 0);
reset(5, {}, "manual");
const physical = order("physical", 2);
assert.equal(stock(), 3); release(physical.order_id); assert.equal(stock(), 5);
reset(5, {}, "manual");
query("update product_skus set status='inactive'");
const normal = order("normal", 2, false);
assert.equal(query("select stock from products"), "3");
release(normal.order_id); assert.equal(query("select stock from products"), "5");
reset(5, { fulfillment_source: "local", supplier: "local" });
query(`insert into digital_inventory(product_id,sku_id,status) values('${product}','${sku}','available')`);
const digital = order("digital");
assert.equal(query("select status from digital_inventory"), "reserved");
assert.equal(stock(), 5); assert.equal(release(digital.order_id).released_digital, 1);
assert.equal(query("select status from digital_inventory"), "available");
reset(5, { fulfillment_source: "supplier", supplier: "unknown" });
query(`insert into digital_inventory(product_id,sku_id,status) values('${product}','${sku}','available')`);
assert.match(query(create("unknown"), true).stderr, /UNKNOWN_SUPPLIER/); assert.equal(count("orders"), 0);

// Unknown source and ACL drift stop the complete migration transaction.
const patchedCreate = definition(createSignature);
const patchedRelease = definition(releaseSignature);
query(initialCreate);
query(initialRelease.replace("v_released_normal integer", "v_released_normal /* drift */ integer"));
const drift = query(migration, true);
assert.match(drift.stderr, /UNKNOWN_RELEASE_INVENTORY_BASELINE/);
assert.equal(definition(createSignature), initialCreate, "Create patch must roll back when release is unknown");
query(initialRelease);
query(initialCreate.replace("v_quantity integer", "v_quantity /* drift */ integer"));
assert.match(query(migration, true).stderr, /UNKNOWN_CREATE_ORDER_BASELINE/);
query(patchedCreate); query(patchedRelease);
query(`grant execute on function ${releaseSignature} to anon`);
assert.match(query(migration, true).stderr, /ATOMIC_CAP_ACL_PRECONDITION/);
query(`revoke execute on function ${releaseSignature} from anon`);
assert.equal(acls(), beforeAcl);
console.log(JSON.stringify({ PG17_ATOMIC_TESTS: "PASS", CONCURRENT_CAP1_SUCCESS_COUNT: 1,
  CONCURRENT_CAP1_FAIL_COUNT: 1, FINAL_CAP1_STOCK: 0, NEGATIVE_STOCK: false,
  CREATE_ORDER_BASELINE_HASH: fingerprint(initialCreate + "\n"),
  RELEASE_INVENTORY_BASELINE_HASH: fingerprint(initialRelease + "\n"),
  REAL_SUPPLIER_REQUESTS: 0, PRODUCTION_CHANGED: "NO" }));
