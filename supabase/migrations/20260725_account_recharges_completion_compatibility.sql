-- Add the final recharge workflow completion timestamp required by the
-- recharge list, detail and manual-review completion paths.

begin;

do $$
declare
  v_missing text[];
begin
  if to_regclass('public.account_recharges') is null then
    raise exception 'ACCOUNT_RECHARGES_COMPLETION_PREFLIGHT_TABLE_MISSING';
  end if;

  select array_agg(v.column_name order by v.column_name)
    into v_missing
  from (
    values ('status'), ('paid_at'), ('updated_at')
  ) as v(column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'account_recharges'
      and c.column_name = v.column_name
  );

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'ACCOUNT_RECHARGES_COMPLETION_PREFLIGHT_COLUMNS_MISSING: %', v_missing;
  end if;
end;
$$;

alter table public.account_recharges
  add column if not exists completed_at timestamptz;

comment on column public.account_recharges.completed_at is
  'Final recharge workflow completion time. NULL until the recharge is actually completed; paid_at remains the payment settlement time.';

do $$
declare
  v_type text;
  v_nullable text;
  v_default text;
begin
  select c.data_type, c.is_nullable, c.column_default
    into v_type, v_nullable, v_default
  from information_schema.columns as c
  where c.table_schema = 'public'
    and c.table_name = 'account_recharges'
    and c.column_name = 'completed_at';

  if v_type <> 'timestamp with time zone'
     or v_nullable <> 'YES'
     or v_default is not null then
    raise exception 'ACCOUNT_RECHARGES_COMPLETION_POSTCHECK_FAILED: type=%, nullable=%, default=%',
      v_type, v_nullable, v_default;
  end if;
end;
$$;

commit;

-- Manual rollback (do not run automatically):
-- alter table public.account_recharges drop column if exists completed_at;
-- Only use that rollback before any deployed code or recharge record depends on
-- completed_at. Never synthesize or backfill completion timestamps.
