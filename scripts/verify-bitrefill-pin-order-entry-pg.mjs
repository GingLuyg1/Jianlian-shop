// Focused synthetic PIN E2E against the exact existing DB9 RPC bodies.
// Never reads a database URL, .env, supplier credential or customer data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { fixturePaths, expectedMigrationSha256, migrationSha256, repoOutcomeDefinition } from "../tests/support/supplier-v13-local-fixture.mjs";
import { pinFixture, PinFakeTransport } from "../tests/support/bitrefill-pin-fixture.mjs";
import { createBitrefillPinOrderAuthorizer, GIFFGAFF_PIN_SKUS } from "../lib/providers/bitrefill/pin-order-entry.mjs";
import { createBitrefillPinFulfillment } from "../lib/providers/bitrefill/pin-fulfillment.mjs";
import { loadActualLocalDeliveryEntry } from "../tests/support/bitrefill-p2-delivery-entry.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
globalThis.fetch = async () => { throw Error("PIN_SYNTHETIC_EXTERNAL_HTTP_BLOCKED"); };
const dockerMode = process.argv.includes("--isolated-ci-container");
const evidence = dockerMode ? process.env.PIN_TEST_EVIDENCE : "D:/Jianlian/_bitrefill_pin_order_entry_v2_20261101";
assert.ok(evidence && (dockerMode || evidence.startsWith("D:/Jianlian/_")));
const container = process.env.PIN_TEST_CONTAINER;
if (dockerMode) assert.ok(process.env.CI === "true" && /^[a-f0-9]{12,64}$/.test(container ?? ""), "CI_CONTAINER_ID_REQUIRED");
else assert.ok(process.argv.includes("--isolated-local") && process.platform === "win32", "EXPLICIT_SYNTHETIC_MODE_REQUIRED");
fs.mkdirSync(evidence, { recursive: true });
const run = path.join(evidence, "pin-entry-pg-" + randomBytes(4).toString("hex"));fs.mkdirSync(run);
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
  internal_bitrefill_pin_entry_status: ["p_user","p_request","p_product","p_sku"],
  internal_bitrefill_pin_authorize_quote: ["p_user","p_request","p_product","p_sku","p_evidence"],
  internal_bitrefill_pin_read_order_binding: ["p_order_item_id"],
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
      assert.ok(signatures[name]);const values = signatures[name].map(k => args[k] == null ? "null" : ["p_items","p_evidence"].includes(k) ? literal(JSON.stringify(args[k])) + "::jsonb" : typeof args[k] === "boolean" ? String(args[k]) : literal(args[k]));
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

