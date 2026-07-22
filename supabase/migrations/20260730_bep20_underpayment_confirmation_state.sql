-- Backfill the server confirmation timestamp for strictly evidenced historical
-- BEP20 underpayments. This migration does not settle payments, credit wallets,
-- release inventory, or change any order/payment status.

begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(v.object_name order by v.object_name)
  into v_missing
  from (values
    ('public.chain_payment_sessions'),
    ('public.chain_transactions'),
    ('public.chain_transaction_claims'),
    ('public.orders'),
    ('public.payment_sessions'),
    ('public.order_payments'),
    ('public.bep20_underpayment_dispositions')
  ) as v(object_name)
  where to_regclass(v.object_name) is null;

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_PREFLIGHT_TABLES_MISSING: %', v_missing;
  end if;

  if to_regprocedure('public.list_expirable_bep20_underpayments(integer)') is null
     or to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)') is null then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_PREFLIGHT_RPCS_MISSING';
  end if;

  select array_agg(v.column_name order by v.column_name)
  into v_missing
  from (values
    ('chain_payment_sessions.id'), ('chain_payment_sessions.order_id'),
    ('chain_payment_sessions.payment_session_id'), ('chain_payment_sessions.payment_id'),
    ('chain_payment_sessions.status'), ('chain_payment_sessions.confirmed_at'),
    ('chain_payment_sessions.manual_review_decision'),
    ('chain_payment_sessions.submitted_tx_hash'), ('chain_payment_sessions.chain_id'),
    ('chain_payment_sessions.network'), ('chain_payment_sessions.asset'),
    ('chain_payment_sessions.payment_currency'), ('chain_payment_sessions.order_currency'),
    ('chain_payment_sessions.token_contract'), ('chain_payment_sessions.receive_address'),
    ('chain_payment_sessions.expected_raw_amount'), ('chain_payment_sessions.confirmed_raw_amount'),
    ('chain_payment_sessions.expected_amount'), ('chain_payment_sessions.confirmed_amount'),
    ('chain_payment_sessions.exchange_rate'), ('chain_payment_sessions.order_amount'),
    ('chain_payment_sessions.expires_at'), ('chain_payment_sessions.created_at'),
    ('chain_transactions.chain_payment_session_id'), ('chain_transactions.order_id'),
    ('chain_transactions.chain_id'), ('chain_transactions.tx_hash'),
    ('chain_transactions.status'), ('chain_transactions.token_contract'),
    ('chain_transactions.to_address'), ('chain_transactions.raw_amount'),
    ('chain_transactions.normalized_amount'), ('chain_transactions.confirmation_count'),
    ('chain_transactions.block_timestamp'), ('chain_transactions.created_at'),
    ('chain_transaction_claims.chain_id'), ('chain_transaction_claims.tx_hash'),
    ('chain_transaction_claims.order_id'), ('chain_transaction_claims.chain_payment_session_id'),
    ('orders.id'), ('orders.user_id'), ('orders.order_no'), ('orders.status'),
    ('orders.payment_status'), ('orders.currency'), ('orders.payment_method'),
    ('orders.total_amount'), ('orders.payment_expires_at'),
    ('orders.reservation_released_at'),
    ('payment_sessions.id'), ('payment_sessions.business_type'),
    ('payment_sessions.business_id'), ('payment_sessions.user_id'),
    ('payment_sessions.business_no'), ('payment_sessions.channel_code'),
    ('payment_sessions.network'), ('payment_sessions.wallet_address'),
    ('payment_sessions.status'), ('payment_sessions.currency'),
    ('payment_sessions.payable_amount'), ('payment_sessions.expires_at'),
    ('order_payments.id'), ('order_payments.order_id'), ('order_payments.user_id'),
    ('order_payments.payment_session_id'), ('order_payments.status'),
    ('order_payments.amount'), ('order_payments.currency'),
    ('order_payments.order_amount'), ('order_payments.order_currency'),
    ('order_payments.payment_method'), ('order_payments.network'),
    ('order_payments.payable_amount'), ('order_payments.payable_currency'),
    ('order_payments.received_amount'), ('order_payments.received_currency'),
    ('bep20_underpayment_dispositions.chain_session_id')
  ) as v(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(v.column_name, '.', 1)
      and c.column_name = split_part(v.column_name, '.', 2)
  );

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_PREFLIGHT_COLUMNS_MISSING: %', v_missing;
  end if;
