// Guarded by the DB5 runner: loopback 17.11, random owned disposable DB only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createLocalBitrefillFulfillment, dispatchLocalPaidSuppliers, wakeLocalBitrefill } from "../../lib/providers/bitrefill/paid-order-local.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "../../lib/providers/bitrefill/prelaunch-policy.mjs";

async function bounded(jobs, concurrency = 4) {
  assert.ok(jobs.length <= 200 && concurrency <= 4);
  let next = 0;
  const results = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
    }
  }));
  return results;
}

export async function runP3LocalPrelaunch({ sql, dbName, createClient, root, quote: sqlQuote, product, p2 }) {
  assert.equal(REAL_BITREFILL_PURCHASE_ENABLED, false);
  const { seed, Fake, binding } = p2;
  const stableQuotes = new Map();
  function worker(fake, options = {}, client = createClient()) {
    const handler = createLocalBitrefillFulfillment({ transport: fake,
      loadPricing: async ({ orderItem }) => {
        if (!stableQuotes.has(orderItem.id)) {
          const now = Date.now();
          stableQuotes.set(orderItem.id, { supplier: "bitrefill", productId: product.external_product_id,
            packageId: "synthetic-apple-5", quantity: 1, amount: "4.80", currency: "USD",
            source: "synthetic_fixture", synthetic: true, checkedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 240_000).toISOString(), maxAllowedSpend: "5.00" });
        }
        return { product, productCheckedAt: new Date().toISOString(), quote: options.missingCost ? null
          : { ...stableQuotes.get(orderItem.id), ...(options.quoteChange ?? {}) } };
      },
      loadFinancialEvidence: async ({ order, orderItem }) => ({ source: "synthetic_paid_ledger",
        orderId: order.id, orderItemId: orderItem.id, currency: "USD", paidItemAmount: "6.00",
        paymentFee: "0.10", otherFees: "0.05", maxUnitProfit: "2.00", fxSource: "same_currency_no_conversion",
        paymentState: options.paymentState ?? "paid", refundState: options.refundState ?? "none",
        disputeState: options.disputeState ?? "none" }),
      loadSupplierBalance: async () => {
        if (options.balanceState === "timeout") throw new Error("SYNTHETIC_BALANCE_ENDPOINT_TIMEOUT");
        return { source: "synthetic_balance", state: options.balanceState ?? "sufficient",
          currency: "USD", availableAmount: options.balanceState === "insufficient" ? "0" : "100.00" };
      },
    });
    return (orderId) => dispatchLocalPaidSuppliers({ service: client, orderId, bitrefill: handler });
  }
  const attemptFor = async (itemId) => JSON.parse(await sql(`select row_to_json(a) from
    public.supplier_purchase_attempts a join public.supplier_purchase_attempt_items i on i.attempt_id=a.id
    where i.order_item_id='${itemId}'`));
  const deliveries = (orderId) => sql(`select count(*) from public.order_deliveries where order_id='${orderId}'`);

  for (const state of ["insufficient", "unknown", "timeout"]) {
    const item = await seed(); const fake = new Fake();
    const dispatch = worker(fake, { balanceState: state });
    await dispatch(item.orderId); await dispatch(item.orderId);
    assert.equal(fake.invoiceSubmissions, 0);
    assert.equal(await sql(`select status from public.supplier_fulfillment_requests where order_id='${item.orderId}'`), "FAILED_VALIDATION");
  }
  console.log("P3_SUPPLIER_BALANCE_SUFFICIENT_INSUFFICIENT_UNKNOWN_TIMEOUT_PASS");
  for (const options of [{ paymentState: "failed" }, { paymentState: "processing" },
    { refundState: "pending" }, { disputeState: "open" }]) {
    const item = await seed(); const fake = new Fake();
    await worker(fake, options)(item.orderId);
    assert.equal(fake.invoiceSubmissions, 0);
  }
  console.log("P3_PAYMENT_REFUND_DISPUTE_GATES_PASS");

  for (const risk of ["refundState", "disputeState"]) {
    const item = await seed(); const options = {};
    let reads = 0;
    class RiskDuringGet extends Fake {
      async readOrder(id) { if (++reads === 2) options[risk] = "pending"; return super.readOrder(id); }
    }
    const fake = new RiskDuringGet();
    await worker(fake, options)(item.orderId);
    assert.equal(fake.invoiceSubmissions, 1);
    assert.equal(await deliveries(item.orderId), "0");
  }
  console.log("P3_REFUND_DISPUTE_CHANGED_DURING_GET_BLOCK_PRIVATE_DELIVERY_PASS");

  // Lose the claim acknowledgement before SUBMITTING. The persisted request
  // hash must match exactly on restart; changed pricing cannot be substituted.
  const preSend = await seed(); const preSendFake = new Fake();
  const original = createClient(); let loseClaimAck = true;
  const crashingClient = { from: original.from.bind(original), async rpc(name, args) {
    const result = await original.rpc(name, args);
    if (name === "internal_supplier_purchase_claim" && !result.error && loseClaimAck) {
      loseClaimAck = false; throw new Error("SYNTHETIC_EXIT_AFTER_CLAIM");
    }
    return result;
  } };
  await worker(preSendFake, {}, crashingClient)(preSend.orderId);
  assert.equal((await attemptFor(preSend.items[0].orderItemId)).status, "CLAIMED");
  assert.equal(preSendFake.invoiceSubmissions, 0);
  await worker(preSendFake, { quoteChange: { amount: "4.79" } })(preSend.orderId);
  assert.equal(preSendFake.invoiceSubmissions, 0);
  await worker(preSendFake)(preSend.orderId);
  assert.equal(preSendFake.invoiceSubmissions, 1);
  assert.equal(await deliveries(preSend.orderId), "1");
  console.log("P3_CLAIM_BEFORE_SEND_RESTART_EXACT_HASH_ONE_SUBMIT_PASS");

  for (const lostRpc of ["internal_supplier_purchase_transition", "internal_supplier_purchase_deliver_child"]) {
    const item = await seed(); const fake = new Fake(); const client = createClient(); let lose = true;
    const lostAck = { from: client.from.bind(client), async rpc(name, args) {
      const result = await client.rpc(name, args);
      if (!result.error && lose && name === lostRpc && (name !== "internal_supplier_purchase_transition" || args.p_next_status === "EXTERNAL_CREATED")) {
        lose = false; throw new Error("SYNTHETIC_EXIT_AFTER_DURABLE_COMMIT");
      }
      return result;
    } };
    await worker(fake, {}, lostAck)(item.orderId);
    assert.ok((await attemptFor(item.items[0].orderItemId)).external_invoice_id);
    await worker(fake)(item.orderId);
    assert.equal(fake.invoiceSubmissions, 1);
    assert.equal(await deliveries(item.orderId), "1");
  }
  console.log("P3_KNOWN_INVOICE_AND_PRIVATE_COMMIT_LOST_ACK_RECOVERY_PASS");

  const unavailable = await seed(); const dbFake = new Fake(); const good = createClient(); let down = true;
  const intermittentDb = { from: good.from.bind(good), async rpc(name, args) {
    if (down) return { data: null, error: { code: "08006" } };
    return good.rpc(name, args);
  } };
  await worker(dbFake, {}, intermittentDb)(unavailable.orderId);
  assert.equal(dbFake.invoiceSubmissions, 0);
  down = false;
  await worker(dbFake, {}, intermittentDb)(unavailable.orderId);
  assert.equal(dbFake.invoiceSubmissions, 1);
  console.log("P3_TRANSIENT_DB_CONNECTION_ERROR_FAIL_CLOSED_RECOVERY_PASS");

  for (const fault of ["not_available_403", "rate_limit_429", "upstream_500", "timeout"]) {
    class FaultFake extends Fake {
      async createInvoice() { this.invoiceSubmissions += 1; const error = new Error(`SYNTHETIC_${fault}`); error.submitted = true; throw error; }
    }
    const item = await seed(); const fake = new FaultFake();
    await worker(fake)(item.orderId); await worker(fake)(item.orderId);
    assert.equal(fake.invoiceSubmissions, 1);
    assert.equal((await attemptFor(item.items[0].orderItemId)).status, "UNCERTAIN");
    assert.equal(await deliveries(item.orderId), "0");
  }
  const pending = await seed(); const pendingFake = new Fake("pending");
  await worker(pendingFake)(pending.orderId);
  const readInvoice = pendingFake.readInvoice.bind(pendingFake); let queryFail = true;
  pendingFake.readInvoice = async (id) => { if (queryFail) throw new Error("SYNTHETIC_GET_FAILED"); return readInvoice(id); };
  await worker(pendingFake)(pending.orderId);
  queryFail = false;
  const knownInvoice = [...pendingFake.invoices.values()][0]; knownInvoice.status = "complete";
  knownInvoice.orders[0].status = "delivered";
  const knownChild = pendingFake.orders.get(knownInvoice.orders[0].id);
  knownChild.status = "delivered";
  knownChild.redemption_info = { code: "TEST_V13_CARD_CODE_ALPHA", pin: "TEST_V13_PIN_123456" };
  await worker(pendingFake)(pending.orderId);
  assert.equal(pendingFake.invoiceSubmissions, 1);
  assert.equal(await deliveries(pending.orderId), "1");
  console.log("P3_SUBMIT_FAULTS_NO_BLIND_RETRY_AND_GET_QUERY_RECOVERY_PASS");

  await rehearseParity({ sql, root });
  const batch = await mixedBatch({ sql, sqlQuote, binding, Fake, worker, createClient });
  const arg = process.argv.find((value) => value.startsWith("--p3-stability-seconds="));
  const seconds = arg ? Number(arg.split("=")[1]) : 0;
  assert.ok(Number.isInteger(seconds) && seconds >= 0 && seconds <= 1800);
  if (seconds) await stability({ seconds, sql, batch });
  return { mixedOrders: 100, stabilitySeconds: seconds };
}

