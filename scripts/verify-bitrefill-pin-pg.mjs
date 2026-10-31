// Focused synthetic PIN E2E against the exact existing DB9 RPC bodies.
// Never reads a database URL, .env, supplier credential or customer data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { fixturePaths, expectedMigrationSha256, migrationSha256, repoOutcomeDefinition } from "../tests/support/supplier-v13-local-fixture.mjs";
import { pinFixture, PinFakeTransport } from "../tests/support/bitrefill-pin-fixture.mjs";
import { createBitrefillPinFulfillment } from "../lib/providers/bitrefill/pin-fulfillment.mjs";
import { loadActualLocalDeliveryEntry } from "../tests/support/bitrefill-p2-delivery-entry.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
globalThis.fetch = async () => { throw Error("PIN_SYNTHETIC_EXTERNAL_HTTP_BLOCKED"); };
const dockerMode = process.argv.includes("--isolated-ci-container");
const evidence = dockerMode ? process.env.PIN_TEST_EVIDENCE : "D:/Jianlian/_bitrefill_pin_auto_purchase_v1_20261101";
assert.ok(evidence && (dockerMode || evidence.startsWith("D:/Jianlian/_")));
const container = process.env.PIN_TEST_CONTAINER;
if (dockerMode) assert.ok(process.env.CI === "true" && /^[a-f0-9]{12,64}$/.test(container ?? ""), "CI_CONTAINER_ID_REQUIRED");
else assert.ok(process.argv.includes("--isolated-local") && process.platform === "win32", "EXPLICIT_SYNTHETIC_MODE_REQUIRED");
fs.mkdirSync(evidence, { recursive: true });
const run = path.join(evidence, "pin-pg-" + randomBytes(4).toString("hex"));fs.mkdirSync(run);
const bin = "D:/Jianlian/_bitrefill_v13_local_pg/portable/pgsql/bin";
const dataDir = path.join(run, "data");
const db = "jianlian_bitrefill_v13_db5_" + randomBytes(4).toString("hex");
const user = dockerMode ? "postgres" : "pin_synthetic_owner";
let port, started = false, expectedData, passed = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/i.test(k)));
function exec(tool, args, input = "", detachedPipes = false) {
  const command = dockerMode ? "docker" : path.join(bin, tool + ".exe");
  const argv = dockerMode ? ["exec", "-i", container, tool, ...args] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { env: environment, windowsHide: true, shell: false, stdio: detachedPipes ? "ignore" : ["pipe", "pipe", "pipe"] });
    let out = "", err = "";const timer = setTimeout(() => { child.kill();reject(Error("PIN_TEST_PROCESS_TIMEOUT")); }, 120000);
    child.stdout?.on("data", b => { out += b;if (out.length > 4 * 1024 * 1024) child.kill(); });
    child.stderr?.on("data", b => { if (err.length < 10000) err += b; });
    child.on("error", e => { clearTimeout(timer);reject(e); });
    child.on("close", code => { clearTimeout(timer);code === 0 ? resolve(out.trim()) : reject(Error(`PIN_TEST_${tool}_EXIT_${code}:` + err.slice(0, 1800))); });
    if (child.stdin) { child.stdin.on("error", () => {});child.stdin.end(input); }
  });
}
const literal = s => "'" + String(s).replaceAll("'", "''") + "'";
async function sql(source, role = "postgres", database = db) {
  const prefix = role ? `set role ${role}; set request.jwt.claim.role=${literal(role)};` : "";
  return exec("psql", ["-X", "-q", "-A", "-t", "-w", "-h", "127.0.0.1", "-p", String(port), "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"],
    `set statement_timeout='10s';set lock_timeout='3s';${prefix}${source}`);
}
const signatures = {
  claim_supplier_fulfillment: ["p_order_id", "p_order_item_id", "p_supplier", "p_request_id", "p_supplier_product_id", "p_supplier_sku", "p_trigger_source"],
  internal_supplier_purchase_claim: ["p_supplier", "p_logical_key", "p_semantic_hash", "p_items"],
  internal_supplier_purchase_transition: ["p_attempt_id", "p_expected_status", "p_next_status", "p_external_invoice_id"],
  internal_supplier_purchase_record_child: ["p_attempt_item_id", "p_external_order_id"],
  internal_supplier_purchase_record_evidence: ["p_attempt_id", "p_external_order_row_id", "p_status", "p_result_class", "p_safe_fingerprint", "p_checked_at"],
  internal_supplier_purchase_deliver_child: ["p_external_order_row_id", "p_request_id", "p_attempt_token", "p_delivery_content"],
  record_supplier_fulfillment_outcome: ["p_order_id", "p_order_item_id", "p_supplier", "p_request_id", "p_attempt_token", "p_status", "p_retryable", "p_error_code", "p_provider_order_code", "p_delivery_content", "p_supplier_unit_price", "p_supplier_total_price", "p_trigger_source"],
};
const tables = new Set(["orders", "order_items", "supplier_fulfillment_requests", "supplier_purchase_attempts", "supplier_purchase_attempt_items", "supplier_external_orders"]);
function client() {
  return {
    async rpc(name, args) { try {
      assert.ok(signatures[name]);const values = signatures[name].map(k => args[k] == null ? "null" : k === "p_items" ? literal(JSON.stringify(args[k])) + "::jsonb" : typeof args[k] === "boolean" ? String(args[k]) : literal(args[k]));
      return { data: JSON.parse(await sql(`select public.${name}(${values.join(",")})`, "service_role")), error: null };
    } catch (error) { return { data: null, error }; } },
    from(table) { assert.ok(tables.has(table));return { select(columns) { assert.match(columns, /^[a-z_,]+$/);return { eq(field, value) {
      assert.match(field, /^[a-z_]+$/);const fetch = async single => { try { const rows = JSON.parse(await sql(`select coalesce(json_agg(r),'[]') from (select ${columns} from public.${table} where ${field}=${literal(value)}) r`, "service_role"));return { data: single ? rows[0] ?? null : rows, error: null }; } catch (error) { return { data: null, error }; } };
      return { single: () => fetch(true), then: (yes, no) => fetch(false).then(yes, no) };
    } }; } }; },
  };
}
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), "utf8"), start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);const tail = source.slice(start), delim = tail.match(/\bas\s+(\$[a-z_]*\$)/i);
  assert.ok(delim);const end = tail.indexOf(delim[1] + ";", delim.index + delim[0].length);assert.ok(end > 0);
  return tail.slice(0, end + delim[1].length + 1);
}
const pass = name => { passed.push(name);console.log("PIN_E2E_PASS=" + name); };
async function seed(face = "10", paid = true) {
  const f = pinFixture(face), o = f.candidate.order, i = f.candidate.orderItem;
  await sql(`insert into public.products(id) values(${literal(i.product_id)});insert into public.product_skus(id) values(${literal(i.sku_id)});
    insert into public.orders(id,order_no,user_id,status,payment_status,currency) values(${literal(o.id)},${literal("pin-test-" + o.id)},${literal(o.user_id)},${literal(paid ? "paid" : "pending_payment")},${literal(paid ? "paid" : "unpaid")},'CNY');
    insert into public.order_items(id,order_id,product_id,sku_id,product_name,unit_price,line_total,quantity,delivery_type,delivery_status,product_snapshot)
    values(${literal(i.id)},${literal(o.id)},${literal(i.product_id)},${literal(i.sku_id)},'SYNTHETIC PIN',${literal(i.unit_price)},${literal(i.unit_price)},1,'auto_delivery','pending',${literal(JSON.stringify(i.product_snapshot))}::jsonb)`);
  return f;
}
const countDeliveries = f => sql(`select count(*) from public.order_deliveries where order_id=${literal(f.candidate.order.id)}`);
const attempt = f => sql(`select coalesce(json_agg(a),'[]') from public.supplier_purchase_attempts a where logical_request_key=${literal("bitrefill:" + f.candidate.orderItem.id + ":1")}`).then(JSON.parse);
function worker(f, transport, overrides = {}) {
  let reserveCalls = 0;const receipts = new Map();
  const handler = createBitrefillPinFulfillment({ transport,
    loadPricing: overrides.loadPricing ?? (async () => structuredClone(f.pricing)),
    loadFinancialEvidence: async () => structuredClone(f.financial),
    loadSupplierBalance: async () => structuredClone(f.balance),
    reserveBudget: overrides.reserveBudget ?? (async x => { reserveCalls++;if (!receipts.has(x.logicalKey)) receipts.set(x.logicalKey, { reserved: true, ...x, reservationId: "SYNTHETIC_RESERVATION" });return receipts.get(x.logicalKey); }),
  });
  return { handler, dispatch: () => handler(client(), f.candidate.order.id, "synthetic_pin_test"), reserveCalls: () => reserveCalls };
}