end;
$$;

create temporary table bep20_underpayment_confirmation_candidates
on commit drop
as
select
  cps.id as session_id,
  tx.evidence_created_at as confirmation_time
from public.chain_payment_sessions cps
join public.orders o
  on o.id = cps.order_id
join public.payment_sessions ps
  on ps.id = cps.payment_session_id
join public.order_payments op
  on op.id = cps.payment_id
join lateral (
  select count(*)::integer as match_count
  from public.chain_transaction_claims ctc
  where ctc.chain_id = cps.chain_id
    and ctc.order_id = cps.order_id
    and ctc.chain_payment_session_id = cps.id
    and lower(ctc.tx_hash) = lower(cps.submitted_tx_hash)
) claim on claim.match_count = 1
join lateral (
  select
    count(*)::integer as match_count,
    min(ct.created_at) as evidence_created_at
  from public.chain_transactions ct
  where ct.chain_payment_session_id = cps.id
    and ct.order_id = cps.order_id
    and ct.chain_id = 56
    and lower(ct.tx_hash) = lower(cps.submitted_tx_hash)
    and ct.status = 'underpaid'
    and lower(ct.token_contract) = lower(cps.token_contract)
    and lower(ct.to_address) = lower(cps.receive_address)
    and ct.raw_amount is not distinct from cps.confirmed_raw_amount
    and ct.normalized_amount is not distinct from cps.confirmed_amount
    and ct.confirmation_count >= 12
    and ct.block_timestamp is not null
    and ct.created_at is not null
    and o.payment_expires_at is not null
    and ps.expires_at is not null
    and cps.expires_at is not null
    and ct.block_timestamp <= least(o.payment_expires_at, ps.expires_at, cps.expires_at)
) tx on tx.match_count = 1
where cps.status = 'underpaid'
  and cps.confirmed_at is null
  and cps.manual_review_decision is null
  and nullif(btrim(cps.submitted_tx_hash), '') is not null
  and cps.chain_id = 56
  and upper(cps.network) = 'BEP20'
  and upper(cps.asset) = 'USDT'
  and upper(cps.payment_currency) = 'USDT'
  and upper(cps.order_currency) = 'CNY'
  and cps.confirmed_raw_amount > 0
  and cps.confirmed_raw_amount < cps.expected_raw_amount
  and cps.confirmed_amount > 0
  and cps.confirmed_amount < cps.expected_amount
  and cps.exchange_rate > 0
  and nullif(btrim(cps.token_contract), '') is not null
  and nullif(btrim(cps.receive_address), '') is not null
  and o.status = 'pending_payment'
  and o.payment_status = 'unpaid'
  and o.reservation_released_at is null
  and upper(o.currency) = 'CNY'
  and lower(o.payment_method) = 'usdt_bep20'
  and o.total_amount > 0
  and ps.status in ('pending', 'processing')
  and ps.business_type = 'order'
  and ps.business_id is not distinct from o.id
  and ps.user_id is not distinct from o.user_id
  and ps.business_no is not distinct from o.order_no
  and lower(ps.channel_code) = 'usdt_bep20'
  and upper(ps.network) = 'BEP20'
  and lower(ps.wallet_address) = lower(cps.receive_address)
  and ps.payable_amount is not null
  and ps.payable_amount is not distinct from cps.expected_amount
  and upper(ps.currency) = 'USDT'
  and op.status = 'under_review'
  and op.payment_session_id is not distinct from ps.id
  and op.order_id is not distinct from o.id
  and op.user_id is not distinct from o.user_id
  and lower(op.payment_method) = 'usdt_bep20'
  and upper(op.network) = 'BEP20'
  and op.amount is not distinct from o.total_amount
  and op.order_amount is not distinct from o.total_amount
  and upper(op.currency) = 'CNY'
  and upper(op.order_currency) = 'CNY'
  and cps.order_amount is not distinct from o.total_amount
  and op.payable_amount is not null
  and op.payable_amount is not distinct from cps.expected_amount
  and upper(op.payable_currency) = 'USDT'
  and op.received_amount is not null
  and op.received_amount is not distinct from cps.confirmed_amount
  and upper(op.received_currency) = 'USDT'
  and o.payment_expires_at is not null
  and ps.expires_at is not null
  and cps.expires_at is not null
  and least(o.payment_expires_at, ps.expires_at, cps.expires_at) < transaction_timestamp()
  and not exists (
    select 1
    from public.bep20_underpayment_dispositions bud
    where bud.chain_session_id = cps.id
  );