async function rehearseParity({ sql, root }) {
  const query = readFileSync(resolve(root, "docs/integrations/sql/bitrefill-v1-3-authoritative-parity.sql"), "utf8").trim().replace(/;$/, "");
  const capture = `select md5(string_agg(row_to_json(p)::text,E'\\n' order by section,object_type,object_name,definition))
    from (${query}) p where section='contract'`;
  const original = await sql(capture);
  const signature = "public.record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text)";
  for (const [label, change] of [
    ["policy", 'alter policy "users can read own orders" on public.orders using(false)'],
    ["acl", "grant select on public.digital_delivery_secrets to anon"],
    ["function_execute", `grant execute on function ${signature} to anon`],
    ["search_path", `alter function ${signature} set search_path=pg_catalog`],
    ["constraint", "alter table public.supplier_fulfillment_requests drop constraint supplier_fulfillment_requests_supplier_check"],
    ["trigger", "drop trigger supplier_fulfillment_requests_set_updated_at on public.supplier_fulfillment_requests"],
  ]) {
    const changed = await sql(`begin; ${change}; ${capture}; rollback;`);
    assert.notEqual(changed, original, `P3_PARITY_MISSED_${label}`);
    assert.equal(await sql(capture), original, `P3_PARITY_ROLLBACK_FAILED_${label}`);
  }
  const enabledQuery = readFileSync(resolve(root, "docs/integrations/sql/bitrefill-p3-trigger-enabled-parity.sql"), "utf8").trim().replace(/;$/, "");
  const enabledCapture = `select md5(string_agg(row_to_json(t)::text,'' order by trigger_name)) from (${enabledQuery}) t`;
  const enabledOriginal = await sql(enabledCapture);
  const disabled = await sql(`begin; alter table public.supplier_fulfillment_requests disable trigger
    supplier_fulfillment_requests_set_updated_at; ${enabledCapture}; rollback;`);
  assert.notEqual(disabled, enabledOriginal, "P3_DISABLED_TRIGGER_NOT_DETECTED");
  assert.equal(await sql(enabledCapture), enabledOriginal);
  console.log("P3_DB8_LOCAL_SIX_METADATA_DRIFT_CLASSES_DETECTED_PASS; PRODUCTION_PARITY=no");
}

