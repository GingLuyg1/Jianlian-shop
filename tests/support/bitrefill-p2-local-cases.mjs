// Uses DB5's guarded PostgreSQL 17.11 database and real repository RPC bodies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";
import { createLocalBitrefillFulfillment, dispatchLocalPaidSuppliers,
  wakeLocalBitrefill } from "../../lib/providers/bitrefill/paid-order-local.mjs";
import { runPostPaymentDelivery } from "../../lib/orders/post-payment-delivery.mjs";
import { loadActualLocalDeliveryEntry } from "./bitrefill-p2-delivery-entry.mjs";

export async function runP2LocalCases({ sql, dbName, service, createClient, root, seedItems, product, quote }) {
  const { deliverDigitalOrder } = await loadActualLocalDeliveryEntry(root);
  const extract = (file, name) => {
    const source = readFileSync(resolve(root, file), "utf8");
    const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
    assert.ok(start >= 0, `${name}_REPOSITORY_BODY_REQUIRED`);
    const tail = source.slice(start);
    const delimiter = tail.match(/\bas\s+(\$[a-z_]*\$)/i);
    assert.ok(delimiter, `${name}_FUNCTION_DELIMITER_REQUIRED`);
    const end = tail.indexOf(`${delimiter[1]};`, delimiter.index + delimiter[0].length);
    assert.ok(end > 0);
    return tail.slice(0, end + delimiter[1].length + 1);
  };
  await sql(extract("supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql",
    "normalize_order_item_delivery_type"));
  await sql(extract("supabase/migrations/20260826190000_supplier_fulfillment_core_v1.sql",
    "claim_supplier_fulfillment"));
  await sql(`revoke all on function public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text)
    from public,anon,authenticated; grant execute on function
    public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text) to service_role`);

  const binding = { fulfillment_source: "supplier", supplier: "bitrefill",
    supplier_product_id: "synthetic-apple-us", supplier_sku: "synthetic-apple-5",
    supplier_currency: "USD", supplier_face_value: "5.00",
    supplier_max_unit_cost: "5.00", supplier_min_unit_profit: "1.00" };
  async function seed(count = 1) {
    const items = await seedItems(count);
    const orderId = await sql(`select order_id from public.order_items where id='${items[0].orderItemId}'`);
    // P2 must create the root using the real claim RPC, unlike P1's seed root.
    await sql(`delete from public.supplier_fulfillment_requests where order_id='${orderId}'`);
    await sql(`update public.orders set currency='USD' where id='${orderId}';
      update public.order_items set unit_price=6,line_total=6,
      product_snapshot=${quote(JSON.stringify({ supplier_binding: binding }))}::jsonb
      where order_id='${orderId}'`);
    return { orderId, items };
  }
  class Fake extends BitrefillFakeTransport {
    constructor(mode = "delivered") { super(); this.mode = mode; this.invoices = new Map(); this.orders = new Map(); }
    async createInvoice(request) {
      assert.deepEqual(request.products, [{ product_id: "synthetic-apple-us",
        package_id: "synthetic-apple-5", quantity: 1 }]);
      this.invoiceSubmissions += 1;
      if (this.mode === "timeout") { const error = new Error("SYNTHETIC_TIMEOUT"); error.submitted = true; throw error; }
      if (this.mode === "funds") { const error = new Error("SYNTHETIC_BALANCE_TOO_LOW"); error.submitted = true; throw error; }
      const id = `p2-invoice-${randomUUID()}`;
      const childId = `p2-child-${randomUUID()}`;
      const status = this.mode === "pending" ? "processing"
        : this.mode === "failed" || this.mode === "partial" && this.invoiceSubmissions === 2 ? "failed" : "delivered";
      const order = { id: childId, status, product: { id: this.mode === "wrong" ? "wrong-product" : product.external_product_id,
        value: 5 }, ...(status === "delivered" ? { redemption_info: {
          code: "TEST_V13_CARD_CODE_ALPHA", pin: "TEST_V13_PIN_123456" } } : {}) };
      this.orders.set(childId, order);
      this.invoices.set(id, { id, status: this.mode === "pending" ? "pending" : "complete",
        orders: [{ id: childId, status }] });
      return { id, status: "pending", orders: [] };
    }
    async readInvoice(id) { this.invoiceReads += 1; return structuredClone(this.invoices.get(id)); }
    async readOrder(id) { this.orderReads += 1; return structuredClone(this.orders.get(id)); }
  }
  function setup(fake, change = {}, workerService = service) {
    let priceReads = 0;
    const bitrefill = createLocalBitrefillFulfillment({ transport: fake,
      loadPricing: async () => {
        priceReads += 1;
        const now = new Date().toISOString();
        return { product: change.unavailable ? { ...product, availability: "unavailable" } : product,
          productCheckedAt: now, quote: change.missingCost ? null : { source: "authenticated_supplier_cost", synthetic: true,
            productId: product.external_product_id, packageId: "synthetic-apple-5", currency: "USD",
            amount: change.cost ?? "4.80", checkedAt: now,
            ...(change.currency ? { currency: change.currency } : {}) } };
      },
      loadFinancialEvidence: async ({ order, orderItem }) => ({ source: "synthetic_paid_ledger",
        orderId: order.id, orderItemId: orderItem.id, currency: "USD", paidItemAmount: "6.00",
        paymentFee: change.fee ?? "0.10", fxSource: "same_currency_no_conversion", maxUnitProfit: "2.00" }),
    });
    const dispatch = (orderId) => dispatchLocalPaidSuppliers({ service: workerService, orderId, bitrefill });
    const deliveryClient = { from: workerService.from.bind(workerService),
      async rpc(name, args) {
        if (name === "reserve_local_inventory_for_daju_order") return { data: {
          ok: true, local_ready_count: 0, supplier_fallback_count: 1, blocked_count: 0 }, error: null };
        if (name === "deliver_digital_order") return { data: { ok: true, delivered_count: 0 }, error: null };
        return workerService.rpc(name, args);
      } };
    return { dispatch, priceReads: () => priceReads,
      deliver: (orderId) => deliverDigitalOrder(deliveryClient, orderId, "synthetic_p2", undefined, bitrefill) };
  }

  for (const repeats of [2, 10, 100]) {
    const seeded = await seed();
    const fake = new Fake();
    const { deliver } = setup(fake);
    // Repeated post-payment notifications use the same repository wrapper and
    // local-priority orchestration. Local inventory is an explicit empty stub.
    for (let n = 0; n < repeats; n += 1) {
      const result = await runPostPaymentDelivery({ payment: { orderId: seeded.orderId },
        deliver: () => deliver(seeded.orderId) });
      assert.equal(result.deliveryError, null);
    }
    assert.equal(fake.invoiceSubmissions, 1);
    assert.equal(await sql(`select count(*) from public.supplier_purchase_attempt_items where
      order_item_id='${seeded.items[0].orderItemId}'`), "1");
    assert.equal(await sql(`select count(*) from public.digital_delivery_secrets s join
      public.order_deliveries d on d.id=s.delivery_id where d.order_id='${seeded.orderId}'`), "1");
    assert.equal(await sql(`select fulfillment_status from public.orders where id='${seeded.orderId}'`), "delivered");
    console.log(`P2_DUPLICATE_PAID_NOTIFY_${repeats}_ONE_PURCHASE_PRIVATE_DELIVERY_PASS`);
  }
  const concurrent = await seed();
  const concurrentFake = new Fake();
  const sessions = await Promise.all([0, 1].map(() => sql(
    "select pg_backend_pid() from (select pg_sleep(0.25)) overlap", dbName, "service_role")));
  assert.equal(new Set(sessions).size, 2, "P2_TWO_DISTINCT_POSTGRES_BACKENDS_REQUIRED");
  const workers = [setup(concurrentFake, {}, createClient()), setup(concurrentFake, {}, createClient())];
  await Promise.all(Array.from({ length: 10 }, (_, n) => workers[n % 2].dispatch(concurrent.orderId)));
  assert.equal(concurrentFake.invoiceSubmissions, 1);
  assert.equal(await sql(`select count(*) from public.order_deliveries where order_id='${concurrent.orderId}'`), "1");
  console.log("P2_TWO_DISTINCT_PG_SESSIONS_CONCURRENT_PAID_DISPATCH_ONE_PURCHASE_PASS");

  // Additional disposable fixture fields only; execute the exact existing
  // customer-balance and payment-completion functions, with no handwritten pay
  // implementation and no service/database outside this guarded local DB.
  await sql(`alter table public.orders add column total_amount numeric,
    add column payment_method text, add column paid_at timestamptz,
    add column updated_at timestamptz default now();
    create table public.profiles(id uuid primary key,balance numeric,updated_at timestamptz);
    create table public.balance_transactions(id uuid primary key default gen_random_uuid(),
      user_id uuid,transaction_no text unique,business_type text,business_id text,direction text,
      amount numeric,balance_before numeric,balance_after numeric,currency text,status text,
      remark text,metadata jsonb);
    create unique index p2_customer_debit_once on public.balance_transactions(business_type,business_id)
      where status='completed';
    create table public.order_payments(payment_no text primary key,order_id uuid,user_id uuid,
      payment_method text,amount numeric,currency text,status text,transaction_reference text,
      submitted_at timestamptz,reviewed_at timestamptz,business_type text,channel text,
      business_amount numeric,fee_amount numeric,payable_amount numeric,received_amount numeric,
      order_amount numeric,order_currency text,received_currency text,provider_trade_no text,
      paid_at timestamptz,callback_status text,updated_at timestamptz);
    create table public.order_status_logs(order_id uuid,from_status text,to_status text,
      operator_id uuid,operator_type text,note text);
    alter table public.profiles enable row level security;
    alter table public.balance_transactions enable row level security;
    alter table public.order_payments enable row level security;
    alter table public.order_status_logs enable row level security;
    revoke all on public.profiles,public.balance_transactions,public.order_payments,
      public.order_status_logs from public,anon,authenticated,service_role;`);
  await sql(extract("supabase/migrations/20260710_order_payment_inventory_idempotency_fix.sql", "complete_order_payment"));
  await sql(extract("supabase/migrations/20260703_balance_order_payment.sql", "pay_order_with_balance"));
  await sql(`revoke all on function public.pay_order_with_balance(uuid,uuid,text),
    public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz) from public,anon,authenticated;
    grant execute on function public.pay_order_with_balance(uuid,uuid,text),
    public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz) to service_role`);
  // One continuous synthetic checkout: new unpaid order and SKU -> original
  // authoritative balance/payment RPCs -> actual delivery/router -> owner read.
  // Creation inserts synthetic records into the existing tables; it does not
  // claim to exercise the storefront create_order_with_item HTTP/RPC path.
  const customerId = randomUUID();
  const internalProductId = randomUUID();
  const internalSkuId = randomUUID();
  const balanceOrder = { orderId: randomUUID(), items: [{ orderItemId: randomUUID() }] };
  await sql(`insert into public.products(id) values('${internalProductId}');
    insert into public.product_skus(id) values('${internalSkuId}');
    insert into public.orders(id,order_no,user_id,status,payment_status,currency,total_amount,payment_method)
    values('${balanceOrder.orderId}','synthetic-p2-checkout-${balanceOrder.orderId}',
      '${customerId}','pending_payment','unpaid','USD',6,'balance');
    insert into public.order_items(id,order_id,product_id,sku_id,product_name,unit_price,line_total,
      quantity,delivery_type,product_snapshot)
    values('${balanceOrder.items[0].orderItemId}','${balanceOrder.orderId}','${internalProductId}',
      '${internalSkuId}','SYNTHETIC_P2_CHECKOUT',6,6,1,'auto_delivery',
      ${quote(JSON.stringify({ supplier_binding: binding }))}::jsonb);
    insert into public.profiles(id,balance) values('${customerId}',100)`);
  const balanceFake = new Fake();
  const balanceRun = setup(balanceFake, { fee: "0" });
  await assert.rejects(balanceRun.dispatch(balanceOrder.orderId), /ORDER_NOT_ELIGIBLE/);
  assert.equal(balanceFake.invoiceSubmissions, 0);
  assert.equal(await sql(`select count(*) from public.supplier_fulfillment_requests
    where order_id='${balanceOrder.orderId}'`), "0");
  for (let n = 0; n < 10; n += 1) {
    const payment = JSON.parse(await sql(`select public.pay_order_with_balance(
      '${balanceOrder.orderId}','${customerId}','synthetic-p2-balance')`, dbName, "service_role"));
    assert.equal(payment.paymentStatus, "paid");
    await balanceRun.deliver(balanceOrder.orderId);
  }
  assert.equal(await sql(`select balance::text from public.profiles where id='${customerId}'`), "94.000000");
  assert.equal(await sql(`select count(*) from public.balance_transactions where business_id='${balanceOrder.orderId}'`), "1");
  assert.equal(balanceFake.invoiceSubmissions, 1);
  assert.equal(await sql(`select count(*) from public.supplier_purchase_attempt_items i
    join public.supplier_fulfillment_requests r on r.id=i.fulfillment_request_id
    join public.supplier_purchase_attempts a on a.id=i.attempt_id
    where r.order_id='${balanceOrder.orderId}' and i.frozen_product_id='synthetic-apple-us'
      and i.frozen_package_id='synthetic-apple-5' and i.quoted_unit_cost=4.8
      and i.max_unit_cost=5 and length(a.semantic_request_hash)=64`), "1");
  console.log("P2_REPO_CUSTOMER_BALANCE_RPC_TEN_REPLAY_ONE_DEBIT_ONE_SUPPLIER_PURCHASE_PASS");

  await sql(`alter table public.order_deliveries add column viewed_at timestamptz,
    add column delivery_note text`);
  await sql(extract("supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql", "mask_delivery_secret"));
  await sql(extract("supabase/migrations/20260810190000_user_delivery_compatibility.sql", "get_order_delivery_for_user"));
  await sql(`revoke all on function public.get_order_delivery_for_user(text) from public,anon;
    grant execute on function public.get_order_delivery_for_user(text) to authenticated,service_role`);
  const orderNo = await sql(`select order_no from public.orders where id='${balanceOrder.orderId}'`);
  const own = await sql(`select set_config('request.jwt.claim.sub','${customerId}',false);
    select count(*) from public.get_order_delivery_for_user(${quote(orderNo)})
    where content like '%TEST_V13_CARD_CODE_ALPHA%'`, dbName, "authenticated");
  assert.equal(own.split(/\r?\n/).at(-1), "1");
  await assert.rejects(sql(`select set_config('request.jwt.claim.sub','${randomUUID()}',false);
    select count(*) from public.get_order_delivery_for_user(${quote(orderNo)})`, dbName, "authenticated"),
  /order not found or access denied/);
  await assert.rejects(sql(`select count(*) from public.get_order_delivery_for_user(${quote(orderNo)})`,
    dbName, "anon"), /permission denied/);
  console.log("P2_EXISTING_CUSTOMER_DELIVERY_RPC_OWNER_ONLY_SECRET_ACCESS_PASS");
  await setup(balanceFake, {}, createClient()).deliver(balanceOrder.orderId);
  assert.equal(balanceFake.invoiceSubmissions, 1);
  assert.equal(await sql(`select count(*) from public.digital_delivery_secrets s join
    public.order_deliveries d on d.id=s.delivery_id where d.order_id='${balanceOrder.orderId}'`), "1");
  console.log("FULL_OFFLINE_PURCHASE_TO_DELIVERY_E2E=PASS; PRIVATE_COMMIT_RESTART_NO_DUPLICATE=PASS");

  const partial = await seed(2);
  const partialFake = new Fake("partial");
  const partialRun = setup(partialFake);
  await partialRun.dispatch(partial.orderId);
  await partialRun.dispatch(partial.orderId);
  assert.equal(partialFake.invoiceSubmissions, 2);
  assert.equal(await sql(`select count(*) from public.order_deliveries where order_id='${partial.orderId}'`), "1");
  assert.equal(await sql(`select fulfillment_status from public.orders where id='${partial.orderId}'`), "processing");
  console.log("P2_TWO_ITEMS_PARTIAL_SUCCESS_ONE_SECRET_NO_REPURCHASE_PASS");

  const cancelled = await seed();
  class CancelAfterSubmit extends Fake {
    async createInvoice(request) {
      const invoice = await super.createInvoice(request);
      await sql(`update public.orders set status='cancelled' where id='${cancelled.orderId}'`);
      return invoice;
    }
  }
  const cancelledFake = new CancelAfterSubmit();
  await setup(cancelledFake).dispatch(cancelled.orderId);
  assert.equal(cancelledFake.invoiceSubmissions, 1);
  assert.equal(await sql(`select count(*) from public.order_deliveries where order_id='${cancelled.orderId}'`), "0");
  console.log("P2_CANCEL_AFTER_SUPPLIER_SUBMIT_BLOCKS_PRIVATE_DELIVERY_PASS");

  for (const mode of ["timeout", "funds", "wrong", "failed", "pending", "cost", "unavailable", "fee", "missing_cost", "currency"]) {
    const seeded = await seed();
    const fake = new Fake(mode);
    const run = setup(fake, { ...(mode === "cost" ? { cost: "5.10" } : {}),
      ...(mode === "unavailable" ? { unavailable: true } : {}), ...(mode === "fee" ? { fee: "1.50" } : {}),
      ...(mode === "missing_cost" ? { missingCost: true } : {}), ...(mode === "currency" ? { currency: "EUR" } : {}) });
    await run.dispatch(seeded.orderId);
    await run.dispatch(seeded.orderId);
    assert.equal(fake.invoiceSubmissions, ["cost", "unavailable", "fee", "missing_cost", "currency"].includes(mode) ? 0 : 1);
    assert.equal(await sql(`select count(*) from public.order_deliveries where order_id='${seeded.orderId}'`), "0");
    if (["timeout", "funds"].includes(mode)) {
      assert.equal(await sql(`select a.status from public.supplier_purchase_attempts a join
        public.supplier_purchase_attempt_items i on i.attempt_id=a.id where
        i.order_item_id='${seeded.items[0].orderItemId}'`), "UNCERTAIN");
    }
    console.log(`P2_${mode.toUpperCase()}_NO_WRONG_DELIVERY_OR_REPURCHASE_PASS`);
  }
  for (const state of ["unpaid", "cancelled", "refunded"]) {
    const seeded = await seed();
    await sql(`update public.orders set ${state === "unpaid" ? "payment_status='unpaid'" : `status='${state}'`}
      where id='${seeded.orderId}'`);
    const fake = new Fake();
    await assert.rejects(setup(fake).dispatch(seeded.orderId), /BITREFILL_P2_ORDER_NOT_ELIGIBLE/);
    assert.equal(fake.invoiceSubmissions, 0);
  }
  console.log("P2_UNPAID_CANCELLED_REFUNDED_BLOCKED_PASS");

  const wake = await seed();
  const wakeFake = new Fake("pending");
  const wakeRun = setup(wakeFake);
  await wakeRun.dispatch(wake.orderId);
  const invoiceId = [...wakeFake.invoices.keys()][0];
  const invoice = wakeFake.invoices.get(invoiceId);
  const child = wakeFake.orders.get(invoice.orders[0].id);
  child.status = "delivered";
  child.redemption_info = { code: "TEST_V13_CARD_CODE_ALPHA", pin: "TEST_V13_PIN_123456" };
  invoice.status = "complete";
  invoice.orders[0].status = "delivered";
  const event = { eventId: "synthetic-p2-wake", invoiceId,
    redemption_info: { code: "UNTRUSTED_WEBHOOK_CODE" } };
  const restartedPoll = setup(wakeFake, {}, createClient());
  const restartedWebhook = setup(wakeFake, {}, createClient());
  const readsBeforeRestart = wakeFake.invoiceReads;
  await Promise.all([wakeLocalBitrefill({ service: createClient(), transport: wakeFake, event, dispatch: restartedWebhook.dispatch }),
    restartedPoll.dispatch(wake.orderId)]);
  assert.equal(restartedPoll.priceReads() + restartedWebhook.priceReads(), 0);
  assert.ok(wakeFake.invoiceReads > readsBeforeRestart);
  assert.equal((await wakeLocalBitrefill({ service, transport: wakeFake, event,
    dispatch: wakeRun.dispatch })).reconciled, false);
  assert.equal(wakeFake.invoiceSubmissions, 1);
  assert.equal(wakeRun.priceReads(), 1);
  assert.equal(await sql(`select count(*) from public.order_deliveries where order_id='${wake.orderId}'`), "1");
  await sql(`update public.orders set status='refunded',payment_status='refunded' where id='${wake.orderId}'`);
  await assert.rejects(wakeRun.dispatch(wake.orderId), /BITREFILL_P2_ORDER_NOT_ELIGIBLE/);
  assert.equal(wakeFake.invoiceSubmissions, 1);
  console.log("P2_WEBHOOK_POLL_GET_RECOVERY_AND_POST_DELIVERY_REFUND_PASS");
}
