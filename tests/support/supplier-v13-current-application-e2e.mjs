// Real loopback PostgreSQL plus BitrefillFakeTransport only. No provider HTTP.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createBitrefillPurchaseRpcAdapter, recoverBitrefillOfflineAttempt,
  runBitrefillOfflinePurchase } from "../../lib/providers/bitrefill/purchase-persistence.mjs";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const dbName = process.env.V13_PGDATABASE;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const expectedData = process.env.V13_EXPECTED_DATA_DIRECTORY;
assert.equal(host, "127.0.0.1");
assert.equal(port, "55433");
assert.equal(dbName, "jianlian_bitrefill_v13_current_schema");
assert.ok(user && psql && expectedData && process.env.PGPASSWORD);
assert.match(resolve(expectedData).toLowerCase(), /[\\/]_bitrefill_v13_local_pg[\\/]data$/);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
function query(sql) {
  const result = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port,
    "-U", user, "-d", dbName, "-Atqc", sql], {
    encoding: "utf8", windowsHide: true, env: process.env,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
assert.equal(query("select current_database() || '|' || host(inet_server_addr()) || '|' || current_setting('data_directory')"),
  `${dbName}|127.0.0.1|${expectedData.replaceAll("\\", "/")}`);
const signatures = {
  internal_supplier_purchase_claim: ["p_supplier", "p_logical_key", "p_semantic_hash", "p_items"],
  internal_supplier_purchase_transition: ["p_attempt_id", "p_expected_status", "p_next_status", "p_external_invoice_id"],
  internal_supplier_purchase_record_child: ["p_attempt_item_id", "p_external_order_id"],
  internal_supplier_purchase_record_evidence: ["p_attempt_id", "p_external_order_row_id", "p_status", "p_result_class", "p_safe_fingerprint", "p_checked_at"],
  internal_supplier_purchase_record_webhook: ["p_supplier", "p_event_fingerprint", "p_external_invoice_id", "p_external_order_id"],
};
const client = {
  async rpc(name, args) {
    try {
      const names = signatures[name];
      assert.ok(names, "UNKNOWN_RPC");
      const values = names.map((field) => field === "p_items"
        ? `${quote(JSON.stringify(args[field]))}::jsonb`
        : args[field] === null ? "null" : quote(args[field]));
      return { data: JSON.parse(query(`set role service_role;
        select public.${name}(${values.join(",")})`)), error: null };
    } catch (error) { return { data: null, error }; }
  },
  from(table) {
    assert.equal(table, "supplier_purchase_attempts");
    return {
      select(columns) {
        assert.equal(columns, "id,status,external_invoice_id,semantic_request_hash");
        return {
          eq(field, value) {
            assert.equal(field, "id");
            return {
              async single() {
                try {
                  const row = query(`set role service_role; select row_to_json(s) from
                    (select ${columns} from public.${table} where id=${quote(value)}) s`);
                  return { data: JSON.parse(row), error: null };
                } catch (error) { return { data: null, error }; }
              },
            };
          },
        };
      },
    };
  },
};
const persistence = createBitrefillPurchaseRpcAdapter(client);
const product = {
  provider: "bitrefill", external_product_id: "synthetic-apple-us", currency: "USD",
  availability: "available", fixed_packages: [{
    package_id: "synthetic-apple-5", face_value: "5.00", currency: "USD", price: "4.80",
  }],
};
function seedItems(count) {
  const order = randomUUID();
  const userId = randomUUID();
  query(`insert into public.orders(id,order_no,user_id,status,payment_status)
    values('${order}','synthetic-app-${order}','${userId}','paid','paid')`);
  const items = Array.from({ length: count }, () => ({ orderItemId: randomUUID(),
    fulfillmentRequestId: randomUUID(), product, quantity: 1,
    binding: { supplier: "bitrefill", productId: "synthetic-apple-us",
      sku: "synthetic-apple-5", currency: "USD", faceValue: "5.00" },
    expectedCost: "4.80", frozenQuotedCost: "4.80", frozenMaxSupplierCost: "5.00" }));
  const itemRows = items.map(({ orderItemId }) =>
    `('${orderItemId}','${order}','SYNTHETIC_V13_APP',5,5,1,'automatic',
    '{"supplier_binding":{"fulfillment_source":"supplier","supplier":"bitrefill",
    "supplier_product_id":"synthetic-apple-us","supplier_sku":"synthetic-apple-5"}}'::jsonb)`).join(",");
  query(`insert into public.order_items
    (id,order_id,product_name,unit_price,line_total,quantity,delivery_type,product_snapshot)
    values ${itemRows}`);
  const roots = items.map(({ orderItemId, fulfillmentRequestId }) =>
    `('${fulfillmentRequestId}','${order}','${orderItemId}','bitrefill',
    'synthetic-apple-us','synthetic-apple-5','synthetic-app-root-${fulfillmentRequestId}','PENDING')`).join(",");
  query(`insert into public.supplier_fulfillment_requests
    (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
    values ${roots}`);
  return items;
}
class SequencedFakeTransport extends BitrefillFakeTransport {
  constructor() { super(); this.ids = []; }
  async createInvoice(request) {
    this.invoiceSubmissions += 1;
    assert.ok(request.products.length <= 20);
    const id = `synthetic-invoice-${randomUUID()}`;
    this.ids.push(id);
    return { id, status: "pending", orders: [] };
  }
  async readInvoice(id) {
    this.invoiceReads += 1;
    return { id, status: "pending", orders: [] };
  }
}

const items21 = seedItems(21);
const firstTransport = new SequencedFakeTransport();
const logical21 = `synthetic-app-${randomUUID()}`;
const submitted = await runBitrefillOfflinePurchase({ db: persistence,
  transport: firstTransport, logicalKeyPrefix: logical21, items: items21 });
assert.equal(submitted.length, 2);
assert.equal(firstTransport.invoiceSubmissions, 2);
assert.equal(query(`select count(*) from public.supplier_purchase_attempt_items i
  join public.supplier_purchase_attempts a on a.id=i.attempt_id
  where a.logical_request_key like '${logical21}:%'`), "21");
assert.equal(query(`select count(distinct external_invoice_id) from public.supplier_purchase_attempts
  where logical_request_key like '${logical21}:%'`), "2");
const firstAttemptItemId = query(`select id from public.supplier_purchase_attempt_items
  where attempt_id='${submitted[0].attemptId}' order by id limit 1`);
const syntheticChildId = `synthetic-child-${randomUUID()}`;
const mappedChild = await persistence.recordChild(firstAttemptItemId, syntheticChildId);
assert.equal(mappedChild.result, "RECORDED");
const safeFingerprint = randomUUID().replaceAll("-", "").padEnd(64, "e");
const classified = await persistence.recordEvidence(submitted[0].attemptId,
  mappedChild.external_order_row_id, "PENDING", "GET_RECONCILIATION",
  safeFingerprint, new Date().toISOString());
assert.equal(classified.result, "RECORDED");
const webhookFingerprint = randomUUID().replaceAll("-", "").padEnd(64, "f");
assert.equal((await persistence.recordWebhook(webhookFingerprint,
  submitted[0].invoiceId, syntheticChildId)).result, "RECEIVED");
assert.equal((await persistence.recordWebhook(webhookFingerprint,
  submitted[0].invoiceId, syntheticChildId)).result, "ALREADY_RECEIVED");
assert.equal(query(`select count(*) from public.supplier_webhook_receipts
  where event_fingerprint='${webhookFingerprint}'`), "1");
const restarted = new SequencedFakeTransport();
const replay = await runBitrefillOfflinePurchase({ db: persistence,
  transport: restarted, logicalKeyPrefix: logical21, items: items21 });
assert.equal(restarted.invoiceSubmissions, 0);
assert.deepEqual(replay.map((row) => row.status), ["RECONCILING", "EXTERNAL_CREATED"]);
const recovered = await recoverBitrefillOfflineAttempt({ db: persistence,
  transport: restarted, attemptId: submitted[0].attemptId });
assert.equal(restarted.invoiceReads, 1);
assert.equal(recovered.invoiceState, "PENDING");

const beforeItems = seedItems(1);
const beforeKey = `synthetic-before-${randomUUID()}`;
let interrupted = false;
await assert.rejects(runBitrefillOfflinePurchase({
  db: { ...persistence, async getAttempt(id) {
    if (!interrupted) { interrupted = true; throw new Error("SYNTHETIC_PROCESS_TERMINATED"); }
    return persistence.getAttempt(id);
  } }, transport: new SequencedFakeTransport(), logicalKeyPrefix: beforeKey,
  items: beforeItems,
}), /SYNTHETIC_PROCESS_TERMINATED/);
assert.equal(query(`select status from public.supplier_purchase_attempts
  where logical_request_key='${beforeKey}:1'`), "CLAIMED");
const afterRestart = new SequencedFakeTransport();
assert.equal((await runBitrefillOfflinePurchase({ db: persistence, transport: afterRestart,
  logicalKeyPrefix: beforeKey, items: beforeItems }))[0].status, "EXTERNAL_CREATED");
assert.equal(afterRestart.invoiceSubmissions, 1);

const afterItems = seedItems(1);
const afterKey = `synthetic-after-${randomUUID()}`;
const maybeSent = new BitrefillFakeTransport({ submitTimeoutAfterAccept: true });
const uncertain = await runBitrefillOfflinePurchase({ db: persistence,
  transport: maybeSent, logicalKeyPrefix: afterKey, items: afterItems });
assert.equal(uncertain[0].status, "UNCERTAIN");
assert.equal(maybeSent.invoiceSubmissions, 1);
const noRetry = new SequencedFakeTransport();
const uncertainReplay = await runBitrefillOfflinePurchase({ db: persistence,
  transport: noRetry, logicalKeyPrefix: afterKey, items: afterItems });
assert.equal(uncertainReplay[0].status, "UNCERTAIN");
assert.equal(noRetry.invoiceSubmissions, 0);
const noId = await recoverBitrefillOfflineAttempt({ db: persistence,
  transport: noRetry, attemptId: uncertain[0].attemptId });
assert.equal(noId.requiresManualReview, true);
assert.equal(noRetry.invoiceReads, 0);
await assert.rejects(runBitrefillOfflinePurchase({ db: persistence,
  transport: { kind: "http", readOnlyMode: true },
  logicalKeyPrefix: `synthetic-${randomUUID()}`, items: seedItems(1),
}), /BITREFILL_REAL_PURCHASE_DISABLED/);
console.log("V13_CURRENT_APP_CLAIM_20_PLUS_1_RESTART_UNCERTAIN_GET_RECOVERY_FAKE_ONLY_PASS");