async function mixedBatch({ sql, sqlQuote, binding, Fake, worker, createClient }) {
  const distribution = [["bitrefill",25],["daju",15],["local",15],["unbound",10],
    ["unpaid",10],["balance",10],["untrusted",5],["processing",10]];
  const entries = distribution.flatMap(([kind,count]) => Array.from({ length: count }, () => ({ kind,
    orderId: randomUUID(), itemId: randomUUID(), userId: randomUUID() })));
  await sql(`insert into public.orders(id,order_no,user_id,status,payment_status,currency)
    values ${entries.map((e) => `('${e.orderId}','synthetic-p3-${e.orderId}','${e.userId}',
      '${e.kind === "unpaid" ? "pending_payment" : "paid"}','${e.kind === "unpaid" ? "unpaid" : "paid"}','USD')`).join(",")};
    insert into public.order_items(id,order_id,product_name,unit_price,line_total,quantity,delivery_type,product_snapshot)
    values ${entries.map((e) => `('${e.itemId}','${e.orderId}','SYNTHETIC_P3_BATCH',6,6,1,'auto_delivery',
      ${sqlQuote(JSON.stringify({ supplier_binding: ["local","unbound"].includes(e.kind) ? null
        : e.kind === "daju" ? { ...binding, supplier: "daju", supplier_product_id: 123 } : binding }))}::jsonb)`).join(",")}`);
  const daju = new Set(); const local = new Set();
  const balanceBefore = await sql("select coalesce(json_agg(p order by id)::text,'[]') from public.profiles p");
  for (const entry of entries) {
    class ItemFake extends Fake {
      async createInvoice(request) {
        const invoice = await super.createInvoice(request);
        const data = this.invoices.get(invoice.id);
        const child = this.orders.get(data.orders[0].id);
        child.quantity = 1; child.invoice_id = invoice.id;
        if (child.status === "delivered") child.redemption_info = {
          code: `TEST_V13_CARD_CODE_ALPHA:${entry.itemId}`, pin: "TEST_V13_PIN_123456" };
        return invoice;
      }
    }
    entry.fake = new ItemFake(entry.kind === "processing" ? "pending" : "delivered");
    entry.service = createClient();
    const original = worker(entry.fake, { balanceState: entry.kind === "balance" ? "insufficient" : "sufficient",
      missingCost: entry.kind === "untrusted" });
    entry.dispatch = async () => {
      if (entry.kind === "daju") {
        await dispatchLocalPaidSuppliers({ service: entry.service, orderId: entry.orderId,
          daju: async () => { daju.add(entry.orderId); return { handled:1,fulfilled:1,failed:0,uncertain:0,needsInput:0 }; } });
      } else if (entry.kind === "local") {
        const summary = await dispatchLocalPaidSuppliers({ service: entry.service, orderId: entry.orderId });
        assert.equal(summary.handled,0); local.add(entry.orderId);
      }
      else {
        try { await original(entry.orderId); }
        catch (error) { assert.equal(entry.kind, "unpaid"); assert.match(error.message, /ORDER_NOT_ELIGIBLE/); }
      }
    };
  }
  // Daju/local are routing-only simulated collaborators here. Their real
  // provider/local-inventory regression suites run separately; no second store.
  await bounded([() => entries[0].dispatch(), () => entries[0].dispatch(),
    ...entries.map((entry) => () => entry.dispatch())]);
  const paid = entries.filter((entry) => entry.kind !== "unpaid");
  await bounded(Array.from({ length: 100 }, (_,index) => () => paid[index % paid.length].dispatch()));
  const processing = entries.filter((entry) => entry.kind === "processing");
  // One child progresses via two independent clients: webhook payload is a
  // wake-up only; both reconcilers must authenticate their simulated GET reads.
  const target = processing[0];
  const invoice = [...target.fake.invoices.values()][0];
  invoice.status = "complete";
  invoice.orders[0].status = "delivered";
  const child = target.fake.orders.get(invoice.orders[0].id);
  child.status = "delivered";
  child.redemption_info = { code: `TEST_V13_CARD_CODE_ALPHA:${target.itemId}`, pin: "TEST_V13_PIN_123456" };
  const event = { eventId: `p3-event-${target.itemId}`, invoiceId: invoice.id,
    status: "forged", redemption_info: { code: "REJECTED_WEBHOOK_PAYLOAD" } };
  await Promise.all([
    wakeLocalBitrefill({ service: createClient(), transport: target.fake, event,
      dispatch: worker(target.fake, {}, createClient()) }),
    worker(target.fake, {}, createClient())(target.orderId),
  ]);
  await bounded(Array.from({ length: 100 }, () => () => wakeLocalBitrefill({
    service: createClient(), transport: target.fake, event, dispatch: target.dispatch })));
  const ids = entries.map((entry) => sqlQuote(entry.orderId)).join(",");
  async function verify() {
    for (const entry of entries) {
      assert.equal(entry.fake.invoiceSubmissions, ["bitrefill","processing"].includes(entry.kind) ? 1 : 0);
    }
    assert.equal(daju.size, 15); assert.equal(local.size, 15);
    assert.equal(await sql(`select count(*) from public.order_deliveries where order_id in (${ids})`), "26");
    assert.equal(await sql(`select count(*) from public.digital_delivery_secrets s join public.order_deliveries d
      on d.id=s.delivery_id where d.order_id in (${ids})`), "26");
    assert.equal(await sql(`select count(*) from public.digital_delivery_secrets s join public.order_deliveries d
      on d.id=s.delivery_id where d.order_id in (${ids})
      and position('TEST_V13_CARD_CODE_ALPHA:' || d.order_item_id::text in s.content)=0`), "0");
    assert.equal(await sql(`select count(*) from public.supplier_fulfillment_requests where order_id in (${ids})
      and supplier <> 'bitrefill'`), "0");
    assert.equal(await sql(`select count(*) from public.supplier_purchase_attempts a join
      public.supplier_purchase_attempt_items i on i.attempt_id=a.id join public.order_items oi on oi.id=i.order_item_id
      where oi.order_id in (${ids})`), "35");
    assert.equal(await sql("select coalesce(json_agg(p order by id)::text,'[]') from public.profiles p"), balanceBefore);
    assert.equal(REAL_BITREFILL_PURCHASE_ENABLED, false);
  }
  await verify();
  console.log("P3_MIXED_100_ORDERS_100_PAID_EVENTS_100_WEBHOOKS_NO_CROSS_ORDER_OR_BALANCE_DRIFT_PASS");
  return { entries, verify, webhook: () => wakeLocalBitrefill({ service: createClient(),
    transport: target.fake, event, dispatch: target.dispatch }) };
}

