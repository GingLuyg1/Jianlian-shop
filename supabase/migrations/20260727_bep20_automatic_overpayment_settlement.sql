-- Atomically complete an in-window BEP20 overpayment and credit its CNY excess.
--
-- This migration reuses the existing profiles.balance, balance_transactions and
-- bep20_overpayment_dispositions ledger contract. It does not credit historical
-- payments and it does not change the manual-review path.

begin;

do $$
declare
  v_missing text;
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.chain_transactions') is null
     or to_regclass('public.chain_transaction_claims') is null
     or to_regclass('public.payment_sessions') is null
     or to_regclass('public.order_payments') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null
     or to_regclass('public.bep20_overpayment_dispositions') is null
     or to_regclass('public.account_recharges') is null
     or to_regclass('public.site_settings') is null
     or to_regclass('public.site_setting_logs') is null
     or to_regclass('public.admin_audit_logs') is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_TABLES_MISSING';
  end if;

  if to_regprocedure('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_COMPLETE_PAYMENT_MISSING';
  end if;
  if to_regprocedure('public.is_super_admin(uuid)') is null
     or to_regprocedure('public.credit_bep20_overpayment_to_wallet(uuid,text,text)') is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_MANUAL_CREDIT_CONTRACT_MISSING';
  end if;

  select string_agg(required.object_name, ', ' order by required.object_name)
  into v_missing
  from (
    values
      ('chain_payment_sessions.id'),
      ('chain_payment_sessions.order_id'),
      ('chain_payment_sessions.payment_session_id'),
      ('chain_payment_sessions.payment_id'),
      ('chain_payment_sessions.status'),
      ('chain_payment_sessions.network'),
      ('chain_payment_sessions.chain_id'),
      ('chain_payment_sessions.asset'),
      ('chain_payment_sessions.token_contract'),
      ('chain_payment_sessions.token_decimals'),
      ('chain_payment_sessions.receive_address'),
      ('chain_payment_sessions.expected_amount'),
      ('chain_payment_sessions.expected_raw_amount'),
      ('chain_payment_sessions.confirmed_amount'),
      ('chain_payment_sessions.confirmed_raw_amount'),
      ('chain_payment_sessions.confirmed_at'),
      ('chain_payment_sessions.exchange_rate'),
      ('chain_payment_sessions.order_currency'),
      ('chain_payment_sessions.payment_currency'),
      ('chain_payment_sessions.expires_at'),
      ('chain_payment_sessions.submitted_tx_hash'),
      ('chain_payment_sessions.manual_review_decision'),
      ('chain_payment_sessions.manual_review_reason'),
      ('chain_payment_sessions.failure_reason'),
      ('chain_payment_sessions.last_checked_at'),
      ('chain_payment_sessions.completion_attempt_id'),
      ('chain_payment_sessions.completion_started_at'),
      ('chain_payment_sessions.completion_error'),
      ('chain_payment_sessions.updated_at'),
      ('chain_transactions.id'),
      ('chain_transactions.chain_payment_session_id'),
      ('chain_transactions.order_id'),
      ('chain_transactions.chain_id'),
      ('chain_transactions.tx_hash'),
      ('chain_transactions.log_index'),
      ('chain_transactions.block_timestamp'),
      ('chain_transactions.token_contract'),
      ('chain_transactions.to_address'),
      ('chain_transactions.raw_amount'),
      ('chain_transactions.normalized_amount'),
      ('chain_transactions.confirmation_count'),
      ('chain_transactions.status'),
      ('chain_transactions.updated_at'),
      ('chain_transaction_claims.chain_payment_session_id'),
      ('chain_transaction_claims.order_id'),
      ('chain_transaction_claims.chain_id'),
      ('chain_transaction_claims.tx_hash'),
      ('payment_sessions.business_type'),
      ('payment_sessions.business_id'),
      ('payment_sessions.business_no'),
      ('payment_sessions.user_id'),
      ('payment_sessions.payable_amount'),
      ('payment_sessions.currency'),
      ('payment_sessions.expires_at'),
      ('payment_sessions.status'),
      ('payment_sessions.closed_at'),
      ('payment_sessions.metadata'),
      ('payment_sessions.updated_at'),
      ('order_payments.id'),
      ('order_payments.order_id'),
      ('order_payments.payment_session_id'),
      ('order_payments.user_id'),
      ('order_payments.status'),
      ('order_payments.payable_amount'),
      ('order_payments.received_amount'),
      ('orders.id'),
      ('orders.order_no'),
      ('orders.user_id'),
      ('orders.status'),
      ('orders.payment_status'),
      ('orders.payment_expires_at'),
      ('orders.cancelled_at'),
      ('profiles.id'),
      ('profiles.display_name'),
      ('profiles.phone'),
      ('profiles.recipient_name'),
      ('profiles.shipping_address'),
      ('profiles.avatar_url'),
      ('profiles.balance'),
      ('profiles.updated_at'),
      ('balance_transactions.id'),
      ('balance_transactions.user_id'),
      ('balance_transactions.transaction_no'),
      ('balance_transactions.business_type'),
      ('balance_transactions.business_id'),
      ('balance_transactions.direction'),
      ('balance_transactions.amount'),
      ('balance_transactions.balance_before'),
      ('balance_transactions.balance_after'),
      ('balance_transactions.currency'),
      ('balance_transactions.status'),
      ('balance_transactions.remark'),
      ('balance_transactions.metadata'),
      ('account_recharges.status'),
      ('account_recharges.provider_trade_no'),
      ('site_settings.setting_key'),
      ('site_settings.setting_value'),
      ('site_settings.setting_type'),
      ('site_settings.setting_group'),
      ('site_settings.is_public'),
      ('site_settings.updated_by'),
      ('site_setting_logs.setting_key'),
      ('site_setting_logs.old_value'),
      ('site_setting_logs.new_value'),
      ('site_setting_logs.updated_by'),
      ('bep20_overpayment_dispositions.chain_session_id'),
      ('bep20_overpayment_dispositions.order_id'),
      ('bep20_overpayment_dispositions.user_id'),
      ('bep20_overpayment_dispositions.payment_id'),
      ('bep20_overpayment_dispositions.balance_transaction_id'),
      ('bep20_overpayment_dispositions.overpaid_usdt'),
      ('bep20_overpayment_dispositions.exchange_rate'),
      ('bep20_overpayment_dispositions.credited_cny'),
      ('bep20_overpayment_dispositions.disposition'),
      ('bep20_overpayment_dispositions.processed_by'),
      ('bep20_overpayment_dispositions.processed_at'),
      ('bep20_overpayment_dispositions.reason'),
      ('bep20_overpayment_dispositions.request_id'),
      ('admin_audit_logs.admin_user_id'),
      ('admin_audit_logs.action'),
      ('admin_audit_logs.module'),
      ('admin_audit_logs.target_type'),
      ('admin_audit_logs.target_id'),
      ('admin_audit_logs.request_id'),
      ('admin_audit_logs.result'),
      ('admin_audit_logs.before_summary'),
      ('admin_audit_logs.after_summary'),
      ('admin_audit_logs.metadata')
  ) as required(object_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(required.object_name, '.', 1)
      and c.column_name = split_part(required.object_name, '.', 2)
  );

  if v_missing is not null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_COLUMNS_MISSING: %', v_missing;
  end if;

  if to_regprocedure('public.cancel_unpaid_order(uuid,text)') is null
     or to_regprocedure('public.release_order_inventory(uuid,text)') is null
     or to_regprocedure('public.is_admin(uuid)') is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_ORDER_CANCEL_CONTRACT_MISSING';
  end if;

  -- transaction_reference is part of the recharge-review application contract
  -- (20260704), but production environments that missed that compatibility
  -- migration may not have it yet. This migration adds it below. If it is
  -- already present, fail before mutation unless its nullable text contract is
  -- compatible.
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'account_recharges'
      and c.column_name = 'transaction_reference'
      and (
        c.data_type <> 'text'
        or c.is_nullable <> 'YES'
        or c.column_default is not null
      )
  ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_RECHARGE_REFERENCE_INCOMPATIBLE';
  end if;

  -- settlement_source is created by this migration. A missing column is the
  -- expected pre-migration state; an existing but incompatible column is a
  -- blocker because ADD COLUMN IF NOT EXISTS must not conceal schema drift.
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'bep20_overpayment_dispositions'
      and c.column_name = 'settlement_source'
      and (
        c.data_type <> 'text'
        or c.is_nullable <> 'NO'
        or coalesce(c.column_default, '') not ilike '%manual_admin%'
      )
  ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_SETTLEMENT_SOURCE_INCOMPATIBLE';
  end if;
  if exists (
       select 1
       from pg_constraint c
       where c.conrelid = 'public.bep20_overpayment_dispositions'::regclass
         and c.conname = 'bep20_overpayment_settlement_source_check'
     )
     and not exists (
       select 1
       from pg_constraint c
       where c.conrelid = 'public.bep20_overpayment_dispositions'::regclass
         and c.conname = 'bep20_overpayment_settlement_source_check'
         and pg_get_constraintdef(c.oid) ilike '%manual_admin%'
         and pg_get_constraintdef(c.oid) ilike '%automatic_service%'
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_SETTLEMENT_SOURCE_CONSTRAINT_INCOMPATIBLE';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'balance'
      and c.data_type = 'numeric'
      and c.numeric_precision = 12
      and c.numeric_scale = 2
  ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_BALANCE_TYPE_INCOMPATIBLE';
  end if;

  if exists (
    select 1
    from public.chain_transaction_claims ctc
    join public.account_recharges ar
      on ar.status in ('paid', 'succeeded')
     and (
       regexp_replace(lower(nullif(btrim(ar.provider_trade_no), '')), ':[0-9]+$', '') = lower(ctc.tx_hash)
       or regexp_replace(
         lower(nullif(btrim(to_jsonb(ar) ->> 'transaction_reference'), '')),
         ':[0-9]+$',
         ''
       ) = lower(ctc.tx_hash)
     )
  ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_CROSS_BUSINESS_TX_CONFLICT';
  end if;

  if not exists (
       select 1 from pg_constraint c
       where c.conrelid = 'public.chain_payment_sessions'::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ilike '%overpaid%'
         and pg_get_constraintdef(c.oid) ilike '%paid%'
     )
     or not exists (
       select 1 from pg_constraint c
       where c.conrelid = 'public.payment_sessions'::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ilike '%paid%'
     )
     or not exists (
       select 1 from pg_constraint c
       where c.conrelid = 'public.orders'::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ilike '%paid%'
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_STATUS_CONSTRAINTS_INCOMPATIBLE';
  end if;

  if not exists (
       select 1 from pg_indexes i
       where i.schemaname = 'public'
         and i.tablename = 'balance_transactions'
         and i.indexdef ilike 'create unique index%business_type%business_id%'
     )
     or not exists (
       select 1 from pg_indexes i
       where i.schemaname = 'public'
         and i.tablename = 'bep20_overpayment_dispositions'
         and i.indexdef ilike 'create unique index%payment_id%'
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_IDEMPOTENCY_INDEXES_MISSING';
  end if;
end;
$$;

-- Harden two pre-existing authenticated write paths before creating any of the
-- financial settlement functions below. The legacy state is expected on the
-- first deployment, so precheck reports it without aborting; the final
-- postcheck is strict and rolls the whole transaction back if any broad write
-- path remains.
do $$
declare
  v_profile_table_update boolean := has_table_privilege('authenticated', 'public.profiles', 'UPDATE');
  v_order_table_update boolean := has_table_privilege('authenticated', 'public.orders', 'UPDATE');
  v_legacy_profile_policy_count integer;
  v_direct_order_policy_count integer;
begin
  select count(*) into v_legacy_profile_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'profiles'
    and p.policyname in (
      'Users can update own profile',
      'Users can update own non-role profile'
    );

  select count(*) into v_direct_order_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'orders'
    and p.policyname = 'users can cancel own pending orders';

  raise notice
    'BEP20_AUTOMATIC_OVERPAYMENT_PREFLIGHT_WRITE_HARDENING: profiles_table_update=%, legacy_profile_policies=%, orders_table_update=%, direct_order_cancel_policies=%',
    v_profile_table_update,
    v_legacy_profile_policy_count,
    v_order_table_update,
    v_direct_order_policy_count;
end;
$$;

alter table public.profiles enable row level security;

revoke update on table public.profiles from public, anon, authenticated;

do $$
declare
  v_columns text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_columns is not null then
    execute format(
      'revoke update (%s) on table public.profiles from public, anon, authenticated',
      v_columns
    );
  end if;
end;
$$;

grant update (display_name, phone, recipient_name, shipping_address, avatar_url)
  on table public.profiles to authenticated;

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own non-role profile" on public.profiles;
drop policy if exists "Users can update own safe profile fields" on public.profiles;
create policy "Users can update own safe profile fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or public.is_super_admin(auth.uid()) then
    return new;
  end if;

  -- Compare every deployed or future column except the five user-editable
  -- profile fields. This is NULL-safe and prevents a later broad grant from
  -- exposing financial, authorization, referral, risk or audit columns.
  if (
    to_jsonb(new) - array[
      'display_name',
      'phone',
      'recipient_name',
      'shipping_address',
      'avatar_url'
    ]::text[]
  ) is distinct from (
    to_jsonb(old) - array[
      'display_name',
      'phone',
      'recipient_name',
      'shipping_address',
      'avatar_url'
    ]::text[]
  ) then
    raise exception 'PROFILE_SENSITIVE_FIELD_UPDATE_DENIED';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_sensitive_fields()
  from public, anon, authenticated, service_role;

drop trigger if exists profiles_protect_sensitive_fields on public.profiles;
create trigger profiles_protect_sensitive_fields
before update on public.profiles
for each row execute function public.protect_profile_sensitive_fields();

alter table public.orders enable row level security;

revoke update on table public.orders from public, anon, authenticated;

do $$
declare
  v_columns text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.orders'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_columns is not null then
    execute format(
      'revoke update (%s) on table public.orders from public, anon, authenticated',
      v_columns
    );
  end if;
end;
$$;

drop policy if exists "users can cancel own pending orders" on public.orders;

create or replace function public.cancel_unpaid_order(
  p_order_id uuid,
  p_reason text default 'user_cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_is_admin boolean := false;
  v_order public.orders;
  v_release jsonb;
  v_now timestamptz := now();
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'user_cancelled');
begin
  v_is_admin := coalesce(public.is_admin(v_user_id), false);

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_user_id is null and not v_is_admin and not v_is_service_role then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'please sign in first');
  end if;

  if not v_is_admin and not v_is_service_role and v_order.user_id <> v_user_id then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CANCELLED',
      'order_id', p_order_id,
      'order_no', v_order.order_no
    );
  end if;

  if v_order.status <> 'pending_payment'
     or v_order.payment_status <> 'unpaid' then
    return jsonb_build_object(
      'ok', false,
      'code', 'ORDER_NOT_CANCELLABLE',
      'message', 'only unpaid pending payment orders can be cancelled'
    );
  end if;

  if exists (
       select 1
       from public.payment_sessions ps
       where ps.business_type = 'order'
         and ps.business_id = p_order_id
         and ps.status = 'paid'
     )
     or exists (
       select 1
       from public.chain_payment_sessions cps
       where cps.order_id = p_order_id
         and (
           cps.submitted_tx_hash is not null
           or cps.manual_review_decision is not null
           or cps.status not in ('waiting_payment', 'expired', 'failed')
         )
     )
     or exists (
       select 1
       from public.chain_transaction_claims ctc
       where ctc.order_id = p_order_id
     )
     or exists (
       select 1
       from public.chain_transactions ct
       where ct.order_id = p_order_id
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'PAYMENT_ACTIVITY_PRESENT',
      'message', 'payment activity exists; this order cannot be cancelled automatically'
    );
  end if;

  v_release := public.release_order_inventory(p_order_id, 'cancel:' || left(v_reason, 120));

  update public.payment_sessions ps
     set status = 'closed',
         closed_at = coalesce(ps.closed_at, v_now),
         updated_at = v_now
   where ps.business_type = 'order'
     and ps.business_id = p_order_id
     and ps.status in ('pending', 'processing', 'failed');

  update public.chain_payment_sessions cps
     set status = 'expired',
         failure_reason = coalesce(cps.failure_reason, 'order_cancelled'),
         updated_at = v_now
   where cps.order_id = p_order_id
     and cps.status = 'waiting_payment'
     and cps.submitted_tx_hash is null;

  update public.orders o
     set status = 'cancelled',
         cancelled_at = coalesce(o.cancelled_at, v_now),
         updated_at = v_now
   where o.id = p_order_id
     and o.status = 'pending_payment'
     and o.payment_status = 'unpaid'
   returning o.* into v_order;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'STATE_CHANGED', 'order_id', p_order_id);
  end if;

  insert into public.order_status_logs(
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    p_order_id,
    'pending_payment',
    'cancelled',
    v_user_id,
    case when v_is_service_role then 'service' when v_is_admin then 'admin' else 'user' end,
    'cancelled order: ' || left(v_reason, 160)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'CANCELLED',
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'release', v_release
  );
end;
$$;

revoke all on function public.cancel_unpaid_order(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_unpaid_order(uuid, text)
  to authenticated, service_role;

-- 20260704 established transaction_reference as the user-submitted recharge
-- proof reference. Some production environments missed that compatibility
-- migration. Add the nullable text field without a default and without
-- fabricating historical values. Existing compatible environments are left
-- unchanged.
alter table public.account_recharges
  add column if not exists transaction_reference text;

comment on column public.account_recharges.transaction_reference is
  'Optional user-submitted recharge transaction reference; no historical value is inferred.';

alter table public.bep20_overpayment_dispositions
  alter column processed_by drop not null,
  add column if not exists settlement_source text not null default 'manual_admin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bep20_overpayment_dispositions'::regclass
      and conname = 'bep20_overpayment_settlement_source_check'
  ) then
    alter table public.bep20_overpayment_dispositions
      add constraint bep20_overpayment_settlement_source_check
      check (settlement_source in ('manual_admin', 'automatic_service'));
  end if;
end;
$$;

-- Reuse the existing private site-settings registry. The migration deliberately
-- creates null placeholders rather than silently choosing a financial risk
-- appetite. Automatic overpayment settlement stays fail-closed until an active
-- super administrator explicitly configures both values through the protected
-- service-role RPC below.
insert into public.site_settings (
  setting_key, setting_value, setting_type, setting_group, is_public, description
)
values
  (
    'max_auto_overpayment_usdt',
    'null'::jsonb,
    'number',
    'security',
    false,
    'BEP20 自动超额结算允许的最大超额 USDT；未配置时转人工审核'
  ),
  (
    'max_auto_overpayment_ratio',
    'null'::jsonb,
    'number',
    'security',
    false,
    'BEP20 自动超额结算允许的最大超额比例；未配置时转人工审核'
  )
on conflict (setting_key) do nothing;

alter table public.site_settings enable row level security;

create or replace function public.protect_bep20_overpayment_risk_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting_key text;
begin
  v_setting_key := case when tg_op = 'DELETE' then old.setting_key else new.setting_key end;
  if v_setting_key in ('max_auto_overpayment_usdt', 'max_auto_overpayment_ratio')
     and coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'BEP20_OVERPAYMENT_RISK_SETTINGS_SERVICE_ROLE_REQUIRED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_bep20_overpayment_risk_settings()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_protect_bep20_overpayment_risk_settings
  on public.site_settings;
create trigger trg_protect_bep20_overpayment_risk_settings
before insert or update or delete
on public.site_settings
for each row execute function public.protect_bep20_overpayment_risk_settings();

create or replace function public.configure_bep20_automatic_overpayment_limits(
  p_max_auto_overpayment_usdt numeric,
  p_max_auto_overpayment_ratio numeric,
  p_operator_user_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_usdt jsonb;
  v_old_ratio jsonb;
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'BEP20_OVERPAYMENT_RISK_SETTINGS_SERVICE_ROLE_REQUIRED';
  end if;
  if p_operator_user_id is null or not public.is_super_admin(p_operator_user_id) then
    raise exception 'BEP20_OVERPAYMENT_RISK_SETTINGS_SUPER_ADMIN_REQUIRED';
  end if;
  if p_max_auto_overpayment_usdt is null
     or p_max_auto_overpayment_usdt <= 0
     or p_max_auto_overpayment_ratio is null
     or p_max_auto_overpayment_ratio <= 0 then
    raise exception 'BEP20_OVERPAYMENT_RISK_SETTINGS_INVALID';
  end if;

  select ss.setting_value into v_old_usdt
  from public.site_settings ss
  where ss.setting_key = 'max_auto_overpayment_usdt'
  for update;
  select ss.setting_value into v_old_ratio
  from public.site_settings ss
  where ss.setting_key = 'max_auto_overpayment_ratio'
  for update;

  update public.site_settings ss
  set setting_value = jsonb_build_object('value', p_max_auto_overpayment_usdt),
      setting_type = 'number',
      setting_group = 'security',
      is_public = false,
      updated_by = p_operator_user_id
  where ss.setting_key = 'max_auto_overpayment_usdt';
  if not found then
    raise exception 'BEP20_OVERPAYMENT_RISK_SETTINGS_MISSING';
  end if;

  update public.site_settings ss
  set setting_value = jsonb_build_object('value', p_max_auto_overpayment_ratio),
      setting_type = 'number',
      setting_group = 'security',
      is_public = false,
      updated_by = p_operator_user_id
  where ss.setting_key = 'max_auto_overpayment_ratio';
  if not found then
    raise exception 'BEP20_OVERPAYMENT_RISK_SETTINGS_MISSING';
  end if;

  insert into public.site_setting_logs (
    setting_key, old_value, new_value, updated_by
  ) values
    (
      'max_auto_overpayment_usdt',
      v_old_usdt,
      jsonb_build_object('value', p_max_auto_overpayment_usdt),
      p_operator_user_id
    ),
    (
      'max_auto_overpayment_ratio',
      v_old_ratio,
      jsonb_build_object('value', p_max_auto_overpayment_ratio),
      p_operator_user_id
    );

  insert into public.admin_audit_logs (
    admin_user_id, action, module, target_type, target_id, request_id, result,
    before_summary, after_summary, metadata
  ) values (
    p_operator_user_id,
    'configure_bep20_automatic_overpayment_limits',
    'payments',
    'site_settings',
    'bep20_automatic_overpayment_limits',
    v_request_id,
    'success',
    jsonb_build_object('max_usdt', v_old_usdt, 'max_ratio', v_old_ratio),
    jsonb_build_object(
      'max_usdt', p_max_auto_overpayment_usdt,
      'max_ratio', p_max_auto_overpayment_ratio
    ),
    jsonb_build_object('source', 'service_role_super_admin')
  );

  return jsonb_build_object(
    'result', 'configured',
    'max_auto_overpayment_usdt', p_max_auto_overpayment_usdt,
    'max_auto_overpayment_ratio', p_max_auto_overpayment_ratio
  );
end;
$$;

revoke all on function public.configure_bep20_automatic_overpayment_limits(numeric,numeric,uuid,text)
  from public, anon, authenticated;
grant execute on function public.configure_bep20_automatic_overpayment_limits(numeric,numeric,uuid,text)
  to service_role;

-- Enforce one BEP20 TxHash across completed account recharges and order-chain
-- claims. Only completed recharge references participate, so an unverified
-- user-supplied proof cannot reserve an arbitrary transaction hash.
create or replace function public.enforce_bep20_txhash_business_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_hash text;
  v_provider_hash text;
  v_reference_hash text;
  v_lock_hash text;
begin
  if tg_table_name = 'chain_transaction_claims' then
    v_tx_hash := lower(btrim(new.tx_hash));
    -- Serialize both order claims and completed recharges on the normalized
    -- transaction hash. A trigger-only existence check is otherwise racy when
    -- the two tables are written concurrently.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('bep20-business-tx:' || v_tx_hash, 0)
    );
    if exists (
      select 1
      from public.account_recharges ar
      where ar.status in ('paid', 'succeeded')
        and (
          regexp_replace(lower(nullif(btrim(ar.provider_trade_no), '')), ':[0-9]+$', '') = v_tx_hash
          or regexp_replace(lower(nullif(btrim(ar.transaction_reference), '')), ':[0-9]+$', '') = v_tx_hash
        )
    ) then
      raise exception 'BEP20_TX_HASH_ALREADY_USED_BY_RECHARGE';
    end if;
    return new;
  end if;

  if new.status not in ('paid', 'succeeded') then
    return new;
  end if;

  v_provider_hash := regexp_replace(
    lower(nullif(btrim(new.provider_trade_no), '')),
    ':[0-9]+$',
    ''
  );
  v_reference_hash := regexp_replace(
    lower(nullif(btrim(new.transaction_reference), '')),
    ':[0-9]+$',
    ''
  );

  -- Lock every valid candidate in deterministic order. Both legacy recharge
  -- reference columns are authoritative inputs, so neither may mask the other.
  for v_lock_hash in
    select distinct candidate
    from unnest(array[v_provider_hash, v_reference_hash]) as candidate
    where candidate ~ '^0x[0-9a-f]{64}$'
    order by candidate
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('bep20-business-tx:' || v_lock_hash, 0)
    );
  end loop;

  if exists (
    select 1
    from public.chain_transaction_claims ctc
    where ctc.chain_id = 56
      and lower(ctc.tx_hash) in (v_provider_hash, v_reference_hash)
  ) then
    raise exception 'BEP20_TX_HASH_ALREADY_USED_BY_ORDER';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_bep20_txhash_business_uniqueness()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_chain_claim_reject_completed_recharge_tx
  on public.chain_transaction_claims;
create trigger trg_chain_claim_reject_completed_recharge_tx
before insert or update of chain_id, tx_hash
on public.chain_transaction_claims
for each row execute function public.enforce_bep20_txhash_business_uniqueness();

drop trigger if exists trg_recharge_reject_claimed_bep20_tx
  on public.account_recharges;
create trigger trg_recharge_reject_claimed_bep20_tx
before insert or update of status, provider_trade_no, transaction_reference
on public.account_recharges
for each row execute function public.enforce_bep20_txhash_business_uniqueness();

-- Keep the established administrator workflow, but serialize it on the same
-- chain-session advisory lock used by automatic settlement. Existing automatic
-- dispositions therefore return idempotently instead of racing a second credit.
drop function if exists public.credit_bep20_overpayment_to_wallet(uuid,text,text);
create function public.credit_bep20_overpayment_to_wallet(
  p_payment_id uuid,
  p_reason text,
  p_request_id text,
  p_operator_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator_id uuid := p_operator_user_id;
  v_chain_id uuid;
  v_payment public.order_payments;
  v_chain public.chain_payment_sessions;
  v_order public.orders;
  v_profile public.profiles;
  v_existing public.bep20_overpayment_dispositions;
  v_balance_transaction public.balance_transactions;
  v_overpaid_usdt numeric(36, 18);
  v_credited_cny numeric(18, 2);
  v_balance_before numeric(18, 6);
  v_balance_after numeric(18, 6);
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
  v_transaction_no text;
  v_processed_at timestamptz := now();
  v_balance_max constant numeric(12, 2) := 9999999999.99;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'BEP20_OVERPAYMENT_SERVICE_ROLE_REQUIRED';
  end if;
  if v_operator_id is null or not public.is_super_admin(v_operator_id) then
    raise exception 'BEP20_OVERPAYMENT_SUPER_ADMIN_REQUIRED';
  end if;
  if p_payment_id is null then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_REQUIRED';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'BEP20_OVERPAYMENT_REASON_REQUIRED';
  end if;

  select cps.id into v_chain_id
  from public.chain_payment_sessions cps
  where cps.payment_id = p_payment_id;
  if v_chain_id is null then
    raise exception 'BEP20_OVERPAYMENT_CHAIN_SESSION_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_chain_id::text, 0));

  select * into v_chain
  from public.chain_payment_sessions cps
  where cps.id = v_chain_id
  for update;

  select * into v_payment
  from public.order_payments op
  where op.id = p_payment_id
  for update;
  if not found then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_NOT_FOUND';
  end if;

  select * into v_existing
  from public.bep20_overpayment_dispositions bod
  where bod.chain_session_id = v_chain.id;
  if found then
    return jsonb_build_object(
      'result', 'already_processed',
      'chain_session_id', v_existing.chain_session_id,
      'order_id', v_existing.order_id,
      'overpaid_usdt', v_existing.overpaid_usdt,
      'exchange_rate', v_existing.exchange_rate,
      'credited_cny', v_existing.credited_cny,
      'processed_at', v_existing.processed_at,
      'settlement_source', v_existing.settlement_source
    );
  end if;

  select * into v_order
  from public.orders o
  where o.id = v_chain.order_id
  for update;

  if not found or v_payment.order_id <> v_order.id then
    raise exception 'BEP20_OVERPAYMENT_ORDER_LINK_INVALID';
  end if;
  if v_chain.status <> 'paid' or v_payment.status <> 'paid' or v_order.payment_status <> 'paid' then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_NOT_PAID';
  end if;
  if v_order.status not in ('paid', 'processing', 'delivered', 'completed') then
    raise exception 'BEP20_OVERPAYMENT_ORDER_STATUS_INVALID';
  end if;
  if v_chain.manual_review_decision <> 'approved' then
    raise exception 'BEP20_OVERPAYMENT_MANUAL_REVIEW_NOT_APPROVED';
  end if;
  if upper(coalesce(v_chain.payment_currency, '')) <> 'USDT'
     or upper(coalesce(v_chain.order_currency, '')) <> 'CNY'
     or v_chain.confirmed_amount is null
     or v_chain.expected_amount is null
     or v_chain.confirmed_amount <= v_chain.expected_amount
     or v_chain.exchange_rate is null
     or v_chain.exchange_rate <= 0 then
    raise exception 'BEP20_OVERPAYMENT_SNAPSHOT_INVALID';
  end if;
  if round(coalesce(v_payment.payable_amount, 0), 6) <> round(v_chain.expected_amount, 6)
     or round(coalesce(v_payment.received_amount, 0), 6) <> round(v_chain.confirmed_amount, 6) then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH';
  end if;

  v_overpaid_usdt := v_chain.confirmed_amount - v_chain.expected_amount;
  v_credited_cny := round(v_overpaid_usdt * v_chain.exchange_rate, 2);
  if v_credited_cny <= 0 then
    raise exception 'BEP20_OVERPAYMENT_CREDIT_ROUNDS_TO_ZERO';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_order.user_id
  for update;
  if not found then
    raise exception 'BEP20_OVERPAYMENT_PROFILE_NOT_FOUND';
  end if;

  v_balance_before := coalesce(v_profile.balance, 0);
  v_balance_after := v_balance_before + v_credited_cny;
  if v_balance_before < 0 or v_balance_after > v_balance_max then
    raise exception 'BEP20_OVERPAYMENT_BALANCE_OUT_OF_RANGE';
  end if;
  v_transaction_no := 'BT-BEP20-' || replace(v_chain.id::text, '-', '');

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    v_order.user_id, v_transaction_no, 'system', v_chain.id::text, 'credit',
    v_credited_cny, v_balance_before, v_balance_after, 'CNY', 'completed',
    'BEP20 超额支付按冻结汇率转入站内余额',
    jsonb_build_object(
      'subtype', 'bep20_overpayment_wallet_credit',
      'settlement_source', 'manual_admin',
      'chain_session_id', v_chain.id,
      'order_id', v_order.id,
      'payment_id', v_payment.id,
      'overpaid_usdt', v_overpaid_usdt,
      'exchange_rate', v_chain.exchange_rate
    )
  ) returning * into v_balance_transaction;

  update public.profiles p
  set balance = v_balance_after,
      updated_at = v_processed_at
  where p.id = v_order.user_id;

  insert into public.bep20_overpayment_dispositions (
    chain_session_id, order_id, user_id, payment_id, balance_transaction_id,
    overpaid_usdt, exchange_rate, credited_cny, disposition, processed_by,
    processed_at, reason, request_id, settlement_source
  ) values (
    v_chain.id, v_order.id, v_order.user_id, v_payment.id,
    v_balance_transaction.id, v_overpaid_usdt, v_chain.exchange_rate,
    v_credited_cny, 'wallet_credit', v_operator_id, v_processed_at,
    btrim(p_reason), v_request_id, 'manual_admin'
  );

  insert into public.admin_audit_logs (
    admin_user_id, action, module, target_type, target_id, request_id, result,
    before_summary, after_summary, metadata
  ) values (
    v_operator_id, 'credit_bep20_overpayment_to_wallet', 'payments',
    'chain_payment_session', v_chain.id::text, v_request_id, 'success',
    jsonb_build_object('balance', v_balance_before),
    jsonb_build_object('balance', v_balance_after, 'credited_cny', v_credited_cny),
    jsonb_build_object(
      'order_id', v_order.id,
      'payment_id', v_payment.id,
      'overpaid_usdt', v_overpaid_usdt,
      'exchange_rate', v_chain.exchange_rate,
      'reason', btrim(p_reason),
      'settlement_source', 'manual_admin'
    )
  );

  return jsonb_build_object(
    'result', 'credited',
    'chain_session_id', v_chain.id,
    'order_id', v_order.id,
    'overpaid_usdt', v_overpaid_usdt,
    'exchange_rate', v_chain.exchange_rate,
    'credited_cny', v_credited_cny,
    'processed_at', v_processed_at,
    'settlement_source', 'manual_admin'
  );
end;
$$;

revoke all on function public.credit_bep20_overpayment_to_wallet(uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.credit_bep20_overpayment_to_wallet(uuid,text,text,uuid)
  to service_role;

create or replace function public.settle_bep20_automatic_overpayment(
  p_session_id uuid,
  p_tx_hash text,
  p_required_confirmations integer,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_chain public.chain_payment_sessions;
  v_transaction public.chain_transactions;
  v_claim public.chain_transaction_claims;
  v_payment_session public.payment_sessions;
  v_order_payment public.order_payments;
  v_order public.orders;
  v_profile public.profiles;
  v_existing public.bep20_overpayment_dispositions;
  v_balance_transaction public.balance_transactions;
  v_completion jsonb;
  v_tx_hash text := lower(btrim(coalesce(p_tx_hash, '')));
  v_provider_transaction_id text;
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
  v_deadline timestamptz;
  v_confirmed_raw numeric(78, 0);
  v_expected_raw numeric(78, 0);
  v_excess_raw numeric(78, 0);
  v_power numeric;
  v_confirmed_usdt numeric(36, 18);
  v_excess_usdt numeric(36, 18);
  v_excess_ratio numeric(36, 18);
  v_max_auto_overpayment_usdt numeric(36, 18);
  v_max_auto_overpayment_ratio numeric(36, 18);
  v_credited_cny numeric(18, 2);
  v_balance_before numeric(18, 6);
  v_balance_after numeric(18, 6);
  v_transaction_no text;
  v_transaction_count integer;
  v_processed_at timestamptz := now();
  v_balance_max constant numeric(12, 2) := 9999999999.99;
begin
  if v_role <> 'service_role' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_SERVICE_ROLE_REQUIRED';
  end if;
  if p_session_id is null
     or v_tx_hash !~ '^0x[0-9a-f]{64}$'
     or p_required_confirmations is null
     or p_required_confirmations < 1
     or p_required_confirmations > 1000 then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_INPUT_INVALID';
  end if;

  -- Serialize the automatic and administrator credit paths before taking row
  -- locks, so both paths cannot deadlock while converging on one disposition.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  select * into v_chain
  from public.chain_payment_sessions cps
  where cps.id = p_session_id
  for update;

  if not found then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_SESSION_NOT_FOUND';
  end if;

  select * into v_existing
  from public.bep20_overpayment_dispositions bod
  where bod.chain_session_id = v_chain.id;

  if v_chain.submitted_tx_hash is not null and lower(v_chain.submitted_tx_hash) <> v_tx_hash then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_TX_HASH_MISMATCH';
  end if;

  if found then
    return jsonb_build_object(
      'result', 'already_settled',
      'idempotent', true,
      'businessType', 'order',
      'businessId', v_existing.order_id,
      'businessNo', (select o.order_no from public.orders o where o.id = v_existing.order_id),
      'chain_session_id', v_existing.chain_session_id,
      'overpaid_usdt', v_existing.overpaid_usdt,
      'exchange_rate', v_existing.exchange_rate,
      'credited_cny', v_existing.credited_cny,
      'processed_at', v_existing.processed_at,
      'settlement_source', v_existing.settlement_source
    );
  end if;

  if v_chain.status = 'paid' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PAID_WITHOUT_DISPOSITION';
  end if;
  if v_chain.status not in ('waiting_payment', 'submitted', 'confirming', 'verified', 'payment_failed', 'overpaid')
     or v_chain.manual_review_decision is not null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_STATE_INVALID';
  end if;
  if v_chain.payment_session_id is null or v_chain.payment_id is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_LINKAGE_MISSING';
  end if;
  if upper(coalesce(v_chain.network, '')) <> 'BEP20'
     or v_chain.chain_id <> 56
     or upper(coalesce(v_chain.asset, '')) <> 'USDT'
     or upper(coalesce(v_chain.payment_currency, '')) <> 'USDT'
     or upper(coalesce(v_chain.order_currency, '')) <> 'CNY'
     or v_chain.token_decimals <> 18
     or v_chain.exchange_rate is null
     or v_chain.exchange_rate <= 0
     or v_chain.expected_raw_amount is null
     or v_chain.confirmed_raw_amount is null
     or v_chain.confirmed_amount is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_SNAPSHOT_INVALID';
  end if;
  select * into v_payment_session
  from public.payment_sessions ps
  where ps.id = v_chain.payment_session_id
  for update;

  select * into v_order
  from public.orders o
  where o.id = v_chain.order_id
  for update;

  select * into v_order_payment
  from public.order_payments op
  where op.id = v_chain.payment_id
  for update;

  if v_payment_session.id is null or v_order.id is null or v_order_payment.id is null
     or v_payment_session.business_type <> 'order'
     or v_payment_session.business_id <> v_order.id
     or v_payment_session.user_id <> v_order.user_id
     or v_order_payment.order_id <> v_order.id
     or v_order_payment.user_id <> v_order.user_id
     or v_order_payment.payment_session_id <> v_payment_session.id then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_OWNERSHIP_INVALID';
  end if;
  if v_order.status <> 'pending_payment'
     or coalesce(v_order.payment_status, '') = 'paid'
     or v_payment_session.status not in ('pending', 'processing') then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PAYMENT_STATE_INVALID';
  end if;
  if round(v_payment_session.payable_amount, 6) <> round(v_chain.expected_amount, 6)
     or upper(coalesce(v_payment_session.currency, '')) <> 'USDT' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH';
  end if;

  select * into v_claim
  from public.chain_transaction_claims ctc
  where ctc.chain_id = 56
    and ctc.tx_hash = v_tx_hash
  for update;

  if not found
     or v_claim.order_id <> v_order.id
     or v_claim.chain_payment_session_id <> v_chain.id then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_CLAIM_INVALID';
  end if;

  select count(*) into v_transaction_count
  from public.chain_transactions ct
  where ct.chain_id = 56
    and lower(ct.tx_hash) = v_tx_hash;

  if v_transaction_count <> 1 then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_TRANSFER_COUNT_INVALID';
  end if;

  select * into v_transaction
  from public.chain_transactions ct
  where ct.chain_id = 56
    and lower(ct.tx_hash) = v_tx_hash
  for update;

  if v_transaction.chain_payment_session_id <> v_chain.id
     or v_transaction.order_id <> v_order.id
     or lower(v_transaction.token_contract) <> lower(v_chain.token_contract)
     or lower(v_transaction.to_address) <> lower(v_chain.receive_address)
     or v_transaction.confirmation_count < p_required_confirmations
     or v_transaction.block_timestamp is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_TRANSFER_INVALID';
  end if;

  select min(deadline_value) into v_deadline
  from unnest(array[
    v_order.payment_expires_at,
    v_chain.expires_at,
    v_payment_session.expires_at
  ]) as deadline_value
  where deadline_value is not null;

  if v_deadline is null or v_transaction.block_timestamp > v_deadline then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_LATE_TRANSFER';
  end if;

  if v_transaction.raw_amount is null
     or v_transaction.raw_amount <> trunc(v_transaction.raw_amount)
     or v_chain.expected_raw_amount <> trunc(v_chain.expected_raw_amount)
     or v_chain.confirmed_raw_amount <> trunc(v_chain.confirmed_raw_amount) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_RAW_AMOUNT_INVALID';
  end if;

  v_confirmed_raw := trunc(v_transaction.raw_amount);
  v_expected_raw := trunc(v_chain.expected_raw_amount);
  if v_confirmed_raw <= v_expected_raw or v_expected_raw <= 0 then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_AMOUNT_INVALID';
  end if;

  v_power := power(10::numeric, v_chain.token_decimals);
  v_confirmed_usdt := v_confirmed_raw / v_power;
  if v_confirmed_raw <> trunc(v_chain.confirmed_raw_amount)
     or v_confirmed_usdt <> v_transaction.normalized_amount
     or v_confirmed_usdt <> v_chain.confirmed_amount then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_RAW_AMOUNT_MISMATCH';
  end if;

  v_excess_raw := v_confirmed_raw - v_expected_raw;
  v_excess_usdt := v_excess_raw / v_power;
  v_excess_ratio := v_excess_raw / v_expected_raw;

  select
    max(
      case
        when ss.setting_key = 'max_auto_overpayment_usdt'
         and ss.setting_type = 'number'
         and ss.setting_group = 'security'
         and not ss.is_public
         and jsonb_typeof(ss.setting_value -> 'value') = 'number'
        then (ss.setting_value ->> 'value')::numeric
      end
    ),
    max(
      case
        when ss.setting_key = 'max_auto_overpayment_ratio'
         and ss.setting_type = 'number'
         and ss.setting_group = 'security'
         and not ss.is_public
         and jsonb_typeof(ss.setting_value -> 'value') = 'number'
        then (ss.setting_value ->> 'value')::numeric
      end
    )
  into v_max_auto_overpayment_usdt, v_max_auto_overpayment_ratio
  from public.site_settings ss
  where ss.setting_key in (
    'max_auto_overpayment_usdt',
    'max_auto_overpayment_ratio'
  );

  if v_max_auto_overpayment_usdt is null
     or v_max_auto_overpayment_usdt <= 0
     or v_max_auto_overpayment_ratio is null
     or v_max_auto_overpayment_ratio <= 0 then
    update public.chain_payment_sessions cps
    set status = 'manual_review',
        submitted_tx_hash = v_tx_hash,
        confirmed_amount = v_confirmed_usdt,
        confirmed_raw_amount = v_confirmed_raw,
        last_checked_at = v_processed_at,
        failure_reason = null,
        manual_review_reason = 'auto_overpayment_limit_unavailable',
        manual_review_decision = 'pending',
        completion_error = null,
        completion_started_at = null,
        completion_attempt_id = null,
        updated_at = v_processed_at
    where cps.id = v_chain.id;
    update public.chain_transactions ct
    set status = 'manual_review', updated_at = v_processed_at
    where ct.id = v_transaction.id;
    return jsonb_build_object(
      'result', 'manual_review',
      'businessType', 'order',
      'businessId', v_order.id,
      'businessNo', v_order.order_no,
      'reason_code', 'auto_overpayment_limit_unavailable'
    );
  end if;

  if v_excess_usdt > v_max_auto_overpayment_usdt
     or v_excess_ratio > v_max_auto_overpayment_ratio then
    update public.chain_payment_sessions cps
    set status = 'manual_review',
        submitted_tx_hash = v_tx_hash,
        confirmed_amount = v_confirmed_usdt,
        confirmed_raw_amount = v_confirmed_raw,
        last_checked_at = v_processed_at,
        failure_reason = null,
        manual_review_reason = 'auto_overpayment_limit_exceeded',
        manual_review_decision = 'pending',
        completion_error = null,
        completion_started_at = null,
        completion_attempt_id = null,
        updated_at = v_processed_at
    where cps.id = v_chain.id;
    update public.chain_transactions ct
    set status = 'manual_review', updated_at = v_processed_at
    where ct.id = v_transaction.id;
    return jsonb_build_object(
      'result', 'manual_review',
      'businessType', 'order',
      'businessId', v_order.id,
      'businessNo', v_order.order_no,
      'reason_code', 'auto_overpayment_limit_exceeded'
    );
  end if;

  -- Keep the established wallet ledger rule used by the manual path.
  v_credited_cny := round(v_excess_usdt * v_chain.exchange_rate, 2);
  if v_credited_cny <= 0 then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_CREDIT_ROUNDS_TO_ZERO';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_order.user_id
  for update;

  if not found then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_PROFILE_NOT_FOUND';
  end if;

  v_provider_transaction_id := v_tx_hash || ':' || v_transaction.log_index::text;
  v_completion := public.complete_payment_session(
    v_payment_session.id,
    v_provider_transaction_id,
    v_chain.expected_amount,
    'USDT',
    v_processed_at
  );

  if coalesce(v_completion ->> 'businessType', '') <> 'order'
     or coalesce(v_completion ->> 'businessId', '') <> v_order.id::text then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_COMPLETION_RESULT_INVALID';
  end if;

  update public.payment_sessions ps
  set metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object(
        'channel_received_amount', v_confirmed_usdt,
        'overpayment_usdt', v_excess_usdt,
        'overpayment_exchange_rate', v_chain.exchange_rate,
        'overpayment_settlement_source', 'automatic_service'
      ),
      updated_at = v_processed_at
  where ps.id = v_payment_session.id;

  v_balance_before := coalesce(v_profile.balance, 0);
  v_balance_after := v_balance_before + v_credited_cny;
  if v_balance_before < 0 or v_balance_after > v_balance_max then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_BALANCE_OUT_OF_RANGE';
  end if;
  v_transaction_no := 'BT-BEP20-' || replace(v_chain.id::text, '-', '');

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    v_order.user_id,
    v_transaction_no,
    'system',
    v_chain.id::text,
    'credit',
    v_credited_cny,
    v_balance_before,
    v_balance_after,
    'CNY',
    'completed',
    'BEP20 超额支付按订单锁定汇率自动转入站内余额',
    jsonb_build_object(
      'subtype', 'bep20_overpayment_wallet_credit',
      'settlement_source', 'automatic_service',
      'chain_session_id', v_chain.id,
      'order_id', v_order.id,
      'payment_id', v_order_payment.id,
      'payment_session_id', v_payment_session.id,
      'overpaid_usdt', v_excess_usdt,
      'exchange_rate', v_chain.exchange_rate,
      'confirmed_raw_amount', v_confirmed_raw,
      'expected_raw_amount', v_expected_raw
    )
  )
  returning * into v_balance_transaction;

  update public.profiles p
  set balance = v_balance_after,
      updated_at = v_processed_at
  where p.id = v_order.user_id;

  insert into public.bep20_overpayment_dispositions (
    chain_session_id, order_id, user_id, payment_id, balance_transaction_id,
    overpaid_usdt, exchange_rate, credited_cny, disposition, processed_by,
    processed_at, reason, request_id, settlement_source
  ) values (
    v_chain.id,
    v_order.id,
    v_order.user_id,
    v_order_payment.id,
    v_balance_transaction.id,
    v_excess_usdt,
    v_chain.exchange_rate,
    v_credited_cny,
    'wallet_credit',
    null,
    v_processed_at,
    'automatic_valid_in_window_overpayment',
    v_request_id,
    'automatic_service'
  );

  update public.chain_payment_sessions cps
  set status = 'paid',
      submitted_tx_hash = v_tx_hash,
      confirmed_amount = v_confirmed_usdt,
      confirmed_raw_amount = v_confirmed_raw,
      confirmed_at = coalesce(cps.confirmed_at, v_processed_at),
      last_checked_at = v_processed_at,
      failure_reason = null,
      manual_review_reason = null,
      manual_review_decision = null,
      completion_error = null,
      completion_started_at = null,
      completion_attempt_id = null,
      updated_at = v_processed_at
  where cps.id = v_chain.id;

  update public.chain_transactions ct
  set status = 'paid',
      updated_at = v_processed_at
  where ct.id = v_transaction.id;

  return jsonb_build_object(
    'result', 'settled',
    'idempotent', false,
    'businessType', 'order',
    'businessId', v_order.id,
    'businessNo', v_order.order_no,
    'chain_session_id', v_chain.id,
    'overpaid_usdt', v_excess_usdt,
    'exchange_rate', v_chain.exchange_rate,
    'credited_cny', v_credited_cny,
    'processed_at', v_processed_at,
    'settlement_source', 'automatic_service'
  );
end;
$$;

revoke all on function public.settle_bep20_automatic_overpayment(uuid,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.settle_bep20_automatic_overpayment(uuid,text,integer,text)
  to service_role;

do $$
declare
  v_profile_guard_oid oid := to_regprocedure('public.protect_profile_sensitive_fields()');
  v_cancel_oid oid := to_regprocedure('public.cancel_unpaid_order(uuid,text)');
  v_allowed_profile_columns constant text[] := array[
    'display_name',
    'phone',
    'recipient_name',
    'shipping_address',
    'avatar_url'
  ]::text[];
begin
  if not exists (
       select 1
       from pg_catalog.pg_class c
       where c.oid = 'public.profiles'::regclass
         and c.relrowsecurity
     )
     or exists (
       select 1
       from pg_catalog.pg_class c
       cross join lateral pg_catalog.aclexplode(
         coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
       ) acl
       where c.oid = 'public.profiles'::regclass
         and acl.grantee = 0
         and acl.privilege_type = 'UPDATE'
     )
     or has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_PROFILE_TABLE_ACL_FAILED';
  end if;

  if exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'profiles'
         and c.column_name = any(v_allowed_profile_columns)
         and not has_column_privilege(
           'authenticated',
           'public.profiles',
           c.column_name,
           'UPDATE'
         )
     )
     or exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'profiles'
         and c.column_name <> all(v_allowed_profile_columns)
         and has_column_privilege(
           'authenticated',
           'public.profiles',
           c.column_name,
           'UPDATE'
         )
     )
     or exists (
       select 1
       from (
         select a.attacl
         from pg_catalog.pg_attribute a
         where a.attrelid = 'public.profiles'::regclass
           and a.attnum > 0
           and not a.attisdropped
           and a.attacl is not null
           and cardinality(a.attacl) > 0
       ) a
       cross join lateral pg_catalog.aclexplode(a.attacl) acl
       where acl.grantee = 0
         and acl.privilege_type = 'UPDATE'
     )
     or exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'profiles'
         and has_column_privilege('anon', 'public.profiles', c.column_name, 'UPDATE')
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_PROFILE_COLUMN_ACL_FAILED';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_policies p
       where p.schemaname = 'public'
         and p.tablename = 'profiles'
         and p.policyname in (
           'Users can update own profile',
           'Users can update own non-role profile'
         )
     )
     or (
       select count(*)
       from pg_catalog.pg_policies p
       where p.schemaname = 'public'
         and p.tablename = 'profiles'
         and p.policyname = 'Users can update own safe profile fields'
         and p.cmd = 'UPDATE'
         and p.roles = array['authenticated']::name[]
         and coalesce(p.qual, '') ilike '%auth.uid()%id%'
         and coalesce(p.with_check, '') ilike '%auth.uid()%id%'
     ) <> 1 then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_PROFILE_RLS_FAILED';
  end if;

  if v_profile_guard_oid is null
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       where p.oid = v_profile_guard_oid
         and p.prosecdef
         and p.proconfig @> array['search_path=public']::text[]
         and pg_get_userbyid(p.proowner) = 'postgres'
     )
     or pg_get_functiondef(v_profile_guard_oid) not ilike '%to_jsonb(new)%is distinct from%to_jsonb(old)%'
     or pg_get_functiondef(v_profile_guard_oid) not ilike '%is_super_admin(auth.uid())%'
     or pg_get_functiondef(v_profile_guard_oid) not ilike '%service_role%'
     or not exists (
       select 1
       from pg_catalog.pg_trigger t
       where t.tgrelid = 'public.profiles'::regclass
         and t.tgname = 'profiles_protect_sensitive_fields'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and t.tgfoid = v_profile_guard_oid
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_PROFILE_TRIGGER_FAILED';
  end if;

  if not exists (
       select 1
       from pg_catalog.pg_class c
       where c.oid = 'public.orders'::regclass
         and c.relrowsecurity
     )
     or exists (
       select 1
       from pg_catalog.pg_class c
       cross join lateral pg_catalog.aclexplode(
         coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
       ) acl
       where c.oid = 'public.orders'::regclass
         and acl.grantee = 0
         and acl.privilege_type = 'UPDATE'
     )
     or has_table_privilege('anon', 'public.orders', 'UPDATE')
     or has_table_privilege('authenticated', 'public.orders', 'UPDATE')
     or exists (
       select 1
       from (
         select a.attacl
         from pg_catalog.pg_attribute a
         where a.attrelid = 'public.orders'::regclass
           and a.attnum > 0
           and not a.attisdropped
           and a.attacl is not null
           and cardinality(a.attacl) > 0
       ) a
       cross join lateral pg_catalog.aclexplode(a.attacl) acl
       where acl.grantee = 0
         and acl.privilege_type = 'UPDATE'
     )
     or exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'orders'
         and (
           has_column_privilege('anon', 'public.orders', c.column_name, 'UPDATE')
           or has_column_privilege('authenticated', 'public.orders', c.column_name, 'UPDATE')
         )
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_ORDER_ACL_FAILED';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_policies p
       where p.schemaname = 'public'
         and p.tablename = 'orders'
         and (
           p.policyname = 'users can cancel own pending orders'
           or (
             p.cmd in ('UPDATE', 'ALL')
             and coalesce(p.qual, '') ilike '%auth.uid()%'
             and coalesce(p.qual, '') not ilike '%is_admin%'
           )
         )
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_ORDER_RLS_FAILED';
  end if;

  if v_cancel_oid is null
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       where p.oid = v_cancel_oid
         and p.prosecdef
         and p.proconfig @> array['search_path=public']::text[]
         and pg_get_userbyid(p.proowner) = 'postgres'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_cancel_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_cancel_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_cancel_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_cancel_oid, 'EXECUTE')
     or pg_get_functiondef(v_cancel_oid) not ilike '%payment_status <> ''unpaid''%'
     or pg_get_functiondef(v_cancel_oid) not ilike '%chain_transaction_claims%'
     or pg_get_functiondef(v_cancel_oid) not ilike '%chain_transactions%'
     or pg_get_functiondef(v_cancel_oid) not ilike '%submitted_tx_hash is not null%'
     or pg_get_functiondef(v_cancel_oid) not ilike '%release_order_inventory%'
     or pg_get_functiondef(v_cancel_oid) not ilike '%ALREADY_CANCELLED%' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_ORDER_CANCEL_RPC_FAILED';
  end if;
