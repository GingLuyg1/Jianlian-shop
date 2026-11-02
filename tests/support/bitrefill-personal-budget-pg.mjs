import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
export async function runPersonalBudgetCases({ sql, root, pass }) {
  const migration = readFileSync(root+'/supabase/migrations/20261102100746_bitrefill_pin_atomic_budget_personal_runtime.sql','utf8');
  await sql(migration);pass('PERSONAL_ATOMIC_BUDGET_CANDIDATE_APPLIED_ISOLATED_ONLY');
  // Existing Production refund columns, absent only from this narrow old fixture.
  await sql("alter table public.orders add column refund_status text not null default 'none', add column refunded_amount numeric not null default 0");
  await sql("create table public.refund_requests(order_id uuid,status text)");
  const sku='eeef050f-3b56-492d-a0a2-0640e4c1355f',product='e00553bf-a2da-48c7-9bdc-9b897b18b2fd',account='a'.repeat(64),contract='c'.repeat(64);
  const q=x=>"'"+String(x).replaceAll("'","''")+"'";
  await sql(`update bitrefill_pin_private.sale_authorizations set enabled=true,auth_mode='personal',account_fingerprint=${q(account)},max_unit_cost_usd=15,min_profit_cny=1,cumulative_cap_usd=20,permission_reference='SYNTHETIC_PERSONAL_SCOPE',funding_reference='SYNTHETIC_FUNDS' where sku_id=${q(sku)}`);
  async function seed(paid=true) {
    const order=randomUUID(),item=randomUUID(),key='bitrefill:'+item+':1';
    await sql(`insert into public.orders(id,order_no,user_id,status,payment_status,currency) values(${q(order)},${q('SYNTHETIC_'+order)},${q(randomUUID())},${q(paid?'paid':'pending_payment')},${q(paid?'paid':'unpaid')},'CNY');
      insert into public.order_items(id,order_id,product_id,sku_id,product_name,unit_price,line_total,quantity,product_snapshot) values(${q(item)},${q(order)},${q(product)},${q(sku)},'synthetic',100,100,1,'{"supplier_binding":{"supplier":"bitrefill"}}');
      insert into public.supplier_purchase_attempts(supplier,logical_request_key,semantic_request_hash,status,submit_started_at) values('bitrefill',${q(key)},${q(contract)},'SUBMITTING',now())`);
    return key;
  }
  const reserve=(key,amount='13.44',who=account,hash=contract)=>`select public.internal_bitrefill_pin_reserve_budget(${q(sku)},${q(key)},${q(who)},${amount},${q(hash)},'personal',100,clock_timestamp())`;
  const transition=(key,next,invoice='null')=>`select public.internal_bitrefill_pin_transition_budget(${q(key)},${q(account)},${q(contract)},${q(next)},${invoice})`;
  const first=await seed();
  const one=JSON.parse(await sql(reserve(first),'service_role'));
  const two=JSON.parse(await sql(reserve(first),'service_role'));
  assert.equal(one.reservationId,two.reservationId);pass('BUDGET_DUPLICATE_LOGICAL_KEY_EXACTLY_ONE_RESERVATION');
  await assert.rejects(sql(reserve(first,'13.44',account,'d'.repeat(64)),'service_role'),/REPLAY_CONFLICT/);
  await assert.rejects(sql(reserve(await seed(),'13.44','b'.repeat(64)),'service_role'),/AUTHORIZATION_INVALID/);
  await assert.rejects(sql(reserve(await seed(),'15.01'),'service_role'),/CAP_EXCEEDED/);
  await assert.rejects(sql(reserve(await seed()),'service_role'),/CAP_EXCEEDED/);pass('BUDGET_UNIT_CUMULATIVE_ACCOUNT_CONTRACT_GATES');
  await assert.rejects(sql(reserve(await seed(false)),'service_role'),/PAID_CLAIM_REQUIRED/);pass('BUDGET_UNPAID_CANNOT_RESERVE');
  await sql(transition(first,'HELD'),'service_role');
  await assert.rejects(sql(transition(first,'RELEASED'),'service_role'),/UNCERTAIN_HELD/);
  await assert.rejects(sql(reserve(first),'service_role'),/REPLAY_CONFLICT/);pass('UNCERTAIN_BUDGET_HELD_NO_RELEASE_OR_SECOND_SUBMIT');
  // Fresh isolated account cohort to exercise genuinely concurrent transactions.
  await sql(`update bitrefill_pin_private.sale_authorizations set cumulative_cap_usd=40 where sku_id=${q(sku)}`);
  const keys=await Promise.all([seed(),seed(),seed()]);
  const concurrent=await Promise.allSettled(keys.map(k=>sql(reserve(k),'service_role')));
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);pass('BUDGET_CONCURRENT_CUMULATIVE_RESERVATION_SERIALIZED');
  const winner=keys[concurrent.findIndex(x=>x.status==='fulfilled')];
  await sql(transition(winner,'RELEASED'),'service_role');
  await assert.rejects(sql(reserve(winner),'service_role'),/REPLAY_CONFLICT/);pass('PRE_SEND_RELEASE_DOES_NOT_REOPEN_LOGICAL_KEY');
  const denied=await seed();
  for(const role of ['anon','authenticated'])await assert.rejects(sql(reserve(denied),role),/permission denied/);
  assert.equal(await sql(`select has_table_privilege('authenticated','bitrefill_pin_private.budget_reservations','SELECT')`),'f');
  assert.equal(await sql(`select has_function_privilege('authenticated','public.internal_bitrefill_pin_reserve_budget(uuid,text,text,numeric,text,text,numeric,timestamptz)','EXECUTE')`),'f');
  pass('BUDGET_SERVICE_ONLY_RLS_ACL');
  // Only a persisted Invoice ID plus server authoritative-debit validator may
  // consume; a missing/unpersisted Invoice cannot free held budget.
  await assert.rejects(sql(transition(first,'CONSUMED',q(randomUUID())),'service_role'),/PERSISTED_INVOICE_REQUIRED/);
  pass('BUDGET_CONSUME_REQUIRES_PERSISTED_ORIGINAL_INVOICE');
  const invoice=randomUUID();
  await sql(`select public.internal_supplier_purchase_transition(id,'SUBMITTING','EXTERNAL_CREATED',${q(invoice)}) from public.supplier_purchase_attempts where logical_request_key=${q(first)}`,'service_role');
  await sql(transition(first,'CONSUMED',q(invoice)),'service_role');
  assert.equal(await sql(`select status from bitrefill_pin_private.budget_reservations where logical_key=${q(first)}`),'CONSUMED');
  await sql(transition(first,'CONSUMED',q(invoice)),'service_role');
  await assert.rejects(sql(transition(first,'CONSUMED',q(randomUUID())),'service_role'),/INVOICE_MISMATCH/);
  pass('BUDGET_CONSUME_EXACT_INVOICE_IDEMPOTENT');
}
