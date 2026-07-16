-- BEP20 manual-review payment record linkage.
--
-- payment_session_id is the provider/core payment session used by completePayment().
-- payment_id is the admin-visible order_payments record.
-- This migration does not mark orders or payments as paid.

do $$
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.payment_sessions') is null
     or to_regclass('public.order_payments') is null
     or to_regclass('public.orders') is null then
    raise exception 'BEP20 payment linkage requires chain_payment_sessions, payment_sessions, order_payments, and orders';
  end if;
end $$;

alter table public.chain_payment_sessions
  add column if not exists payment_session_id uuid;

alter table public.order_payments
  add column if not exists payment_session_id uuid,
  add column if not exists payable_currency text;

-- Before this migration chain_payment_sessions.payment_id referenced payment_sessions.
-- Preserve every valid historical value before changing that column's meaning.
do $$
declare
  v_invalid_ids text;
begin
  select string_agg(cps.payment_id::text, ', ' order by cps.payment_id::text)
  into v_invalid_ids
  from public.chain_payment_sessions cps
  where cps.payment_id is not null
    and not exists (
      select 1 from public.payment_sessions ps where ps.id = cps.payment_id
    );

  if v_invalid_ids is not null then
    raise exception 'BEP20 payment linkage found payment_id values that are not payment_sessions: %', v_invalid_ids;
  end if;

  update public.chain_payment_sessions
  set payment_session_id = payment_id
  where payment_session_id is null
    and payment_id is not null;
end $$;

-- Drop only the historical FK from chain_payment_sessions.payment_id to payment_sessions.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.chain_payment_sessions'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.payment_sessions'::regclass
      and a.attname = 'payment_id'
  loop
    execute format(
      'alter table public.chain_payment_sessions drop constraint %I',
      v_constraint.conname
    );
  end loop;
end $$;

update public.chain_payment_sessions
set payment_id = null
where payment_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chain_payment_sessions'::regclass
      and conname = 'chain_payment_sessions_payment_session_id_fkey'
  ) then
    alter table public.chain_payment_sessions
      add constraint chain_payment_sessions_payment_session_id_fkey
      foreign key (payment_session_id) references public.payment_sessions(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chain_payment_sessions'::regclass
      and conname = 'chain_payment_sessions_payment_id_fkey'
  ) then
    alter table public.chain_payment_sessions
      add constraint chain_payment_sessions_payment_id_fkey
      foreign key (payment_id) references public.order_payments(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_payments'::regclass
      and conname = 'order_payments_payment_session_id_fkey'
  ) then
    alter table public.order_payments
      add constraint order_payments_payment_session_id_fkey
      foreign key (payment_session_id) references public.payment_sessions(id) on delete set null;
  end if;
end $$;

-- Link existing AUTO-* payment records where the relationship is unambiguous.
update public.order_payments op
set payment_session_id = ps.id,
    payable_currency = coalesce(op.payable_currency, ps.currency)
from public.payment_sessions ps
where op.payment_session_id is null
  and op.payment_no = 'AUTO-' || ps.session_no
  and op.order_id = ps.business_id
  and ps.business_type = 'order';

-- Backfill admin-visible records for unfinished chain sessions that already have
-- a core payment session. Paid state and paid_at are deliberately not fabricated.
insert into public.order_payments (
  payment_no,
  payment_session_id,
  order_id,
  user_id,
  payment_method,
  amount,
  currency,
  status,
  transaction_reference,
  submitted_at,
  business_type,
  channel,
  network,
  business_amount,
  fee_amount,
  payable_amount,
  payable_currency,
  received_amount,
  received_currency,
  order_amount,
  order_currency,
  callback_status,
  exception_type,
  error_summary
)
select
  'AUTO-' || ps.session_no,
  ps.id,
  o.id,
  o.user_id,
  'usdt_bep20',
  o.total_amount,
  upper(coalesce(o.currency, 'CNY')),
  case
    when cps.status in ('manual_review', 'underpaid') then 'under_review'
    when cps.status in ('submitted', 'confirming', 'verified', 'completing', 'payment_failed') then 'processing'
    when cps.status in ('expired', 'failed') then cps.status
    else 'pending'
  end,
  cps.submitted_tx_hash,
  case when cps.submitted_tx_hash is not null then coalesce(cps.last_checked_at, cps.updated_at, now()) else null end,
  'order',
  'usdt_bep20',
  'BEP20',
  o.total_amount,
  0,
  cps.expected_amount,
  cps.payment_currency,
  coalesce(cps.confirmed_amount, 0),
  case when cps.confirmed_amount is not null then cps.payment_currency else null end,
  o.total_amount,
  upper(coalesce(o.currency, 'CNY')),
  case when cps.status = 'manual_review' then 'manual_review' else null end,
  case when cps.status in ('manual_review', 'underpaid') then 'amount_mismatch' else null end,
  coalesce(cps.manual_review_reason, cps.failure_reason)