end;
$$;

do $$
declare
  v_oid oid := to_regprocedure('public.settle_bep20_automatic_overpayment(uuid,text,integer,text)');
  v_manual_oid oid := to_regprocedure('public.credit_bep20_overpayment_to_wallet(uuid,text,text,uuid)');
  v_configure_oid oid := to_regprocedure('public.configure_bep20_automatic_overpayment_limits(numeric,numeric,uuid,text)');
  v_protect_oid oid := to_regprocedure('public.protect_bep20_overpayment_risk_settings()');
  v_txhash_guard_oid oid := to_regprocedure('public.enforce_bep20_txhash_business_uniqueness()');
  v_source_nullable text;
begin
  if v_oid is null then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_FUNCTION_MISSING';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = v_oid
      and p.prosecdef
      and p.proconfig @> array['search_path=public']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
  ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_SECURITY_FAILED';
  end if;
  if exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_GRANTS_FAILED';
  end if;
  if to_regprocedure('public.credit_bep20_overpayment_to_wallet(uuid,text,text)') is not null
     or v_manual_oid is null
     or not exists (
       select 1 from pg_proc p
       where p.oid = v_manual_oid
         and p.prosecdef
         and p.proconfig @> array['search_path=public']::text[]
         and pg_get_userbyid(p.proowner) = 'postgres'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_manual_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_manual_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_manual_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_manual_oid, 'EXECUTE')
     or pg_get_functiondef(v_manual_oid) not ilike '%BEP20_OVERPAYMENT_SERVICE_ROLE_REQUIRED%'
     or pg_get_functiondef(v_manual_oid) not ilike '%is_super_admin%v_operator_id%' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_MANUAL_RPC_FAILED';
  end if;
  if v_configure_oid is null
     or not exists (
       select 1 from pg_proc p
       where p.oid = v_configure_oid
         and p.prosecdef
         and p.proconfig @> array['search_path=public']::text[]
         and pg_get_userbyid(p.proowner) = 'postgres'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_configure_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_configure_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_configure_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_configure_oid, 'EXECUTE') then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_RISK_CONFIG_RPC_FAILED';
  end if;
  if v_protect_oid is null
     or not exists (
       select 1 from pg_proc p
       where p.oid = v_protect_oid
         and p.prosecdef
         and p.proconfig @> array['search_path=public']::text[]
         and pg_get_userbyid(p.proowner) = 'postgres'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_protect_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_protect_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_protect_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_protect_oid, 'EXECUTE')
     or pg_get_functiondef(v_protect_oid) not ilike '%max_auto_overpayment_usdt%'
     or pg_get_functiondef(v_protect_oid) not ilike '%max_auto_overpayment_ratio%'
     or pg_get_functiondef(v_protect_oid) not ilike '%service_role%' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_RISK_CONFIG_PROTECTION_FAILED';
  end if;
  if v_txhash_guard_oid is null
     or not exists (
       select 1 from pg_proc p
       where p.oid = v_txhash_guard_oid
         and p.prosecdef
         and p.proconfig @> array['search_path=public']::text[]
         and pg_get_userbyid(p.proowner) = 'postgres'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_txhash_guard_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_txhash_guard_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_txhash_guard_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_txhash_guard_oid, 'EXECUTE')
     or pg_get_functiondef(v_txhash_guard_oid) not ilike '%provider_trade_no%'
     or pg_get_functiondef(v_txhash_guard_oid) not ilike '%transaction_reference%'
     or pg_get_functiondef(v_txhash_guard_oid) not ilike '%chain_transaction_claims%' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_TXHASH_GUARD_FAILED';
  end if;
  select c.is_nullable into v_source_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'bep20_overpayment_dispositions'
    and c.column_name = 'processed_by';
  if v_source_nullable <> 'YES'
     or not exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'bep20_overpayment_dispositions'
         and c.column_name = 'settlement_source'
         and c.data_type = 'text'
         and c.is_nullable = 'NO'
         and coalesce(c.column_default, '') ilike '%manual_admin%'
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_DISPOSITION_SCHEMA_FAILED';
  end if;
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'account_recharges'
      and c.column_name = 'transaction_reference'
      and c.data_type = 'text'
      and c.is_nullable = 'YES'
      and c.column_default is null
  ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_RECHARGE_REFERENCE_FAILED';
  end if;
  if not exists (
       select 1 from pg_constraint c
       where c.conrelid = 'public.bep20_overpayment_dispositions'::regclass
         and c.conname = 'bep20_overpayment_settlement_source_check'
         and pg_get_constraintdef(c.oid) ilike '%manual_admin%'
         and pg_get_constraintdef(c.oid) ilike '%automatic_service%'
     )
     or not exists (
       select 1 from pg_trigger t
       where t.tgrelid = 'public.chain_transaction_claims'::regclass
         and t.tgname = 'trg_chain_claim_reject_completed_recharge_tx'
         and not t.tgisinternal
     )
     or not exists (
       select 1 from pg_trigger t
       where t.tgrelid = 'public.account_recharges'::regclass
         and t.tgname = 'trg_recharge_reject_claimed_bep20_tx'
         and not t.tgisinternal
     )
     or not exists (
       select 1 from pg_trigger t
       where t.tgrelid = 'public.site_settings'::regclass
         and t.tgname = 'trg_protect_bep20_overpayment_risk_settings'
         and not t.tgisinternal
     ) then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_CONSTRAINTS_FAILED';
  end if;
  if not exists (
       select 1
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'site_settings'
         and c.relrowsecurity
     )
     or (
       select count(*)
       from public.site_settings ss
       where ss.setting_key in (
         'max_auto_overpayment_usdt',
         'max_auto_overpayment_ratio'
       )
         and ss.setting_type = 'number'
         and ss.setting_group = 'security'
         and not ss.is_public
     ) <> 2 then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_RISK_SETTINGS_FAILED';
  end if;
  if pg_get_functiondef(v_oid) not ilike '%max_auto_overpayment_usdt%'
     or pg_get_functiondef(v_oid) not ilike '%max_auto_overpayment_ratio%'
     or pg_get_functiondef(v_oid) not ilike '%auto_overpayment_limit_unavailable%'
     or pg_get_functiondef(v_oid) not ilike '%auto_overpayment_limit_exceeded%' then
    raise exception 'BEP20_AUTOMATIC_OVERPAYMENT_POSTCHECK_RISK_ENFORCEMENT_FAILED';
  end if;
