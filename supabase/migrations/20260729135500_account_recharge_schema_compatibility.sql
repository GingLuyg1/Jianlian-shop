-- Account recharge schema compatibility only.
-- No business data, RLS policy, ACL, default privilege, RPC, or settlement changes.

begin;

set local search_path = pg_catalog, public;

do $account_recharge_schema_compatibility$
declare
  v_table_oid oid := to_regclass('public.account_recharges');
  v_status_attnum smallint;
  v_constraint record;
  v_existing_index_oid oid;
  v_existing_index_definition text;
  v_existing_index_is_valid_unique boolean;
begin
  if v_table_oid is null then
    raise exception 'ACCOUNT_RECHARGE_SCHEMA_COMPATIBILITY_MISSING_TABLE';
  end if;

  alter table public.account_recharges
    add column if not exists client_request_id text,
    add column if not exists completed_at timestamptz,
    add column if not exists customer_note text,
    add column if not exists payment_method text,
    add column if not exists review_mode text,
    add column if not exists review_reason text;

  select a.attnum
  into v_status_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_table_oid
    and a.attname = 'status'
    and a.attnum > 0
    and not a.attisdropped;

  if v_status_attnum is null then
    raise exception 'ACCOUNT_RECHARGE_SCHEMA_COMPATIBILITY_MISSING_STATUS_COLUMN';
  end if;

  for v_constraint in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = v_table_oid
      and c.contype = 'c'
      and c.conkey = array[v_status_attnum]::smallint[]
  loop
    execute format(
      'alter table public.account_recharges drop constraint %I',
      v_constraint.conname
    );
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_table_oid
      and c.conname = 'account_recharges_status_check'
  ) then
    raise exception 'ACCOUNT_RECHARGE_SCHEMA_COMPATIBILITY_STATUS_CONSTRAINT_NAME_CONFLICT';
  end if;

  alter table public.account_recharges
    add constraint account_recharges_status_check
    check (
      status in (
        'pending',
        'waiting_payment',
        'submitted',
        'reviewing',
        'approved',
        'processing',
        'succeeded',
        'failed',
        'rejected',
        'cancelled',
        'expired',
        'paid',
        'closed',
        'refunded'
      )
    ) not valid;

  alter table public.account_recharges
    validate constraint account_recharges_status_check;

  v_existing_index_oid := to_regclass(
    'public.account_recharges_user_client_request_unique'
  );

  if v_existing_index_oid is not null then
    select
      pg_catalog.pg_get_indexdef(i.indexrelid),
      i.indrelid = v_table_oid and i.indisvalid and i.indisunique
    into
      v_existing_index_definition,
      v_existing_index_is_valid_unique
    from pg_catalog.pg_index i
    where i.indexrelid = v_existing_index_oid;

    if v_existing_index_is_valid_unique is not true
    or regexp_replace(
      lower(v_existing_index_definition),
      '\s+',
      '',
      'g'
    ) not like '%onpublic.account_rechargesusingbtree(user_id,client_request_id)%'
    or regexp_replace(
      lower(v_existing_index_definition),
      '\s+',
      '',
      'g'
    ) not like '%client_request_idisnotnull%'
    or regexp_replace(
      lower(v_existing_index_definition),
      '\s+',
      '',
      'g'
    ) not like '%btrim(client_request_id)<>''%' then
      raise exception 'ACCOUNT_RECHARGE_SCHEMA_COMPATIBILITY_INDEX_NAME_CONFLICT';
    end if;
  else
    create unique index account_recharges_user_client_request_unique
      on public.account_recharges(user_id, client_request_id)
      where client_request_id is not null
        and btrim(client_request_id) <> '';
  end if;
end
$account_recharge_schema_compatibility$;

commit;