export function checkP3StabilityClock({ wallMs, monotonicMs, gapMs }) {
  assert.ok(Number.isFinite(wallMs) && Number.isFinite(monotonicMs) && Number.isFinite(gapMs));
  assert.ok(Math.abs(wallMs-monotonicMs) <= 60_000 && gapMs >= 0 && gapMs <= 60_000,
    "P3_SOAK_INTERRUPTED_OR_CLOCK_JUMP");
}

async function stability({ seconds, sql, batch }) {
  // Filled after mixed-batch routing has completed; this function is intentionally
  // bounded by wall time, cycles, concurrency, response sizes and RSS.
  const started = performance.now(); const wallStarted = Date.now();
  const deadline = started + seconds * 1000;
  let lastTick = started;
  let cycles = 0; let maxRss = 0; let maxSessions = 0;
  const before = batch.entries.reduce((sum,e) => sum + e.fake.invoiceSubmissions,0);
  while (performance.now() < deadline) {
    const tick = performance.now();
    checkP3StabilityClock({ wallMs: Date.now()-wallStarted, monotonicMs: tick-started, gapMs: tick-lastTick });
    lastTick = tick;
    assert.ok(cycles < 200, "P3_SOAK_CYCLE_BOUND");
    const offset = cycles * 8;
    await bounded(Array.from({ length: 8 }, (_,index) => () => batch.entries[(offset+index)%100].dispatch()));
    if (cycles % 5 === 0) await batch.webhook();
    const sessions = Number(await sql("select count(*) from pg_stat_activity where datname=current_database()"));
    maxSessions = Math.max(maxSessions,sessions);
    maxRss = Math.max(maxRss,process.memoryUsage().rss);
    assert.ok(sessions <= 8, "P3_SOAK_SESSION_LEAK");
    assert.ok(maxRss <= 768 * 1024 * 1024, "P3_SOAK_MEMORY_BOUND");
    assert.equal(REAL_BITREFILL_PURCHASE_ENABLED,false);
    assert.equal(batch.entries.reduce((sum,e) => sum + e.fake.invoiceSubmissions,0),before);
    cycles += 1;
    if (cycles % 5 === 0) console.log(`P3_STABILITY_PROGRESS seconds=${Math.floor((performance.now()-started)/1000)} cycles=${cycles} sessions=${sessions}`);
    await new Promise((resolve) => setTimeout(resolve,Math.min(10_000,Math.max(0,deadline-performance.now()))));
  }
  const finished = performance.now();
  checkP3StabilityClock({ wallMs: Date.now()-wallStarted, monotonicMs: finished-started, gapMs: finished-lastTick });
  await batch.verify();
  console.log(JSON.stringify({ stability_pass:true,duration_seconds:Math.floor((finished-started)/1000),
    cycles,max_sessions:maxSessions,max_rss_bytes:maxRss,real_purchase_enabled:false }));
}