from public.chain_payment_sessions cps
join public.payment_sessions ps
  on ps.id = cps.payment_session_id
join public.orders o
  on o.id = cps.order_id
where cps.payment_id is null
  and cps.status <> 'paid'
  and not exists (
    select 1 from public.order_payments existing
    where existing.payment_session_id = ps.id
       or existing.payment_no = 'AUTO-' || ps.session_no
  )
on conflict (payment_no) do nothing;

do $$
declare
  v_duplicate text;
begin
  select string_agg(payment_session_id::text, ', ' order by payment_session_id::text)
  into v_duplicate
  from (
    select payment_session_id
    from public.order_payments
    where payment_session_id is not null
    group by payment_session_id
    having count(*) > 1
  ) duplicates;

  if v_duplicate is not null then
    raise exception 'BEP20 payment linkage found duplicate order_payments payment_session_id values: %', v_duplicate;
  end if;
end $$;

create unique index if not exists order_payments_payment_session_unique
  on public.order_payments(payment_session_id)
  where payment_session_id is not null;

create unique index if not exists chain_payment_sessions_payment_session_unique
  on public.chain_payment_sessions(payment_session_id)
  where payment_session_id is not null;

create unique index if not exists chain_payment_sessions_order_payment_unique
  on public.chain_payment_sessions(payment_id)
  where payment_id is not null;

-- Existing completed AUTO-* records can now be linked to their chain session.
update public.chain_payment_sessions cps
set payment_id = op.id
from public.order_payments op
where cps.payment_id is null
  and cps.payment_session_id is not null
  and op.payment_session_id = cps.payment_session_id
  and op.order_id = cps.order_id;

create or replace function public.sync_bep20_chain_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_id is null then
    return new;
  end if;

  update public.order_payments op
  set status = case
        when op.status = 'paid' then 'paid'
        when new.status = 'paid' then 'paid'
        when new.status in ('manual_review', 'underpaid') then 'under_review'
        when new.status in ('submitted', 'confirming', 'verified', 'completing', 'payment_failed') then 'processing'
        when new.status in ('expired', 'failed') then new.status
        else 'pending'
      end,
      payment_method = 'usdt_bep20',
      channel = 'usdt_bep20',
      network = 'BEP20',
      payable_amount = new.expected_amount,
      payable_currency = new.payment_currency,
      received_amount = coalesce(new.confirmed_amount, op.received_amount),
      received_currency = case
        when new.confirmed_amount is not null then new.payment_currency
        else op.received_currency
      end,
      transaction_reference = coalesce(new.submitted_tx_hash, op.transaction_reference),
      callback_status = case
        when new.status = 'paid' then 'success'
        when new.status = 'manual_review' then 'manual_review'
        else op.callback_status
      end,
      exception_type = case
        when new.status in ('manual_review', 'underpaid') then 'amount_mismatch'
        when new.status = 'paid' then null
        else op.exception_type
      end,
      error_summary = case
        when new.status = 'manual_review' then coalesce(new.manual_review_reason, 'BEP20 payment requires manual review')
        when new.status = 'underpaid' then coalesce(new.failure_reason, 'BEP20 payment is underpaid')
        when new.status = 'paid' then null
        else coalesce(new.failure_reason, op.error_summary)
      end,
      updated_at = now()
  where op.id = new.payment_id
    and op.order_id = new.order_id;

  if not found then
    raise exception 'BEP20 chain session order payment linkage is missing or belongs to another order';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_bep20_chain_order_payment on public.chain_payment_sessions;
create trigger trg_sync_bep20_chain_order_payment
after insert or update of
  payment_id,
  status,
  expected_amount,
  confirmed_amount,
  submitted_tx_hash,
  failure_reason,
  manual_review_reason
on public.chain_payment_sessions
for each row execute function public.sync_bep20_chain_order_payment();

revoke all on function public.sync_bep20_chain_order_payment() from public, anon, authenticated;
grant execute on function public.sync_bep20_chain_order_payment() to service_role;
