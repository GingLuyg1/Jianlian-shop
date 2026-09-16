-- Forward-only repair for future CNY account-recharge completion timestamps.
-- This migration replaces one function definition only. It deliberately does
-- not update historical recharge, balance, ledger, channel, or trigger data.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  v_completed_at_type text;
  v_security_definer boolean;
  v_config text[];
  v_definition text;
begin
  if to_regclass('public.account_recharges') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_FORWARD_REPAIR_TABLE_MISSING';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into v_completed_at_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.account_recharges'::regclass
    and a.attname = 'completed_at'
    and a.attnum > 0
    and not a.attisdropped;

  if v_completed_at_type is distinct from 'timestamp with time zone' then
    raise exception
      'ACCOUNT_RECHARGE_COMPLETED_AT_FORWARD_REPAIR_COLUMN_INVALID: %',
      coalesce(v_completed_at_type, 'missing');
  end if;

  if to_regprocedure('public.credit_account_recharge_balance(text,text,numeric,text)') is null then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_FORWARD_REPAIR_FUNCTION_MISSING';
  end if;

  select p.prosecdef, p.proconfig, pg_catalog.pg_get_functiondef(p.oid)
    into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc p
  where p.oid =
    'public.credit_account_recharge_balance(text,text,numeric,text)'::regprocedure;

  if v_security_definer is distinct from true
     or v_config is distinct from array['search_path=public']::text[] then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_FORWARD_REPAIR_SECURITY_BASELINE_MISMATCH';
  end if;

  v_definition := lower(v_definition);

  if position('auth.role() <> ''service_role''' in v_definition) = 0
     or position('public.is_admin(auth.uid())' in v_definition) = 0
     or position('from public.account_recharges' in v_definition) = 0
     or position('for update' in v_definition) = 0
     or position('v_recharge.status in (''closed'',''expired'',''failed'',''refunded'')' in v_definition) = 0
     or position('round(coalesce(p_received_amount, 0)::numeric, 6)' in v_definition) = 0
     or position('round(coalesce(v_recharge.payable_amount, v_recharge.amount, 0)::numeric, 6)' in v_definition) = 0
     or position('upper(coalesce(p_currency, v_recharge.currency, ''cny''))' in v_definition) = 0
     or position('upper(coalesce(v_recharge.currency, ''cny''))' in v_definition) = 0
     or position('from public.balance_transactions' in v_definition) = 0
     or position('business_type = ''account_recharge''' in v_definition) = 0
     or position('status = ''completed''' in v_definition) = 0
     or position('return v_transaction' in v_definition) = 0
     or position('from public.profiles' in v_definition) = 0
     or position('v_before :=' in v_definition) = 0
     or position('v_after :=' in v_definition) = 0
     or position('update public.profiles' in v_definition) = 0
     or position('set balance = v_after' in v_definition) = 0
     or position('update public.account_recharges' in v_definition) = 0
     or position('paid_at = coalesce(paid_at, now())' in v_definition) = 0
     or position('callback_status = ''success''' in v_definition) = 0
     or position('insert into public.balance_transactions' in v_definition) = 0 then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_FORWARD_REPAIR_FUNCTION_BASELINE_MISMATCH';
  end if;

  if position(
    'completed_at = coalesce(completed_at, now())'
    in v_definition
  ) > 0 then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_FORWARD_REPAIR_ALREADY_PRESENT';
  end if;
end $$;

create or replace function public.credit_account_recharge_balance(
  p_recharge_no text,
  p_provider_trade_no text,
  p_received_amount numeric,
  p_currency text default 'CNY'
)
returns public.balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recharge public.account_recharges;
  v_profile public.profiles;
  v_transaction public.balance_transactions;
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_transaction_no text;
begin
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception '无权执行余额入账';
  end if;

  select * into v_recharge
  from public.account_recharges
  where recharge_no = p_recharge_no
  for update;

  if not found then
    raise exception '充值单不存在';
  end if;

  if v_recharge.status in ('closed','expired','failed','refunded') then
    raise exception '充值单状态不允许入账';
  end if;

  if round(coalesce(p_received_amount, 0)::numeric, 6) <> round(coalesce(v_recharge.payable_amount, v_recharge.amount, 0)::numeric, 6) then
    raise exception '到账金额与应付金额不一致';
  end if;

  if upper(coalesce(p_currency, v_recharge.currency, 'CNY')) <> upper(coalesce(v_recharge.currency, 'CNY')) then
    raise exception '到账币种与充值单币种不一致';
  end if;

  select * into v_transaction
  from public.balance_transactions
  where business_type = 'account_recharge'
    and business_id = v_recharge.recharge_no
    and status = 'completed'
  limit 1;

  if found then
    return v_transaction;
  end if;

  select * into v_profile
  from public.profiles
  where id = v_recharge.user_id
  for update;

  if not found then
    raise exception '用户资料不存在';
  end if;

  v_before := coalesce(v_profile.balance, 0);
  v_after := v_before + coalesce(v_recharge.amount, 0);
  v_transaction_no := 'BT' || to_char(now(), 'YYYYMMDDHH24MISS') || upper(substr(md5(random()::text), 1, 8));

  update public.profiles
  set balance = v_after,
      updated_at = now()
  where id = v_recharge.user_id;

  update public.account_recharges
  set status = 'paid',
      provider_trade_no = coalesce(nullif(p_provider_trade_no, ''), provider_trade_no),
      received_amount = p_received_amount,
      credited_amount = v_recharge.amount,
      paid_at = coalesce(paid_at, now()),
      completed_at = coalesce(completed_at, now()),
      callback_status = 'success',
      updated_at = now()
  where id = v_recharge.id;

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    v_recharge.user_id, v_transaction_no, 'account_recharge', v_recharge.recharge_no, 'credit', v_recharge.amount,
    v_before, v_after, coalesce(v_recharge.currency, 'CNY'), 'completed', '账户充值入账',
    jsonb_build_object('provider_trade_no_present', nullif(p_provider_trade_no, '') is not null)
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

commit;
