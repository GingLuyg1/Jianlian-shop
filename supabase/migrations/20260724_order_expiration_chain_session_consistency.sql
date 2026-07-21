-- Keep unpaid-order expiration, inventory release, payment sessions and idle
-- BEP20 chain sessions consistent in one atomic RPC call.

begin;

do $$
declare
  v_missing text[];
  v_status_constraint text;
begin
  select array_agg(v.object_name order by v.object_name)
    into v_missing
  from (
    values
      ('public.orders'),
      ('public.payment_sessions'),
      ('public.chain_payment_sessions'),
      ('public.order_status_logs')
  ) as v(object_name)
  where to_regclass(v.object_name) is null;

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'ORDER_EXPIRATION_CHAIN_PREFLIGHT_TABLES_MISSING: %', v_missing;
  end if;

  if to_regprocedure('public.release_order_inventory(uuid,text)') is null then
    raise exception 'ORDER_EXPIRATION_CHAIN_PREFLIGHT_RELEASE_RPC_MISSING';
  end if;

  if to_regprocedure('public.expire_unpaid_order(uuid,text)') is null then
    raise exception 'ORDER_EXPIRATION_CHAIN_PREFLIGHT_EXPIRE_RPC_MISSING';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid)
    into v_status_constraint
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.chain_payment_sessions'::regclass
    and c.conname = 'chain_payment_sessions_status_check'
    and c.contype = 'c';

  if v_status_constraint is null or position('expired' in lower(v_status_constraint)) = 0 then
    raise exception 'ORDER_EXPIRATION_CHAIN_PREFLIGHT_EXPIRED_STATUS_UNSUPPORTED';
  end if;

  select array_agg(v.column_name order by v.column_name)
    into v_missing
  from (
    values
      ('order_id'),
      ('status'),
      ('submitted_tx_hash'),
      ('failure_reason'),
      ('manual_review_reason'),
      ('completion_error'),
      ('last_checked_at'),
      ('updated_at')
  ) as v(column_name)
  where not exists (
    select 1
    from information_schema.columns as col
    where col.table_schema = 'public'
      and col.table_name = 'chain_payment_sessions'
      and col.column_name = v.column_name
  );

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'ORDER_EXPIRATION_CHAIN_PREFLIGHT_COLUMNS_MISSING: %', v_missing;
  end if;
end;
$$;

create or replace function public.expire_unpaid_order(
  p_order_id uuid,
  p_reason text default 'payment_timeout'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_release jsonb;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(btrim(p_reason), ''), 'payment_timeout');
  v_expired_chain_sessions integer := 0;