try {
  if (dockerMode) { port = 5432;expectedData = await sql("select current_setting('data_directory')", null, "pin_isolated_anchor"); }
  else {
    assert.match(await exec("postgres", ["--version"]), /17\./);
    const listener = createServer();await new Promise((resolve, reject) => { listener.once("error", reject);listener.listen(0, "127.0.0.1", resolve); });port = listener.address().port;await new Promise(resolve => listener.close(resolve));
    await exec("initdb", ["-D", dataDir, "-U", user, "--auth=trust", "--encoding=UTF8", "--locale=C"]);
    fs.writeFileSync(path.join(dataDir, "postgresql.auto.conf"), `listen_addresses='127.0.0.1'\nport=${port}\nshared_buffers='16MB'\nmax_connections=20\nmax_worker_processes=0\njit=off\nlogging_collector=off\nlog_statement='none'\n`);
    await exec("pg_ctl", ["-D", dataDir, "-l", path.join(run, "postgres.log"), "-w", "start"], "", true);started = true;
    expectedData = await sql("select current_setting('data_directory')", null, "postgres");
    assert.equal(expectedData.replaceAll("\\", "/"), dataDir.replaceAll("\\", "/"));
    await sql("create role postgres nologin bypassrls;grant pg_read_all_settings to postgres;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls", null, "postgres");
  }
  assert.match(await sql("select current_setting('server_version')", null, dockerMode ? "pin_isolated_anchor" : "postgres"), /^17\./);
  await sql(`create database ${db} owner postgres`, null, dockerMode ? "pin_isolated_anchor" : "postgres");
  assert.equal(await sql("select current_database()||'|'||host(inet_server_addr())"), db + "|127.0.0.1");
  assert.equal(migrationSha256(), expectedMigrationSha256);
  const apply = async file => sql(`set v13.expected_data_directory=${literal(expectedData)};` + fs.readFileSync(file, "utf8").replace(/^\\set.*$/mg, ""));
  await apply(fixturePaths.baseline);await apply(fixturePaths.support);await sql(repoOutcomeDefinition());await apply(fixturePaths.migration);
  await sql("alter table public.orders add column currency text not null default 'CNY';alter table public.order_deliveries add column viewed_at timestamptz,add column delivery_note text;");
  for (const [file,name] of [["supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql","normalize_order_item_delivery_type"],
    ["supabase/migrations/20260826190000_supplier_fulfillment_core_v1.sql","claim_supplier_fulfillment"],
    ["supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql","mask_delivery_secret"],
    ["supabase/migrations/20260810190000_user_delivery_compatibility.sql","get_order_delivery_for_user"]]) await sql(extract(file,name));
  await sql("revoke all on function public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;grant execute on function public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text) to service_role;revoke all on function public.get_order_delivery_for_user(text) from public,anon;grant execute on function public.get_order_delivery_for_user(text) to authenticated,service_role;");
  const { deliverDigitalOrder } = await loadActualLocalDeliveryEntry(root);
  const stockMetadata={fulfillment_source:"supplier",supplier:"bitrefill",supplier_product_id:"giff-gaff-pin-united-kingdom",supplier_sku:"giff-gaff-pin-united-kingdom<&>10",supplier_max_unit_cost:"15",supplier_quantity_known:false,supplier_stock_snapshot:null,supplier_available:true,supplier_availability:"AVAILABLE",supplier_stock_sync_status:"synced",supplier_stock_stale:false,supplier_stock_last_success_at:new Date().toISOString()};
  const stockReady=JSON.parse(await sql(`select public.admin_evaluate_product_sku_activation('automatic','automatic',0,${literal(JSON.stringify(stockMetadata))}::jsonb,0::bigint)`));
  assert.equal(stockReady.ready,true);assert.equal(stockReady.stock,0);pass("EXISTING_DB9_BOOLEAN_STOCK_WITHOUT_FAKE_QUANTITY");
  for (const face of ["10", "15", "20"]) {
    const f = await seed(face), t = new PinFakeTransport(f), w = worker(f,t);
    const svc = client(), stages = [];
    // Existing reservation/local-RPC boundaries are explicit synthetic stubs;
    // actual TS delivery/router, DB9 and private delivery bodies are exercised.
    const entryClient = { from: svc.from, rpc: async (name,args) => {
      if (name === "reserve_local_inventory_for_daju_order") { stages.push("reserve_local");return { data: { ok:true,local_ready_count:0,supplier_fallback_count:1,blocked_count:0 },error:null }; }
      if (name === "deliver_digital_order") { stages.push("deliver_local");return { data: {ok:true,delivered_count:0},error:null }; }
      return svc.rpc(name,args);
    } };
    for (let n=0;n<3;n++) await deliverDigitalOrder(entryClient,f.candidate.order.id,"synthetic_pin",undefined,w.handler);
    assert.deepEqual(stages.slice(0,2),["reserve_local","deliver_local"]);assert.equal(t.invoiceSubmissions,1);assert.equal(w.reserveCalls(),1);
    assert.equal(await countDeliveries(f),"1");
    assert.equal(await sql(`select count(*) from public.digital_delivery_secrets s join public.order_deliveries d on d.id=s.delivery_id where d.order_id=${literal(f.candidate.order.id)} and s.content like '%SYNTHETIC_PRIVATE_PIN_1234%'`),"1");
    assert.equal(await sql(`select fulfillment_status from public.orders where id=${literal(f.candidate.order.id)}`),"delivered");
    const owner = f.candidate.order.user_id, no = "pin-test-"+f.candidate.order.id;
    assert.equal((await sql(`select set_config('request.jwt.claim.sub',${literal(owner)},false);select count(*) from public.get_order_delivery_for_user(${literal(no)}) where content like '%SYNTHETIC_PRIVATE_PIN_1234%'`,"authenticated")).split(/\r?\n/).at(-1),"1");
    await assert.rejects(sql(`select set_config('request.jwt.claim.sub',${literal(randomUUID())},false);select * from public.get_order_delivery_for_user(${literal(no)})`,"authenticated"),/order not found or access denied/);
    await assert.rejects(sql("select content from public.digital_delivery_secrets","anon"),/permission denied/);
    pass("GBP_"+face+"_CNY_PAID_USD_ONE_SUBMIT_PRIVATE_PIN_OWNER_READ");
  }
  const unpaid = await seed("10",false), ut = new PinFakeTransport(unpaid);
  await assert.rejects(worker(unpaid,ut).dispatch(),/ORDER_NOT_ELIGIBLE/);assert.equal(ut.invoiceSubmissions,0);pass("UNPAID_BLOCKED_FROM_DATABASE");
  const concurrent = await seed(), ct = new PinFakeTransport(concurrent);
  await Promise.all(Array.from({length:6},()=>worker(concurrent,ct).dispatch()));assert.equal(ct.invoiceSubmissions,1);assert.equal(await countDeliveries(concurrent),"1");pass("SIX_CONCURRENT_JOBS_ONE_DB9_CLAIM_ONE_PIN");
  const pending = await seed(), pt = new PinFakeTransport(pending,"processing");await worker(pending,pt).dispatch();assert.equal(await countDeliveries(pending),"0");pt.complete();
  await worker(pending,pt,{loadPricing:async()=>{throw Error("MUST_NOT_REPRICE_EXISTING_ATTEMPT");}}).dispatch();assert.equal(pt.invoiceSubmissions,1);assert.equal(await countDeliveries(pending),"1");pass("RESTART_QUERIES_PERSISTED_INVOICE_WITHOUT_REPURCHASE");
  const uncertain = await seed(), un = new PinFakeTransport(uncertain,"timeout");await worker(uncertain,un).dispatch();await worker(uncertain,un).dispatch();
  assert.equal(un.invoiceSubmissions,1);assert.equal((await attempt(uncertain))[0].status,"UNCERTAIN");assert.equal(await countDeliveries(uncertain),"0");pass("SUBMIT_TIMEOUT_NO_BLIND_REPURCHASE");
  for (const [name,change] of [["OUT_OF_STOCK",f=>f.pricing.catalogRaw.in_stock=false],["COST_RISE",f=>f.pricing.quote.allInUsd="30"],["MARGIN",f=>{f.financial.paidItemAmount="90";}],["BALANCE",f=>f.balance.availableAmount="1"]]) {
    const f=await seed();change(f);const t=new PinFakeTransport(f);await worker(f,t).dispatch();assert.equal(t.invoiceSubmissions,0);assert.equal((await attempt(f)).length,0);pass(name+"_ZERO_SUBMISSION");
  }
  for (const mode of ["failed","missing_pin","wrong"]) {
    const f=await seed(),t=new PinFakeTransport(f,mode);await worker(f,t).dispatch();await worker(f,t).dispatch();assert.equal(t.invoiceSubmissions,1);assert.equal(await countDeliveries(f),"0");pass(mode.toUpperCase()+"_NO_FALSE_DELIVERY_OR_REBUY");
  }
  const reserveFail=await seed(),rf=new PinFakeTransport(reserveFail);await worker(reserveFail,rf,{reserveBudget:async()=>({reserved:false})}).dispatch();
  assert.equal(rf.invoiceSubmissions,0);assert.equal((await attempt(reserveFail))[0].status,"UNCERTAIN");pass("BUDGET_RESERVATION_FAILS_BEFORE_SEND");
  const drift=await seed(),dt=new PinFakeTransport(drift);let priceReads=0;
  await worker(drift,dt,{loadPricing:async()=>{const p=structuredClone(drift.pricing);if(++priceReads>1)p.quote.allInUsd="13.41";return p;}}).dispatch();
  assert.equal(dt.invoiceSubmissions,0);assert.equal((await attempt(drift))[0].status,"UNCERTAIN");pass("FRESH_PRE_SUBMIT_PRICE_DRIFT_STOPS_BEFORE_SEND");
  const notPin=await seed(),nt=new PinFakeTransport(notPin,"processing");await worker(notPin,nt).dispatch();nt.complete();
  await sql(`update public.order_items set product_snapshot=jsonb_set(product_snapshot,'{supplier_binding,supplier_delivery_kind}','"gift_card"'::jsonb) where id=${literal(notPin.candidate.orderItem.id)}`);
  await worker(notPin,nt).dispatch();assert.equal(nt.invoiceSubmissions,1);assert.equal(await countDeliveries(notPin),"0");pass("AUXILIARY_PIN_WITHOUT_FROZEN_PIN_KIND_REJECTED");
  const refund=await seed(),ft=new PinFakeTransport(refund,"processing");await worker(refund,ft).dispatch();ft.complete();refund.financial.refundState="pending";
  await worker(refund,ft).dispatch();assert.equal(ft.invoiceSubmissions,1);assert.equal(await countDeliveries(refund),"0");pass("REFUND_RISK_AFTER_SUPPLIER_SUBMIT_BLOCKS_PRIVATE_DELIVERY");
  const rollback=await seed(),rt=new PinFakeTransport(rollback);
  await sql("create function public.pin_test_abort_secret() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_PRIVATE_WRITE_ABORT';end;$$;create trigger pin_test_abort_secret before insert on public.digital_delivery_secrets for each row execute function public.pin_test_abort_secret();");
  await worker(rollback,rt).dispatch();assert.equal(await countDeliveries(rollback),"0");
  await sql("alter table public.digital_delivery_secrets disable trigger pin_test_abort_secret");
  await worker(rollback,rt).dispatch();assert.equal(rt.invoiceSubmissions,1);assert.equal(await countDeliveries(rollback),"1");pass("PRIVATE_TRANSACTION_ROLLBACK_THEN_QUERY_REDELIVER_NO_REBUY");
} finally {
  if (started) await exec("pg_ctl",["-D",dataDir,"-w","stop","-m","fast"],"",true);
  fs.writeFileSync(path.join(run,"receipt.json"),JSON.stringify({database:db,pg17:true,completedCases:passed,passed:passed.length,productionConnected:false,supplierNetworkCalls:0,realFunds:false,clusterStopped:started,syntheticBoundaryStubs:["Auth identity","reservation/local delivery RPC","refresh fulfillment helper","supplier responses","budget reserver"]},null,2));
}
console.log(JSON.stringify({passed:passed.length,evidence:run,productionChanged:false,realPurchases:0}));
