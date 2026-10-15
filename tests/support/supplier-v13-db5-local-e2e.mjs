// Reproducible, local-only PostgreSQL 17.11 + BitrefillFakeTransport E2E.
// Required env: V13_PGHOST, V13_PGPORT, V13_PGUSER, V13_PSQL_PATH,
// V13_EXPECTED_DATA_DIRECTORY, PGPASSWORD. No Production/Test DB connection.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installV13LocalFixture } from "./supplier-v13-local-fixture.mjs";
import { createBitrefillPurchaseRpcAdapter, deliverBitrefillOfflineChild,
  handleBitrefillOfflineWebhook, reconcileBitrefillOfflineAttempt,
  recoverBitrefillOfflineAttempt, runBitrefillOfflinePurchase,
} from "../../lib/providers/bitrefill/purchase-persistence.mjs";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";

const host = process.env.V13_PGHOST;
const port = process.env.V13_PGPORT;
const user = process.env.V13_PGUSER;
const psql = process.env.V13_PSQL_PATH;
const expectedData = process.env.V13_EXPECTED_DATA_DIRECTORY;
assert.equal(host, "127.0.0.1", "DB5_LOOPBACK_ONLY");
assert.equal(port, "55433", "DB5_ISOLATED_PORT_ONLY");
assert.ok(user && psql && expectedData && process.env.PGPASSWORD, "DB5_LOCAL_ENV_REQUIRED");
assert.equal(basename(dirname(resolve(expectedData))).toLowerCase(), "_bitrefill_v13_local_pg");
assert.equal(basename(resolve(expectedData)).toLowerCase(), "data");
const psqlDir = dirname(resolve(psql));
assert.equal(basename(psqlDir).toLowerCase(), "bin");
const tool = (name) => resolve(psqlDir, `${name}.exe`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dbName = `jianlian_bitrefill_v13_db5_${randomBytes(4).toString("hex")}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const connection = (database) => ["-h", host, "-p", port, "-U", user, "-d", database];
function command(file, args, { input } = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(file, args, { shell: false, windowsHide: true,
      env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (part) => { stdout += part; });
    child.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; });
    child.on("error", rejectCommand);
    child.on("close", (code) => resolveCommand({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.end(input);
  });
}
async function sql(statement, database = dbName, role = null) {
  const prefix = role ? `set role ${role}; select set_config('request.jwt.claim.role',${quote(role)},false); ` : "";
  const result = await command(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-At",
    ...connection(database), "-c", prefix + statement]);
  if (result.code !== 0) throw new Error(`LOCAL_PSQL_FAILED: ${result.stderr}`);
  return result.stdout.split(/\r?\n/).filter((line) => line !== "SET" && line !== role).join("\n").trim();
}
async function sqlFails(statement, role, expected) {
  await assert.rejects(sql(statement, dbName, role), (error) => error.message.includes(expected), expected);
}
async function applyFile(path) {
  const result = await command(psql, ["-X", "-v", "ON_ERROR_STOP=1", ...connection(dbName),
    "-c", `select set_config('v13.expected_data_directory',${quote(expectedData)},false)`,
    "-f", path]);
  assert.equal(result.code, 0, result.stderr);
}
const pgIdentity = await sql(`select current_user || '|' || current_setting('data_directory') ||
  '|' || host(inet_server_addr()) || '|' || current_setting('server_version') ||
  '|' || (to_regclass('public.orders') is null)::text`, "postgres");
assert.equal(pgIdentity, `${user}|${expectedData.replaceAll("\\", "/")}|127.0.0.1|17.11|true`,
  "DB5_LOCAL_CLUSTER_IDENTITY_FAILED");
assert.equal(await sql(`select count(*) from pg_database where datname=${quote(dbName)}`, "postgres"), "0");
const created = await command(tool("createdb"), ["-h", host, "-p", port, "-U", user, dbName]);
assert.equal(created.code, 0, created.stderr);
let createdByThisRunner = true;

const signatures = Object.freeze({
  internal_supplier_purchase_claim: ["p_supplier", "p_logical_key", "p_semantic_hash", "p_items"],
  internal_supplier_purchase_transition: ["p_attempt_id", "p_expected_status", "p_next_status", "p_external_invoice_id"],
  internal_supplier_purchase_record_child: ["p_attempt_item_id", "p_external_order_id"],
  internal_supplier_purchase_record_evidence: ["p_attempt_id", "p_external_order_row_id", "p_status", "p_result_class", "p_safe_fingerprint", "p_checked_at"],
  internal_supplier_purchase_record_webhook: ["p_supplier", "p_event_fingerprint", "p_external_invoice_id", "p_external_order_id"],
  internal_supplier_purchase_deliver_child: ["p_external_order_row_id", "p_request_id",
    "p_attempt_token", "p_delivery_content"],
  record_supplier_fulfillment_outcome: ["p_order_id", "p_order_item_id", "p_supplier", "p_request_id",
    "p_attempt_token", "p_status", "p_retryable", "p_error_code", "p_provider_order_code",
    "p_delivery_content", "p_supplier_unit_price", "p_supplier_total_price", "p_trigger_source"],
});
function localClient() {
  return {
    async rpc(name, args) {
      try {
        const params = signatures[name];
        assert.ok(params, "DB5_RPC_NOT_ALLOWLISTED");
        const values = params.map((field) => args[field] === null ? "null"
          : field === "p_items" ? `${quote(JSON.stringify(args[field]))}::jsonb`
            : typeof args[field] === "boolean" ? String(args[field]) : quote(args[field]));
        const data = JSON.parse(await sql(`select public.${name}(${values.join(",")})`, dbName, "service_role"));
        return { data, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      assert.match(table, /^(supplier_purchase_attempts|supplier_purchase_attempt_items|supplier_external_orders|supplier_fulfillment_requests)$/);
      return {
        select(columns) {
          assert.match(columns, /^[a-z_,]+$/);
          return {
            eq(field, value) {
              assert.match(field, /^[a-z_]+$/);
              const fetch = async (single) => {
                try {
                  const rows = await sql(`select coalesce(json_agg(s),'[]'::json)::text from
                    (select ${columns} from public.${table} where ${field}=${quote(value)}) s`, dbName, "service_role");
                  const parsed = JSON.parse(rows);
                  return { data: single ? parsed[0] ?? null : parsed, error: null };
                } catch (error) { return { data: null, error }; }
              };
              return { single: () => fetch(true), then: (yes, no) => fetch(false).then(yes, no) };
            },
          };
        },
      };
    },
  };
}
const product = Object.freeze({ provider: "bitrefill", external_product_id: "synthetic-apple-us",
  currency: "USD", availability: "available", fixed_packages: [{ package_id: "synthetic-apple-5",
    face_value: "5.00", currency: "USD", price: "4.80" }] });
async function seedItems(count) {
  const orderId = randomUUID();
  const userId = randomUUID();
  const items = Array.from({ length: count }, () => ({ orderItemId: randomUUID(),
    fulfillmentRequestId: randomUUID(), token: randomUUID(), product, quantity: 1,
    binding: { supplier: "bitrefill", productId: "synthetic-apple-us",
      sku: "synthetic-apple-5", currency: "USD", faceValue: "5.00" },
    expectedCost: "4.80", frozenQuotedCost: "4.80", frozenMaxSupplierCost: "5.00" }));
  await sql(`insert into public.orders(id,order_no,user_id,status,payment_status)
    values('${orderId}','synthetic-db5-${orderId}','${userId}','paid','paid')`);
  await sql(`insert into public.order_items
    (id,order_id,product_name,unit_price,line_total,quantity,delivery_type,product_snapshot)
    values ${items.map((item) => `('${item.orderItemId}','${orderId}',
      'SYNTHETIC_DB5_APPLE',5,5,1,'auto_delivery',
      '{"supplier_binding":{"fulfillment_source":"supplier","supplier":"bitrefill",
      "supplier_product_id":"synthetic-apple-us","supplier_sku":"synthetic-apple-5"}}'::jsonb)`).join(",")}`);
  await sql(`insert into public.supplier_fulfillment_requests
    (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,
     request_id,status,attempt_token,attempt_count)
    values ${items.map((item) => `('${item.fulfillmentRequestId}','${orderId}',
      '${item.orderItemId}','bitrefill','synthetic-apple-us','synthetic-apple-5',
      'jianlian:${orderId}:${item.orderItemId}','PURCHASING','${item.token}',1)`).join(",")}`);
  return items;
}
class CorrelatedFakeTransport extends BitrefillFakeTransport {
  constructor() { super(); this.invoices = new Map(); this.orders = new Map(); }
  async createInvoice(request) {
    this.invoiceSubmissions += 1;
    assert.ok(request.products.length <= 20);
    const id = `synthetic-invoice-${randomUUID()}`;
    this.invoices.set(id, { id, status: "pending", orders: [] });
    return { id, status: "pending", orders: [] };
  }
  async readInvoice(id) {
    this.invoiceReads += 1;
    return structuredClone(this.invoices.get(id));
  }
  async readOrder(id) {
    this.orderReads += 1;
    return structuredClone(this.orders.get(id));
  }
  configure(id, frozen, statuses, invoiceStatus = "complete") {
    assert.equal(frozen.length, statuses.length);
    const orders = frozen.map((item, index) => {
      const order = { id: `synthetic-child-${item.id}`, client_reference: item.id,
        status: statuses[index] };
      if (order.status === "delivered") order.redemption_info = {
        code: "TEST_V13_CARD_CODE_ALPHA", pin: "TEST_V13_PIN_123456",
      };
      this.orders.set(order.id, order);
      return order;
    });
    this.invoices.set(id, { id, status: invoiceStatus, orders });
  }
  copyFixturesFrom(other) {
    this.invoices = new Map(structuredClone([...other.invoices]));
    this.orders = new Map(structuredClone([...other.orders]));
  }
}
async function attemptItems(attemptId) {
  return JSON.parse(await sql(`select coalesce(json_agg(s order by s.id),'[]'::json)::text from
    (select id,attempt_id,order_item_id from public.supplier_purchase_attempt_items
     where attempt_id='${attemptId}') s`));
}
async function count(statement) { return Number(await sql(statement)); }

try {
  await installV13LocalFixture({ databaseName: dbName, applyFile, executeSql: sql });
  console.log("DB5_LOCAL_BASELINE_FORWARD_AND_EXISTING_PRIVATE_RPC_PASS");

  const dbA = createBitrefillPurchaseRpcAdapter(localClient());
  const dbB = createBitrefillPurchaseRpcAdapter(localClient());
  const items21 = await seedItems(21);
  const fake21 = new CorrelatedFakeTransport();
  const key21 = `synthetic-db5-${randomUUID()}`;
  const groups21 = await runBitrefillOfflinePurchase({ db: dbA, transport: fake21,
    logicalKeyPrefix: key21, items: items21 });
  assert.deepEqual(groups21.map((group) => group.status), ["EXTERNAL_CREATED", "EXTERNAL_CREATED"]);
  assert.equal(fake21.invoiceSubmissions, 2);
  const sizes = [];
  for (const group of groups21) {
    const frozen = await attemptItems(group.attemptId);
    sizes.push(frozen.length);
    fake21.configure(group.invoiceId, frozen, frozen.map(() => "created"), "pending");
    const reconciled = await reconcileBitrefillOfflineAttempt({ db: dbA,
      transport: fake21, attemptId: group.attemptId });
    assert.equal(reconciled.pending.length, frozen.length);
  }
  assert.deepEqual(sizes, [20, 1]);
  assert.equal(await count(`select count(*) from public.supplier_external_orders e
    join public.supplier_purchase_attempt_items i on i.id=e.attempt_item_id
    where e.attempt_id in ('${groups21[0].attemptId}','${groups21[1].attemptId}')
      and e.external_order_id='synthetic-child-'||i.id
      and i.order_item_id in (${items21.map((item) => quote(item.orderItemId)).join(",")})`), 21);
  const repeatFake = new CorrelatedFakeTransport();
  repeatFake.copyFixturesFrom(fake21);
  const replay = await runBitrefillOfflinePurchase({ db: dbB, transport: repeatFake,
    logicalKeyPrefix: key21, items: items21 });
  assert.equal(repeatFake.invoiceSubmissions, 0);
  assert.ok(replay.every((group) => group.submitted === false));
  const recovered = await recoverBitrefillOfflineAttempt({ db: dbB,
    transport: repeatFake, attemptId: groups21[0].attemptId });
  assert.equal(recovered.invoiceState, "PENDING");
  assert.ok(repeatFake.invoiceReads >= 1);
  console.log("DB5_CHILD_MAPPING_COUNT=21/21; TWO_INVOICES_AND_GET_RECOVERY_PASS");

  const partialItems = await seedItems(3);
  const partialFake = new CorrelatedFakeTransport();
  const partialAttempt = (await runBitrefillOfflinePurchase({ db: dbA, transport: partialFake,
    logicalKeyPrefix: `synthetic-partial-${randomUUID()}`, items: partialItems }))[0];
  const partialFrozen = await attemptItems(partialAttempt.attemptId);
  partialFake.configure(partialAttempt.invoiceId, partialFrozen,
    ["delivered", "created", "failed"], "complete");
  const partial = await reconcileBitrefillOfflineAttempt({ db: dbA,
    transport: partialFake, attemptId: partialAttempt.attemptId });
  assert.equal(partial.deliveryCandidates.length, 1);
  assert.equal(partial.pending.length, 1);
  assert.equal(partial.failed.length, 1);
  assert.equal(partial.requiresManualReview, true);
  assert.equal(await count(`select count(*) from public.order_deliveries
    where order_item_id in (${partialItems.map((item) => quote(item.orderItemId)).join(",")})`), 0);
  assert.equal(await count(`select count(*) from public.supplier_external_orders
    where attempt_id='${partialAttempt.attemptId}' and normalized_status='DELIVERED'`), 1);
  console.log("DB5_PARTIAL_COMPLETE_INVOICE_DID_NOT_DELIVER_PENDING_OR_FAILED_PASS");

  const beforeItems = await seedItems(1);
  const beforeKey = `synthetic-before-${randomUUID()}`;
  let terminatedBeforeSubmit = false;
  await assert.rejects(runBitrefillOfflinePurchase({ db: {
    ...dbA, async getAttempt(id) {
      if (!terminatedBeforeSubmit) {
        terminatedBeforeSubmit = true;
        throw new Error("SYNTHETIC_PROCESS_DESTROYED_BEFORE_SUBMIT");
      }
      return dbA.getAttempt(id);
    },
  }, transport: new CorrelatedFakeTransport(), logicalKeyPrefix: beforeKey,
  items: beforeItems }), /SYNTHETIC_PROCESS_DESTROYED_BEFORE_SUBMIT/);
  assert.equal(await sql(`select status from public.supplier_purchase_attempts
    where logical_request_key='${beforeKey}:1'`), "CLAIMED");
  const beforeRestartFake = new CorrelatedFakeTransport();
  assert.equal((await runBitrefillOfflinePurchase({ db: dbB,
    transport: beforeRestartFake, logicalKeyPrefix: beforeKey,
    items: beforeItems }))[0].status, "EXTERNAL_CREATED");
  assert.equal(beforeRestartFake.invoiceSubmissions, 1);

  const afterItems = await seedItems(1);
  const afterKey = `synthetic-after-${randomUUID()}`;
  const afterFake = new BitrefillFakeTransport({ submitTimeoutAfterAccept: true });
  const uncertain = (await runBitrefillOfflinePurchase({ db: dbA,
    transport: afterFake, logicalKeyPrefix: afterKey, items: afterItems }))[0];
  assert.equal(uncertain.status, "UNCERTAIN");
  assert.equal(uncertain.submitPhase, "POSSIBLY_SENT");
  assert.equal(afterFake.invoiceSubmissions, 1);
  const afterRestartFake = new CorrelatedFakeTransport();
  assert.equal((await runBitrefillOfflinePurchase({ db: dbB, transport: afterRestartFake,
    logicalKeyPrefix: afterKey, items: afterItems }))[0].status, "UNCERTAIN");
  assert.equal(afterRestartFake.invoiceSubmissions, 0);
  assert.equal((await recoverBitrefillOfflineAttempt({ db: dbB,
    transport: afterRestartFake, attemptId: uncertain.attemptId })).requiresManualReview, true);
  assert.equal(afterRestartFake.invoiceReads, 0);

  class BeforeSendFake extends BitrefillFakeTransport {
    async createInvoice() {
      const error = new Error("SYNTHETIC_FAIL_BEFORE_SEND");
      error.submitted = false;
      throw error;
    }
  }
  const beforeSendItems = await seedItems(1);
  const beforeSendKey = `synthetic-before-send-${randomUUID()}`;
  const failBefore = (await runBitrefillOfflinePurchase({ db: dbA,
    transport: new BeforeSendFake(), logicalKeyPrefix: beforeSendKey,
    items: beforeSendItems }))[0];
  assert.equal(failBefore.submitPhase, "FAILED_BEFORE_SEND");
  assert.equal(failBefore.status, "UNCERTAIN");
  const noBlindRetry = new CorrelatedFakeTransport();
  await runBitrefillOfflinePurchase({ db: dbB, transport: noBlindRetry,
    logicalKeyPrefix: beforeSendKey, items: beforeSendItems });
  assert.equal(noBlindRetry.invoiceSubmissions, 0);
  await assert.rejects(runBitrefillOfflinePurchase({ db: dbB,
    transport: new CorrelatedFakeTransport(), logicalKeyPrefix: key21,
    items: items21.map((item, index) => index === 0
      ? { ...item, expectedCost: "4.79", frozenQuotedCost: "4.79" } : item),
  }), /internal_supplier_purchase_claim_RPC_FAILED/);
  console.log("DB5_CLAIM_RESTART_BEFORE_AND_AFTER_SEND_NO_BLIND_RETRY_PASS");

  const firstChild = await sql(`select external_order_id from public.supplier_external_orders
    where attempt_id='${groups21[0].attemptId}' order by id limit 1`);
  const anotherFrozen = (await attemptItems(groups21[0].attemptId))[1];
  const firstFrozen = (await attemptItems(groups21[0].attemptId))[0];
  assert.equal((await dbA.recordChild(firstFrozen.id,
    `synthetic-child-${firstFrozen.id}`)).result, "RECORDED");
  await assert.rejects(dbA.recordChild(anotherFrozen.id,
    `synthetic-child-${firstFrozen.id}`), /internal_supplier_purchase_record_child_RPC_FAILED/);
  assert.ok(firstChild.startsWith("synthetic-child-"));
  console.log("DB5_POST_MIGRATION_EXTERNAL_CHILD_IDEMPOTENT_AND_UNIQUE_PASS");

  const raceItems = await seedItems(1);
  const raceBaseFake = new CorrelatedFakeTransport();
  const raceAttempt = (await runBitrefillOfflinePurchase({ db: dbA,
    transport: raceBaseFake, logicalKeyPrefix: `synthetic-race-${randomUUID()}`,
    items: raceItems }))[0];
  raceBaseFake.configure(raceAttempt.invoiceId, await attemptItems(raceAttempt.attemptId),
    ["delivered"], "complete");
  const webhookFake = new CorrelatedFakeTransport();
  const pollFake = new CorrelatedFakeTransport();
  webhookFake.copyFixturesFrom(raceBaseFake);
  pollFake.copyFixturesFrom(raceBaseFake);
  const event = { eventId: `synthetic-event-${randomUUID()}`,
    invoiceId: raceAttempt.invoiceId,
    injected: { code: "TEST_V13_CARD_CODE_ALPHA", pin: "TEST_V13_PIN_123456" } };
  const [webhookRace, pollRace] = await Promise.all([
    handleBitrefillOfflineWebhook({ db: dbA, transport: webhookFake, event }),
    reconcileBitrefillOfflineAttempt({ db: dbB, transport: pollFake,
      attemptId: raceAttempt.attemptId }),
  ]);
  assert.equal(webhookRace.receipt, "RECEIVED");
  assert.equal(webhookRace.reconciled, true);
  assert.equal(webhookRace.result.deliveryCandidates.length, 1);
  assert.equal(pollRace.deliveryCandidates.length, 1);
  assert.equal(webhookRace.result.deliveryCandidates[0].childRowId,
    pollRace.deliveryCandidates[0].childRowId);
  const raceChild = webhookRace.result.deliveryCandidates[0].childRowId;
  assert.equal(await count(`select count(*) from public.supplier_external_orders
    where attempt_id='${raceAttempt.attemptId}' and normalized_status='DELIVERED'`), 1);
  assert.equal(await count(`select count(*) from public.supplier_reconciliation_evidence
    where attempt_id='${raceAttempt.attemptId}' and normalized_status='DELIVERED'`), 1);
  const readsAfterRace = webhookFake.invoiceReads;
  for (let replayNumber = 0; replayNumber < 100; replayNumber += 1) {
    const replayed = await handleBitrefillOfflineWebhook({ db: dbA,
      transport: webhookFake, event });
    assert.equal(replayed.receipt, "ALREADY_RECEIVED");
    assert.equal(replayed.reconciled, false);
  }
  assert.equal(webhookFake.invoiceReads, readsAfterRace);
  assert.equal(await count(`select count(*) from public.supplier_webhook_receipts
    where external_invoice_id='${raceAttempt.invoiceId}'`), 1);
  assert.equal(webhookFake.invoiceSubmissions + pollFake.invoiceSubmissions, 0);
  console.log("DB5_WEBHOOK_100_REPLAY_AND_TWO_SESSION_POLL_RACE_PASS");

  // Crash A: before the private transaction. A fresh worker delivers once.
  const partialCandidate = partial.deliveryCandidates[0];
  assert.equal(await count(`select count(*) from public.order_deliveries
    where order_item_id='${partialCandidate.orderItemId}'`), 0);
  const resumedPrivate = await deliverBitrefillOfflineChild({ db: dbB,
    transport: partialFake, childRowId: partialCandidate.childRowId });
  assert.equal(resumedPrivate.delivered, true);
  assert.equal(await count(`select count(*) from public.digital_delivery_secrets s
    join public.order_deliveries d on d.id=s.delivery_id
    where d.order_item_id='${partialCandidate.orderItemId}'`), 1);
  assert.equal(await count(`select count(*) from public.order_deliveries
    where order_item_id in (${partial.pending.concat(partial.failed)
      .map((row) => quote(row.orderItemId)).join(",")})`), 0);

  // Two application instances and two psql sessions race the same child.
  const [deliveryA, deliveryB] = await Promise.all([
    deliverBitrefillOfflineChild({ db: dbA, transport: webhookFake, childRowId: raceChild }),
    deliverBitrefillOfflineChild({ db: dbB, transport: pollFake, childRowId: raceChild }),
  ]);
  assert.equal(deliveryA.delivered && deliveryB.delivered, true);
  assert.equal(await count(`select count(*) from public.order_deliveries
    where order_item_id='${raceItems[0].orderItemId}' and delivery_status='delivered'`), 1);
  assert.equal(await count(`select count(*) from public.digital_delivery_secrets s
    join public.order_deliveries d on d.id=s.delivery_id
    where d.order_item_id='${raceItems[0].orderItemId}'`), 1);
  assert.equal(await count(`select count(*) from public.supplier_external_orders e
    join public.order_deliveries d on d.id=e.delivery_id
    join public.digital_delivery_secrets s on s.delivery_id=d.id
    where e.id='${raceChild}' and d.order_item_id='${raceItems[0].orderItemId}'`), 1);
  console.log("DB5_PRIVATE_DELIVERY_AND_TWO_SESSION_CONCURRENT_ATOMICITY_PASS");

  // Crash B: an error inside the private transaction must roll back the
  // outcome, the delivery row, its child link, and the secret together.
  const rollbackItems = await seedItems(1);
  const rollbackFake = new CorrelatedFakeTransport();
  const rollbackAttempt = (await runBitrefillOfflinePurchase({ db: dbA,
    transport: rollbackFake, logicalKeyPrefix: `synthetic-rollback-${randomUUID()}`,
    items: rollbackItems }))[0];
  rollbackFake.configure(rollbackAttempt.invoiceId,
    await attemptItems(rollbackAttempt.attemptId), ["delivered"]);
  const rollbackCandidate = (await reconcileBitrefillOfflineAttempt({ db: dbA,
    transport: rollbackFake, attemptId: rollbackAttempt.attemptId })).deliveryCandidates[0];
  await sql(`create function public.v13_db5_abort_private_insert() returns trigger
    language plpgsql set search_path=pg_catalog as $body$
    begin raise exception 'V13_DB5_SYNTHETIC_PRIVATE_INSERT_ABORT'; end $body$;
    create trigger v13_db5_abort_private_insert before insert on public.digital_delivery_secrets
    for each row execute function public.v13_db5_abort_private_insert()`);
  await assert.rejects(deliverBitrefillOfflineChild({ db: dbA,
    transport: rollbackFake, childRowId: rollbackCandidate.childRowId }),
  /internal_supplier_purchase_deliver_child_RPC_FAILED/);
  assert.equal(await sql(`select status from public.supplier_fulfillment_requests
    where order_item_id='${rollbackItems[0].orderItemId}'`), "PURCHASING");
  assert.equal(await count(`select count(*) from public.order_deliveries
    where order_item_id='${rollbackItems[0].orderItemId}'`), 0);
  assert.equal(await sql(`select delivery_id is null from public.supplier_external_orders
    where id='${rollbackCandidate.childRowId}'`), "t");
  await sql(`drop trigger v13_db5_abort_private_insert on public.digital_delivery_secrets;
    drop function public.v13_db5_abort_private_insert()`);
  assert.equal((await deliverBitrefillOfflineChild({ db: dbB,
    transport: rollbackFake, childRowId: rollbackCandidate.childRowId })).delivered, true);
  assert.equal(await count(`select count(*) from public.digital_delivery_secrets s
    join public.order_deliveries d on d.id=s.delivery_id
    where d.order_item_id='${rollbackItems[0].orderItemId}'`), 1);

  // Crash C: commit succeeded but the caller lost its acknowledgement.
  const ackItems = await seedItems(1);
  const ackFake = new CorrelatedFakeTransport();
  const ackAttempt = (await runBitrefillOfflinePurchase({ db: dbA,
    transport: ackFake, logicalKeyPrefix: `synthetic-ack-${randomUUID()}`,
    items: ackItems }))[0];
  ackFake.configure(ackAttempt.invoiceId, await attemptItems(ackAttempt.attemptId), ["delivered"]);
  const ackCandidate = (await reconcileBitrefillOfflineAttempt({ db: dbA,
    transport: ackFake, attemptId: ackAttempt.attemptId })).deliveryCandidates[0];
  await deliverBitrefillOfflineChild({ db: dbA, transport: ackFake,
    childRowId: ackCandidate.childRowId }); // Deliberately discard the acknowledgement.
  const afterAckRestart = await deliverBitrefillOfflineChild({ db: dbB,
    transport: ackFake, childRowId: ackCandidate.childRowId });
  assert.equal(afterAckRestart.idempotent, true);
  assert.equal(await count(`select count(*) from public.digital_delivery_secrets s
    join public.order_deliveries d on d.id=s.delivery_id
    where d.order_item_id='${ackItems[0].orderItemId}'`), 1);
  console.log("DB5_PRIVATE_CRASH_BEFORE_ROLLBACK_AFTER_ACK_RECOVERY_PASS");

  const markers = ["TEST_V13_CARD_CODE_ALPHA", "TEST_V13_PIN_123456"];
  const scannedColumns = JSON.parse(await sql(`select coalesce(json_agg(s),'[]'::json)::text from (
    select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name <> 'digital_delivery_secrets'
      and data_type in ('text','character varying','json','jsonb')
    order by table_name,column_name) s`));
  const nonPrivateCounts = new Map();
  for (const { table_name: table, column_name: column } of scannedColumns) {
    assert.match(table, /^[a-z_]+$/);
    assert.match(column, /^[a-z_]+$/);
    const matches = await count(`select count(*) from public.${table} where
      position(${quote(markers[0])} in ${column}::text)>0 or
      position(${quote(markers[1])} in ${column}::text)>0`);
    nonPrivateCounts.set(table, (nonPrivateCounts.get(table) ?? 0) + matches);
  }
  assert.ok([...nonPrivateCounts.values()].every((value) => value === 0));
  assert.equal(nonPrivateCounts.get("delivery_logs") ?? 0, 0);
  assert.ok(await count(`select count(*) from public.digital_delivery_secrets
    where position(${quote(markers[0])} in content)>0 and
      position(${quote(markers[1])} in content)>0`) >= 4);
  const applicationCode = readFileSync(resolve(root,
    "lib/providers/bitrefill/purchase-persistence.mjs"), "utf8");
  assert.doesNotMatch(applicationCode, /console\.(?:log|error|warn|info)/);
  console.log(`DB5_SECRET_AUDIT_NON_PRIVATE_TABLES=${nonPrivateCounts.size}; MATCHES=0; LOG_MATCHES=0`);

  const newTables = ["supplier_purchase_attempts", "supplier_purchase_attempt_items",
    "supplier_external_orders", "supplier_webhook_receipts", "supplier_reconciliation_evidence"];
  for (const table of newTables) {
    assert.equal(await sql(`select relrowsecurity from pg_class
      where oid='public.${table}'::regclass`), "t");
    assert.equal(await count(`select count(*) from pg_policy
      where polrelid='public.${table}'::regclass`), 0);
    for (const role of ["anon", "authenticated"]) {
      await sqlFails(`select count(*) from public.${table}`, role, "permission denied");
      await sqlFails(`insert into public.${table} default values`, role, "permission denied");
      await sqlFails(`update public.${table} set id=gen_random_uuid()`, role, "permission denied");
      await sqlFails(`delete from public.${table}`, role, "permission denied");
    }
    assert.ok(Number(await sql(`select count(*) from public.${table}`, dbName, "service_role")) >= 0);
    await sqlFails(`insert into public.${table} default values`, "service_role", "permission denied");
  }
  const internalFunctions = [
    "internal_supplier_purchase_claim(text,text,text,jsonb)",
    "internal_supplier_purchase_transition(uuid,text,text,text)",
    "internal_supplier_purchase_record_child(uuid,text)",
    "internal_supplier_purchase_record_evidence(uuid,uuid,text,text,text,timestamptz)",
    "internal_supplier_purchase_record_webhook(text,text,text,text)",
    "internal_supplier_purchase_deliver_child(uuid,text,uuid,text)",
  ];
  for (const signature of internalFunctions) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await sql(`select has_function_privilege('${role}',
        'public.${signature}','EXECUTE')`), "f");
    }
    assert.equal(await sql(`select has_function_privilege('service_role',
      'public.${signature}','EXECUTE')`), "t");
  }
  assert.equal(await count(`select count(*) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'internal_supplier_purchase_%'
      and p.prosecdef and p.proowner=current_user::regrole
      and p.proconfig @> array['search_path=pg_catalog']::text[]`), 6);
  console.log("DB5_LOCAL_ACL_RLS_FUNCTION_OWNER_SEARCH_PATH_PASS");

  const p23Source = readFileSync(resolve(root,
    "supabase/migrations/20261004180000_admin_catalog_transactional_bulk_activation_p2_3.sql"), "utf8");
  const p23Original = p23Source.match(/create or replace function public\.admin_evaluate_product_sku_activation\([\s\S]*?\$\$;/i)?.[0];
  assert.ok(p23Original);
  await sql(p23Original.replace("public.admin_evaluate_product_sku_activation(",
    "public.v13_db5_original_sku_activation("));
  const daju = { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 123,
    supplier_sku: "5", supplier_max_unit_cost: "4.8", supplier_stock_snapshot: 5,
    supplier_stock_sync_status: "synced", supplier_stock_last_success_at: "2026-10-15T00:00:00Z",
    supplier_stock_stale: false };
  const variants = [daju, { ...daju, supplier_stock_stale: true },
    { ...daju, supplier_stock_sync_status: "error" },
    { ...daju, supplier_stock_snapshot: 0 },
    { ...daju, supplier_product_id: "123" },
    { ...daju, supplier_max_unit_cost: null },
    { ...daju, supplier_inputs_mapping: { note: "customer_note" } },
    { inventory_state: "requires_verification" }, {}];
  for (const metadata of variants) {
    for (const stock of [0, 5, 6]) {
      assert.equal(await sql(`select public.v13_db5_original_sku_activation(
        'automatic','automatic',${stock},${quote(JSON.stringify(metadata))}::jsonb,0)
        = public.admin_evaluate_product_sku_activation(
        'automatic','automatic',${stock},${quote(JSON.stringify(metadata))}::jsonb,0)`), "t");
    }
  }
  const booleanMetadata = { fulfillment_source: "supplier", supplier: "bitrefill",
    supplier_product_id: "synthetic-apple-us", supplier_sku: "synthetic-apple-5",
    supplier_max_unit_cost: "4.80", supplier_inputs_mapping: {},
    supplier_quantity_known: false, supplier_stock_snapshot: null,
    supplier_availability: "AVAILABLE", supplier_available: true,
    supplier_stock_sync_status: "synced", supplier_stock_stale: false,
    supplier_stock_last_success_at: new Date().toISOString() };
  const ready = async (metadata) => await sql(`select
    (public.admin_evaluate_product_sku_activation('automatic','automatic',0,
      ${quote(JSON.stringify(metadata))}::jsonb,0)->>'ready')::boolean`);
  assert.equal(await ready(booleanMetadata), "t");
  for (const metadata of [
    { ...booleanMetadata, supplier_availability: "UNKNOWN" },
    { ...booleanMetadata, supplier_stock_stale: true },
    { ...booleanMetadata, supplier_stock_sync_status: "error" },
  ]) assert.equal(await ready(metadata), "f");
  for (const amount of [2,3,4,5,10,15,20,25,50,100]) {
    assert.equal(await ready({ inventory_state: "requires_verification",
      supplier: "bitrefill", supplier_sku: `synthetic-apple-${amount}` }), "f");
  }
  assert.equal(await count("select count(*) from public.product_skus"), 0);
  console.log("DB5_P23_DAJU_27_BOOLEAN_UNKNOWN_STALE_ERROR_APPLE_ISOLATION_PASS");

  const perfRows = `select g from generate_series(1,1000) g`;
  await sql(`insert into public.orders(id,order_no,user_id,status,payment_status)
    select md5('db5-perf-order-'||g)::uuid,'synthetic-perf-'||g,
      'd5000000-0000-4000-8000-000000000001'::uuid,'paid','paid' from (${perfRows}) s;
    insert into public.order_items
      (id,order_id,product_name,unit_price,line_total,quantity,delivery_type,product_snapshot)
    select md5('db5-perf-item-'||g)::uuid,md5('db5-perf-order-'||g)::uuid,
      'SYNTHETIC_PERF',5,5,1,'auto_delivery',
      '{"supplier_binding":{"fulfillment_source":"supplier","supplier":"bitrefill",
      "supplier_product_id":"synthetic-apple-us","supplier_sku":"synthetic-apple-5"}}'::jsonb
    from (${perfRows}) s;
    insert into public.supplier_fulfillment_requests
      (id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,
       request_id,status,attempt_token,attempt_count)
    select md5('db5-perf-root-'||g)::uuid,md5('db5-perf-order-'||g)::uuid,
      md5('db5-perf-item-'||g)::uuid,'bitrefill','synthetic-apple-us',
      'synthetic-apple-5',
      'jianlian:'||md5('db5-perf-order-'||g)::uuid::text||':'||
        md5('db5-perf-item-'||g)::uuid::text,
      'PURCHASING',md5('db5-perf-token-'||g)::uuid,1 from (${perfRows}) s;
    insert into public.supplier_purchase_attempts
      (id,supplier,logical_request_key,semantic_request_hash,status,
       submit_started_at,external_invoice_id)
    select md5('db5-perf-attempt-'||g)::uuid,'bitrefill','perf-'||g,
      repeat('a',64),'EXTERNAL_CREATED',clock_timestamp(),'perf-invoice-'||g
    from (${perfRows}) s;
    insert into public.supplier_purchase_attempt_items
      (id,attempt_id,fulfillment_request_id,order_item_id,unit_index,
       frozen_product_id,frozen_package_id,frozen_currency,frozen_face_value,
       quoted_unit_cost,max_unit_cost)
    select md5('db5-perf-attempt-item-'||g)::uuid,
      md5('db5-perf-attempt-'||g)::uuid,md5('db5-perf-root-'||g)::uuid,
      md5('db5-perf-item-'||g)::uuid,1,
      'synthetic-apple-us','synthetic-apple-5','USD','5.00',4.8,5.0
    from (${perfRows}) s;
    insert into public.supplier_external_orders
      (id,attempt_id,attempt_item_id,supplier,external_order_id,normalized_status)
    select md5('db5-perf-external-'||g)::uuid,
      md5('db5-perf-attempt-'||g)::uuid,
      md5('db5-perf-attempt-item-'||g)::uuid,
      'bitrefill','perf-child-'||g,'PENDING' from (${perfRows}) s;
    insert into public.supplier_webhook_receipts
      (supplier,event_fingerprint,external_invoice_id)
    select 'bitrefill',md5('db5-perf-webhook-'||g)||md5('db5-perf-webhook-b-'||g),
      'perf-invoice-'||g from (${perfRows}) s`);
  for (const table of ["supplier_purchase_attempts", "supplier_purchase_attempt_items",
    "supplier_external_orders", "supplier_webhook_receipts"]) {
    await sql(`analyze public.${table}`);
  }
  assert.ok(await count("select count(*) from public.supplier_purchase_attempts") >= 1000);
  assert.ok(await count("select count(*) from public.supplier_external_orders") >= 1000);
  assert.ok(await count("select count(*) from public.supplier_webhook_receipts") >= 1000);
  const plans = [
    ["logical", "supplier_purchase_attempts_logical_key_uidx",
      "select id from public.supplier_purchase_attempts where supplier='bitrefill' and logical_request_key='perf-500'"],
    ["invoice", "supplier_purchase_attempts_external_invoice_uidx",
      "select id from public.supplier_purchase_attempts where supplier='bitrefill' and external_invoice_id='perf-invoice-500'"],
    ["child", "supplier_external_orders_provider_id_uidx",
      "select id from public.supplier_external_orders where supplier='bitrefill' and external_order_id='perf-child-500'"],
    ["reconciliation", "supplier_purchase_attempts_reconcile_idx",
      "select id from public.supplier_purchase_attempts where supplier='bitrefill' and status='EXTERNAL_CREATED' order by updated_at,id limit 50"],
    ["webhook", "supplier_webhook_receipts_fingerprint_uidx",
      `select id from public.supplier_webhook_receipts where supplier='bitrefill' and event_fingerprint=md5('db5-perf-webhook-500')||md5('db5-perf-webhook-b-500')`],
  ];
  for (const [label, index, statement] of plans) {
    const natural = await sql(`explain (analyze,buffers) ${statement}`);
    assert.match(natural, /Execution Time:/, `${label}_EXPLAIN_ANALYZE_MISSING`);
    const indexed = await sql(`set enable_seqscan=off; explain (analyze,buffers) ${statement}`);
    assert.ok(indexed.includes(index), `${label}_INDEX_UNUSABLE: ${indexed}`);
    assert.doesNotMatch(indexed, /Seq Scan on public\./, `${label}_SEQ_SCAN_WITH_INDEX_FORCED`);
  }
  console.log("DB5_PERF_DATASET_ATTEMPTS_CHILDREN_WEBHOOKS=1000/1000/1000; FIVE_EXPLAIN_INDEXES_PASS");
} finally {
  if (createdByThisRunner) {
    assert.equal(await sql("select current_setting('data_directory')", "postgres"),
      expectedData.replaceAll("\\", "/"));
    const dropped = await command(tool("dropdb"), ["-h", host, "-p", port, "-U", user, dbName]);
    assert.equal(dropped.code, 0, dropped.stderr);
    createdByThisRunner = false;
  }
}