create unique index on bep20_underpayment_confirmation_candidates(session_id);

create temporary table bep20_underpayment_confirmation_rpc_snapshot
on commit drop
as
select
  p.oid,
  p.oid::regprocedure::text as signature,
  p.proowner,
  p.proacl,
  p.prosecdef,
  p.proconfig,
  md5(p.prosrc) as source_hash
from pg_catalog.pg_proc p
where p.oid in (
  'public.list_expirable_bep20_underpayments(integer)'::regprocedure,
  'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)'::regprocedure
);

update public.chain_payment_sessions cps
set confirmed_at = candidate.confirmation_time
from bep20_underpayment_confirmation_candidates candidate
where cps.id = candidate.session_id
  and cps.confirmed_at is null;

do $$
declare
  v_second_update_count integer;
begin
  if exists (
    select 1
    from bep20_underpayment_confirmation_candidates candidate
    join public.chain_payment_sessions cps on cps.id = candidate.session_id
    where cps.confirmed_at is distinct from candidate.confirmation_time
  ) then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_POSTCHECK_TIMESTAMP_MISMATCH';
  end if;

  if exists (
    select 1
    from bep20_underpayment_confirmation_candidates candidate
    join public.chain_payment_sessions cps on cps.id = candidate.session_id
    join public.orders o on o.id = cps.order_id
    join public.payment_sessions ps on ps.id = cps.payment_session_id
    where cps.status <> 'underpaid'
       or cps.confirmed_at is null
       or cps.confirmed_raw_amount <= 0
       or cps.confirmed_raw_amount >= cps.expected_raw_amount
       or cps.confirmed_amount <= 0
       or cps.confirmed_amount >= cps.expected_amount
       or o.payment_expires_at is null
       or ps.expires_at is null
       or cps.expires_at is null
       or least(o.payment_expires_at, ps.expires_at, cps.expires_at) >= transaction_timestamp()
       or not exists (
         select 1
         from public.chain_transactions ct
         where ct.chain_payment_session_id = cps.id
           and ct.order_id = cps.order_id
           and ct.chain_id = 56
           and lower(ct.tx_hash) = lower(cps.submitted_tx_hash)
           and ct.status = 'underpaid'
           and ct.raw_amount is not distinct from cps.confirmed_raw_amount
           and ct.normalized_amount is not distinct from cps.confirmed_amount
           and ct.confirmation_count >= 12
           and ct.block_timestamp is not null
           and ct.created_at is not null
           and ct.block_timestamp <= least(o.payment_expires_at, ps.expires_at, cps.expires_at)
       )
  ) then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_POSTCHECK_UNSAFE_BACKFILL';
  end if;

  if exists (
    select 1
    from bep20_underpayment_confirmation_rpc_snapshot before_state
    left join pg_catalog.pg_proc p on p.oid = before_state.oid
    where p.oid is null
       or p.proowner is distinct from before_state.proowner
       or p.proacl is distinct from before_state.proacl
       or p.prosecdef is distinct from before_state.prosecdef
       or p.proconfig is distinct from before_state.proconfig
       or md5(p.prosrc) is distinct from before_state.source_hash
  ) then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_POSTCHECK_RPC_CONTRACT_CHANGED';
  end if;

  update public.chain_payment_sessions cps
  set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_candidates candidate
  where cps.id = candidate.session_id
    and cps.confirmed_at is null;
  get diagnostics v_second_update_count = row_count;

  if v_second_update_count <> 0 then
    raise exception 'BEP20_UNDERPAYMENT_CONFIRMATION_POSTCHECK_NOT_IDEMPOTENT';
  end if;
end;
$$;

commit;

-- Rollback guidance: confirmed_at is financial evidence and must not be cleared
-- blindly after deployment. Identify the exact rows changed by an approved audit,
-- preserve their evidence timestamps, and reverse only with explicit authorization.