end;
$$;

commit;

-- Postcheck (read-only):
-- select p.oid::regprocedure, p.prosecdef, p.proconfig,
--   exists (
--     select 1
--     from pg_catalog.aclexplode(
--       coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
--     ) acl
--     where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
--   ) as public_execute,
--   has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
--   has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
-- from pg_proc p
-- where p.oid = 'public.settle_bep20_automatic_overpayment(uuid,text,integer,text)'::regprocedure;
--
-- Rollback (only before any automatic settlement has been recorded):
-- begin;
-- drop trigger if exists trg_chain_claim_reject_completed_recharge_tx on public.chain_transaction_claims;
-- drop trigger if exists trg_recharge_reject_claimed_bep20_tx on public.account_recharges;
-- drop trigger if exists trg_protect_bep20_overpayment_risk_settings on public.site_settings;
-- drop function if exists public.enforce_bep20_txhash_business_uniqueness();
-- drop function if exists public.protect_bep20_overpayment_risk_settings();
-- drop function if exists public.configure_bep20_automatic_overpayment_limits(numeric,numeric,uuid,text);
-- drop function if exists public.settle_bep20_automatic_overpayment(uuid,text,integer,text);
-- drop function if exists public.credit_bep20_overpayment_to_wallet(uuid,text,text,uuid);
-- transaction_reference is an established recharge-review application column
-- and is intentionally retained even when this migration added it. Do not drop
-- it during rollback or discard proof references written after deployment.
-- Reapply the approved 20260715 credit_bep20_overpayment_to_wallet definition
-- before removing settlement_source or restoring processed_by NOT NULL.
-- alter table public.bep20_overpayment_dispositions drop constraint if exists bep20_overpayment_settlement_source_check;
-- alter table public.bep20_overpayment_dispositions drop column if exists settlement_source;
-- alter table public.bep20_overpayment_dispositions alter column processed_by set not null;
-- commit;
-- The two private site_settings rows and their audit logs may be retained as
-- configuration history. Do not delete them automatically during rollback.
-- After an automatic credit exists, do not remove its audit column or fabricate
-- processed_by. Roll back/disable the application caller first, revoke service_role
-- EXECUTE from the automatic RPC under separate authorization, and retain all
-- ledger/disposition evidence. Delivery failures are retried, never financially
-- rolled back.
