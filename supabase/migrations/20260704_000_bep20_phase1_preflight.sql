-- Read-only BEP20 phase 1 prerequisite check.
-- Execute this entire file before 20260704_bep20_chain_payment_phase1.sql.
-- It intentionally performs no DDL or data changes.

do $$
declare
  v_type text;
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'BEP20 preflight failed: public.is_admin() is required by the phase 1 RLS policies';
  end if;

  if to_regclass('public.orders') is null then
    raise exception 'BEP20 preflight failed: public.orders is required';
  end if;
  if to_regclass('public.payment_sessions') is null then
    raise exception 'BEP20 preflight failed: public.payment_sessions is required';
  end if;
  if to_regprocedure('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'BEP20 preflight failed: complete_payment_session(uuid,text,numeric,text,timestamptz) is required';
  end if;

  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'id';
  if v_type is distinct from 'uuid' then
    raise exception 'BEP20 preflight failed: orders.id must be uuid';
  end if;

  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'total_amount';
  if v_type is null or v_type not in ('numeric', 'decimal') then
    raise exception 'BEP20 preflight failed: orders.total_amount must be numeric';
  end if;

  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'payment_sessions' and column_name = 'id';
  if v_type is distinct from 'uuid' then
    raise exception 'BEP20 preflight failed: payment_sessions.id must be uuid';
  end if;

  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'payment_sessions' and column_name = 'payable_amount';
  if v_type is null or v_type not in ('numeric', 'decimal') then
    raise exception 'BEP20 preflight failed: payment_sessions.payable_amount must be numeric';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_sessions' and column_name = 'currency'
  ) then
    raise exception 'BEP20 preflight failed: payment_sessions.currency is required';
  end if;
end $$;