async function runOrderEntryCases() {
  await sql(fs.readFileSync(path.join(root,'tests/fixtures/current-schema/bitrefill-pin-order-entry-support.sql'),'utf8'));
  const original = fs.readFileSync(path.join(root,'tests/fixtures/current-schema/bitrefill-pin-order-entry-current.sql'),'utf8')+';';
  await sql(original);
  assert.equal(await sql("select md5(replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\\r',''))"),'c45e1803c49709ae7480c30ac83f19a5');
  const category='94319387-0291-4e58-b9fd-e25fbdfbfaf1';
  const products=['e00553bf-a2da-48c7-9bdc-9b897b18b2fd','5e4025b0-9a14-4827-87a2-f7f3e0e79734','b2878f67-344a-40e4-af59-b32b6db21d29'];
  const createOrder=async (input) => {
    const source=`select row_to_json(x) from public.create_order_with_item(${literal(input.productId)},${input.quantity},null,null,null,null,null,${literal(input.skuId)},'balance',${literal(input.clientRequestId)}) x`;
    return JSON.parse((await sql(`select set_config('request.jwt.claim.sub',${literal(input.userId)},false);${source}`,'authenticated')).split(/\r?\n/).at(-1));
  };
  const entry=(index=0)=>({userId:randomUUID(),productId:products[index],skuId:GIFFGAFF_PIN_SKUS[index],quantity:1,clientRequestId:randomUUID()});
  const items=o=>sql(`select row_to_json(i) from public.order_items i where order_id=${literal(o.order_id)}`).then(JSON.parse);
  // Run original Daju and local inventory paths before patch, then compare all
  // business fields afterwards. No external Daju handler or payment is called.
  const dajuProduct=randomUUID(),dajuSku=randomUUID(),localProduct=randomUUID(),localSku=randomUUID();
  const meta=JSON.stringify({fulfillment_source:'supplier',supplier:'daju',supplier_product_id:'synthetic-daju',supplier_sku:'daju-package',supplier_max_unit_cost:'3'});
  await sql(`insert into public.products(id,name,slug,price,status,delivery_type,category_id,metadata) values(${literal(dajuProduct)},'Daju','daju-test',20,'active','auto_delivery',${literal(category)},${literal(meta)}::jsonb),(${literal(localProduct)},'Local','local-test',20,'active','auto_delivery',${literal(category)},'{}');
    insert into public.product_skus(id,product_id,price,status,delivery_type) values(${literal(dajuSku)},${literal(dajuProduct)},20,'active','auto_delivery'),(${literal(localSku)},${literal(localProduct)},20,'active','auto_delivery');
    insert into public.digital_inventory(product_id,sku_id,content) select ${literal(localProduct)},${literal(localSku)},'SYNTHETIC_LOCAL' from generate_series(1,2);
    update public.products set metadata='{"fulfillment_source":"local","supplier":"local"}' where id=${literal(localProduct)}`);
  const dIn={...entry(),productId:dajuProduct,skuId:dajuSku},dBefore=await items(await createOrder(dIn));
  const lIn={...entry(),productId:localProduct,skuId:localSku};await createOrder(lIn);
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261101064049_bitrefill_pin_order_entry_v2.sql'),'utf8');
  await sql(migration);pass('EXACT_BASELINE_FINGERPRINT_AND_MIGRATION');
  const patchedOrderFunction=await sql("select pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure)");
  fs.writeFileSync(path.join(run,'patched-order-function.sql'),patchedOrderFunction+';\n');
  fs.writeFileSync(path.join(run,'patched-order-md5.txt'),await sql("select md5(replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\\r',''))"));
  await assert.rejects(sql(migration),/BITREFILL_PIN_ORDER_BASELINE_DRIFT/);pass('MIGRATION_REPLAY_DRIFT_REJECTED_WITHOUT_PARTIAL_WRITE');
  const dAfter=await items(await createOrder({...dIn,clientRequestId:randomUUID()}));
  assert.deepEqual(dBefore.product_snapshot,dAfter.product_snapshot);assert.equal(dBefore.unit_price,dAfter.unit_price);
  await createOrder({...lIn,clientRequestId:randomUUID()});
  assert.equal(await sql(`select count(*) from public.digital_inventory where product_id=${literal(localProduct)} and status='reserved'`),'2');
  pass('DAJU_FROZEN_SNAPSHOT_AND_LOCAL_INVENTORY_UNCHANGED');
  const evidence=index=>{const f=pinFixture(['10','15','20'][index]);return {source:'synthetic_pin_order_quote',productId:f.pricing.catalogRaw.id,packageId:f.pricing.quote.packageId,faceValue:['10','15','20'][index],faceCurrency:'GBP',country:'GB',purchaseCurrency:'USD',deliveryKind:'pin',accountFingerprint:'a'.repeat(64),allInUsd:f.pricing.quote.allInUsd,fxRate:'6.70',cnyFees:'0.10',availableUsd:'100',reservedUsd:'0',spentUsd:'0',salePriceCny:f.financial.paidItemAmount,checkedAt:f.pricing.quote.checkedAt,fxCheckedAt:f.pricing.quote.checkedAt,balanceCheckedAt:f.balance.checkedAt,expiresAt:f.pricing.quote.expiresAt,fxExpiresAt:f.pricing.quote.expiresAt,feesIncluded:true,cnyFeesVerified:true,supplierEnforcedCap:true,available:true,atomicBudgetReady:true,accountPermissionVerified:true};};
  let input=entry();
  await assert.rejects(createOrder(input),/BITREFILL_PIN_SALE_CLOSED/);pass('DISABLED_SCOPE_BLOCKS_DIRECT_CUSTOMER_RPC');
  await sql("update bitrefill_pin_private.sale_authorizations set enabled=true,account_fingerprint=repeat('a',64),permission_reference='SYNTHETIC_PIN_TEST_ONLY',funding_reference='SYNTHETIC_BUDGET',max_unit_cost_usd=30,min_profit_cny=1,cumulative_cap_usd=100 where sku_id in ("+GIFFGAFF_PIN_SKUS.map(literal).join(',')+")");
  const issue=async(input,e)=>{const r=await client().rpc('internal_bitrefill_pin_authorize_quote',{p_user:input.userId,p_request:input.clientRequestId,p_product:input.productId,p_sku:input.skuId,p_evidence:e});if(r.error)throw r.error;return r.data;};
  await assert.rejects(createOrder(input),/BITREFILL_PIN_ORDER_QUOTE_REQUIRED/);pass('NO_QUOTE_CANNOT_BYPASS_STOCK_WITH_CUSTOMER_RPC');
  const {deliverDigitalOrder}=await loadActualLocalDeliveryEntry(root);
  for(let index=0;index<3;index++) {
    input=entry(index);const ev=evidence(index),f=pinFixture(['10','15','20'][index]),t=new PinFakeTransport(f);
    const authorize=createBitrefillPinOrderAuthorizer({service:client(),transport:t,loadEvidence:async()=>ev});
    await authorize(input);const o=await createOrder(input),i=await items(o);
    assert.equal(o.payment_status,'unpaid');assert.equal(i.product_snapshot.supplier_binding.supplier,'bitrefill');
    assert.equal(i.product_snapshot.supplier_binding.supplier_max_unit_cost,undefined);
    assert.equal(i.product_snapshot.supplier_binding.supplier_min_unit_profit,undefined);
    assert.equal(i.product_snapshot.supplier_binding.pin_account_fingerprint,undefined);
    assert.equal(i.product_snapshot.supplier_binding.pin_authorization_reference,undefined);
    assert.equal(await sql(`select payment_expires_at<=now()+interval '5 minutes' from public.orders where id=${literal(o.order_id)}`),'t');
    assert.equal(i.sku_id,input.skuId);assert.equal(await sql(`select stock from public.product_skus where id=${literal(input.skuId)}`),'0');
    assert.equal(await sql(`select count(*) from public.digital_inventory where reserved_order_id=${literal(o.order_id)}`),'0');
    assert.equal((await createOrder(input)).order_id,o.order_id);
    await assert.rejects(createOrder({...input,quantity:2}),/BITREFILL_PIN_REQUEST_CONFLICT/);
    await assert.rejects(createOrder({...input,productId:products[(index+1)%3],skuId:GIFFGAFF_PIN_SKUS[(index+1)%3]}),/BITREFILL_PIN_REQUEST_CONFLICT/);
    f.candidate.order={...f.candidate.order,id:o.order_id,user_id:input.userId};
    f.candidate.orderItem={...f.candidate.orderItem,...i};f.financial.orderId=o.order_id;f.financial.orderItemId=i.id;
    const w=worker(f,t);
    await assert.rejects(w.dispatch(),/ORDER_NOT_ELIGIBLE/);assert.equal(t.invoiceSubmissions,0);
    // Explicit synthetic payment boundary; actual payment core is unchanged.
    await sql(`update public.orders set status='paid',payment_status='paid' where id=${literal(o.order_id)}`);
    const svc=client();const stages=[];
    const entryClient={from:svc.from,rpc:async(name,args)=>{
      if(name==='reserve_local_inventory_for_daju_order'){stages.push('local-first');return {data:{ok:true,local_ready_count:0,supplier_fallback_count:1,blocked_count:0},error:null};}
      if(name==='deliver_digital_order')return {data:{ok:true,delivered_count:0},error:null};
      return svc.rpc(name,args);
    }};
    for(let n=0;n<3;n++)await deliverDigitalOrder(entryClient,o.order_id,'synthetic_v2_entry',undefined,w.handler);
    assert.equal(t.invoiceSubmissions,1);assert.equal(await countDeliveries(f),'1');assert.equal(w.reserveCalls(),1);
    assert.equal(stages[0],'local-first');
    const ownerRead=await sql(`select set_config('request.jwt.claim.sub',${literal(input.userId)},false);select count(*) from public.get_order_delivery_for_user(${literal(o.order_no)}) where content like '%SYNTHETIC_PRIVATE_PIN_1234%'`,'authenticated');
    assert.equal(ownerRead.split(/\r?\n/).at(-1),'1');
    pass('GBP_'+['10','15','20'][index]+'_REAL_ORDER_RPC_QUOTE_PRIVATE_PIN_ONE_PURCHASE_REPLAY');
  }
  for(const [name,change] of [
    ['MISSING_TIME',e=>delete e.checkedAt],['MISSING_SOURCE',e=>delete e.source],['PACKAGE_DRIFT',e=>e.packageId+='wrong'],
    ['EXPIRED',e=>e.expiresAt=new Date(Date.now()-1000).toISOString()],['FEES_UNKNOWN',e=>e.feesIncluded=false],
    ['CAP_UNENFORCED',e=>e.supplierEnforcedCap=false],['LOW_MARGIN',e=>e.allInUsd='20'],['LOW_BALANCE',e=>e.availableUsd='1'],
    ['WRONG_COUNTRY',e=>e.country='US'],['NO_PERMISSION',e=>e.accountPermissionVerified=false],['WRONG_ACCOUNT',e=>e.accountFingerprint='b'.repeat(64)]]){
    const e=evidence(0);change(e);await assert.rejects(issue(entry(),e));pass(name+'_BEFORE_ORDER');
  }
  input=entry();await issue(input,evidence(0));
  await assert.rejects(createOrder({...input,userId:randomUUID()}),/BITREFILL_PIN_ORDER_QUOTE_REQUIRED/);pass('QUOTE_BOUND_TO_AUTHENTICATED_USER');
  await sql(`update bitrefill_pin_private.order_quotes set expires_at=now()-interval '1 second' where user_id=${literal(input.userId)}`);
  await assert.rejects(createOrder(input),/BITREFILL_PIN_ORDER_QUOTE_REQUIRED/);pass('QUOTE_EXPIRY_RECHECKED_TRANSACTIONALLY');
  input=entry();await issue(input,evidence(0));
  await sql('update public.product_skus set price=111 where id='+literal(input.skuId));
  await assert.rejects(createOrder(input),/BITREFILL_PIN_ORDER_QUOTE_REQUIRED/);
  await sql('update public.product_skus set price=110 where id='+literal(input.skuId));pass('SKU_REPRICE_AFTER_QUOTE_FAILS_CLOSED');
  input=entry();await issue(input,evidence(0));
  await sql("update bitrefill_pin_private.sale_authorizations set permission_reference=null where sku_id="+literal(input.skuId));
  await assert.rejects(createOrder(input),/BITREFILL_PIN_SALE_CLOSED/);
  await sql("update bitrefill_pin_private.sale_authorizations set permission_reference='SYNTHETIC_PIN_TEST_ONLY' where sku_id="+literal(input.skuId));pass('PERMISSION_REVOCATION_RECHECKED_AT_ORDER');
  input=entry();await issue(input,evidence(0));
  await sql('update bitrefill_pin_private.sale_authorizations set max_unit_cost_usd=14 where sku_id='+literal(input.skuId));
  await assert.rejects(createOrder(input),/BITREFILL_PIN_AUTHORIZATION_CHANGED/);
  await sql('update bitrefill_pin_private.sale_authorizations set max_unit_cost_usd=30 where sku_id='+literal(input.skuId));pass('LOWERED_BUDGET_CANNOT_USE_OLD_QUOTE');
  input=entry();await issue(input,evidence(0));
  await sql("update bitrefill_pin_private.sale_authorizations set binding_version=binding_version+1 where sku_id="+literal(input.skuId));
  await assert.rejects(createOrder(input),/BITREFILL_PIN_ORDER_QUOTE_REQUIRED/);pass('REVOKED_BINDING_VERSION_FAILS_CLOSED');
  input=entry(1);await issue(input,evidence(1));const concurrent=await Promise.all(Array.from({length:4},()=>createOrder(input)));
  assert.equal(new Set(concurrent.map(o=>o.order_id)).size,1);pass('CONCURRENT_STOREFRONT_RETRIES_ONE_ORDER');
  input=entry(2);await issue(input,evidence(2));
  await sql("create function public.pin_v2_abort_order() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_ORDER_ABORT';end;$$;create trigger pin_v2_abort_order before insert on public.order_items for each row execute function public.pin_v2_abort_order()");
  await assert.rejects(createOrder(input),/SYNTHETIC_ORDER_ABORT/);
  assert.equal(await sql(`select count(*) from bitrefill_pin_private.order_quotes where user_id=${literal(input.userId)} and consumed_at is null and order_id is null`),'1');
  await sql('alter table public.order_items disable trigger pin_v2_abort_order');await createOrder(input);pass('ORDER_INSERT_ABORT_ROLLS_BACK_QUOTE_CONSUMPTION');
  for(const role of ['anon','authenticated']) {
    await assert.rejects(sql('select * from bitrefill_pin_private.order_quotes',role),/permission denied/);
    await assert.rejects(sql(`select public.internal_bitrefill_pin_authorize_quote(${literal(randomUUID())},'x',${literal(products[0])},${literal(GIFFGAFF_PIN_SKUS[0])},'{}')`,role),/permission denied/);
    pass(role.toUpperCase()+'_PRIVATE_QUOTE_AND_ISSUER_DENIED');
  }
  await assert.rejects(sql('select bitrefill_pin_private.consume_quote(null,null,null,null,1,1)','service_role'),/permission denied/);pass('SERVICE_CANNOT_IMPERSONATE_CUSTOMER_CONSUMPTION');
  // Candidate rollback is a scoped sales close, never data deletion or replay.
  await sql('update bitrefill_pin_private.sale_authorizations set enabled=false where sku_id in ('+GIFFGAFF_PIN_SKUS.map(literal).join(',')+')');
  await assert.rejects(createOrder(entry()),/BITREFILL_PIN_SALE_CLOSED/);pass('SAFE_CLOSE_PRESERVES_EXISTING_ORDER_QUOTES_AND_DELIVERIES');
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
  await runOrderEntryCases();
  if (process.argv.includes('--personal-budget')) {
    const { runPersonalBudgetCases } = await import('../tests/support/bitrefill-personal-budget-pg.mjs');
    await runPersonalBudgetCases({ sql, root, pass });
  }
} finally {
  if (started) await exec("pg_ctl",["-D",dataDir,"-w","stop","-m","fast"],"",true);
  fs.writeFileSync(path.join(run,"receipt.json"),JSON.stringify({database:db,pg17:true,completedCases:passed,passed:passed.length,productionConnected:false,supplierNetworkCalls:0,realFunds:false,clusterStopped:started,
    candidateMigrationSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'supabase/migrations/20261101064049_bitrefill_pin_order_entry_v2.sql'),'utf8').replaceAll('\r\n','\n')).digest('hex'),
    syntheticBoundaryStubs:["Auth identity","synthetic paid DB transition, no payment processor","reservation/local delivery RPC","refresh fulfillment helper","supplier responses","budget reserver"]},null,2));
}
console.log(JSON.stringify({passed:passed.length,evidence:run,productionChanged:false,realPurchases:0}));