begin
  select o.*
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_order.payment_status = 'paid'
     or v_order.status in ('paid', 'processing', 'delivered', 'completed', 'refunded') then
    return jsonb_build_object(
      'ok', true,
      'code', 'SKIPPED_PAID_OR_FINAL',
      'order_id', p_order_id,
      'status', v_order.status,
      'payment_status', v_order.payment_status
    );
  end if;

  if v_order.status = 'expired' then
    update public.chain_payment_sessions as cps
       set status = 'expired',
           failure_reason = case
             when nullif(btrim(coalesce(cps.failure_reason, '')), '') is null
               then 'order_payment_expired'
             else cps.failure_reason
           end,
           updated_at = v_now
     where cps.order_id = p_order_id
       and cps.status = 'waiting_payment'
       and nullif(btrim(coalesce(cps.submitted_tx_hash, '')), '') is null;
    get diagnostics v_expired_chain_sessions = row_count;

    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_EXPIRED',
      'order_id', p_order_id,
      'released', v_order.reservation_released_at is not null,
      'expired_chain_sessions', v_expired_chain_sessions
    );
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CANCELLED',
      'order_id', p_order_id,
      'released', v_order.reservation_released_at is not null
    );
  end if;

  if coalesce(v_order.payment_expires_at, v_order.created_at + interval '30 minutes') > v_now then
    return jsonb_build_object(
      'ok', true,
      'code', 'NOT_DUE',
      'order_id', p_order_id,
      'expires_at', coalesce(v_order.payment_expires_at, v_order.created_at + interval '30 minutes')
    );
  end if;

  if exists (
    select 1
    from public.payment_sessions as ps
    where ps.business_type = 'order'
      and ps.business_id = p_order_id
      and ps.status = 'paid'
  ) then
    return jsonb_build_object('ok', true, 'code', 'SKIPPED_SESSION_PAID', 'order_id', p_order_id);
  end if;

  update public.payment_sessions as ps
     set status = case when ps.status in ('pending', 'processing') then 'expired' else ps.status end,
         closed_at = coalesce(ps.closed_at, v_now),
         updated_at = v_now
   where ps.business_type = 'order'
     and ps.business_id = p_order_id
     and ps.status in ('pending', 'processing', 'failed');

  update public.chain_payment_sessions as cps
     set status = 'expired',
         failure_reason = case
           when nullif(btrim(coalesce(cps.failure_reason, '')), '') is null
             then 'order_payment_expired'
           else cps.failure_reason
         end,
         updated_at = v_now
   where cps.order_id = p_order_id
     and cps.status = 'waiting_payment'
     and nullif(btrim(coalesce(cps.submitted_tx_hash, '')), '') is null;
  get diagnostics v_expired_chain_sessions = row_count;

  v_release := public.release_order_inventory(p_order_id, 'expired:' || v_note);

  update public.orders as o
     set status = 'expired',
         payment_status = case when o.payment_status = 'unpaid' then 'failed' else o.payment_status end,
         expired_at = coalesce(o.expired_at, v_now),
         updated_at = v_now
   where o.id = p_order_id
     and o.payment_status <> 'paid'
     and o.status = 'pending_payment'
   returning o.* into v_order;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'STATE_CHANGED', 'order_id', p_order_id);
  end if;

  insert into public.order_status_logs(
    order_id,
    from_status,
    to_status,
    operator_id,
    operator_type,
    note
  )
  values (
    p_order_id,
    'pending_payment',
    'expired',
    null,
    'system',
    'unpaid order expired: ' || left(v_note, 160)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'EXPIRED',
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'release', v_release,
    'expired_chain_sessions', v_expired_chain_sessions,
    'status', v_order.status,
    'payment_status', v_order.payment_status
  );
end;
$$;

revoke execute on function public.expire_unpaid_order(uuid, text) from public, anon, authenticated;
grant execute on function public.expire_unpaid_order(uuid, text) to service_role;

do $$
declare
  v_definition text;
  v_status_constraint text;
begin
  select pg_catalog.pg_get_functiondef(p.oid)
    into v_definition
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'expire_unpaid_order'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_reason text';

  if v_definition is null
     or position('cps.status = ''waiting_payment''' in v_definition) = 0
     or position('cps.submitted_tx_hash' in v_definition) = 0
     or position('order_payment_expired' in v_definition) = 0
     or position('expired_chain_sessions' in v_definition) = 0 then
    raise exception 'ORDER_EXPIRATION_CHAIN_POSTCHECK_DEFINITION_FAILED';
  end if;

  if has_function_privilege('anon', 'public.expire_unpaid_order(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.expire_unpaid_order(uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.expire_unpaid_order(uuid,text)', 'EXECUTE') then
    raise exception 'ORDER_EXPIRATION_CHAIN_POSTCHECK_PRIVILEGES_FAILED';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid)
    into v_status_constraint
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.chain_payment_sessions'::regclass
    and c.conname = 'chain_payment_sessions_status_check'
    and c.contype = 'c';

  if v_status_constraint is null or position('expired' in lower(v_status_constraint)) = 0 then
    raise exception 'ORDER_EXPIRATION_CHAIN_POSTCHECK_EXPIRED_STATUS_UNSUPPORTED';
  end if;
end;
$$;

commit;

-- Manual rollback/degradation guidance:
-- Reapply the previously deployed definition of public.expire_unpaid_order(uuid,text).
-- Do not revert already-expired orders or restore released inventory automatically.
