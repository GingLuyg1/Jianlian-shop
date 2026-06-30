-- Jianlian Shop migration registry and read-only schema check helpers.
-- Execute manually in Supabase SQL Editor. This migration is idempotent.

create table if not exists public.app_migration_history (
  id uuid primary key default gen_random_uuid(),
  migration_name text not null unique,
  checksum text,
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  environment text not null default 'production',
  status text not null default 'success',
  notes text,
  created_at timestamptz not null default now(),
  constraint app_migration_history_status_check
    check (status in ('success', 'failed', 'skipped'))
);

create index if not exists app_migration_history_applied_at_idx
  on public.app_migration_history (applied_at desc nulls last);

create index if not exists app_migration_history_environment_status_idx
  on public.app_migration_history (environment, status);

alter table public.app_migration_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_migration_history'
      and policyname = 'app_migration_history_admin_select'
  ) then
    create policy app_migration_history_admin_select
      on public.app_migration_history
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_migration_history'
      and policyname = 'app_migration_history_admin_insert'
  ) then
    create policy app_migration_history_admin_insert
      on public.app_migration_history
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_migration_history'
      and policyname = 'app_migration_history_admin_update'
  ) then
    create policy app_migration_history_admin_update
      on public.app_migration_history
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;
end $$;

revoke all on public.app_migration_history from anon;
grant select, insert, update on public.app_migration_history to authenticated;

create or replace function public.app_check_database_structure()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  required_tables text[] := array[
    'profiles',
    'categories',
    'products',
    'product_option_groups',
    'product_option_values',
    'product_skus',
    'product_sku_values',
    'orders',
    'order_items',
    'order_status_logs',
    'order_deliveries',
    'account_recharges',
    'payment_channels',
    'payment_sessions',
    'payment_callback_logs',
    'balance_transactions',
    'payment_reconciliations',
    'digital_inventory',
    'digital_inventory_batches',
    'visitor_events',
    'admin_audit_logs',
    'app_migration_history'
  ];
  required_functions text[] := array[
    'handle_new_user',
    'release_order_inventory',
    'reserve_order_inventory',
    'deliver_order_inventory',
    'app_check_database_structure'
  ];
  missing_tables text[] := array[]::text[];
  missing_columns text[] := array[]::text[];
  missing_functions text[] := array[]::text[];
  missing_constraints text[] := array[]::text[];
  table_name text;
  function_name text;
  column_check record;
  constraint_check record;
  latest_migration jsonb;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'permission denied';
  end if;

  foreach table_name in array required_tables loop
    if to_regclass('public.' || table_name) is null then
      missing_tables := array_append(missing_tables, table_name);
    end if;
  end loop;

  for column_check in
    select *
    from (
      values
        ('profiles', 'id'), ('profiles', 'email'), ('profiles', 'role'), ('profiles', 'balance'),
        ('categories', 'id'), ('categories', 'parent_id'), ('categories', 'level'), ('categories', 'slug'), ('categories', 'is_active'),
        ('products', 'id'), ('products', 'category_id'), ('products', 'slug'), ('products', 'status'), ('products', 'stock'),
        ('product_skus', 'id'), ('product_skus', 'product_id'), ('product_skus', 'sku_code'), ('product_skus', 'price'), ('product_skus', 'stock'), ('product_skus', 'status'),
        ('orders', 'id'), ('orders', 'order_no'), ('orders', 'user_id'), ('orders', 'status'), ('orders', 'payment_status'), ('orders', 'total_amount'),
        ('order_items', 'id'), ('order_items', 'order_id'), ('order_items', 'product_id'), ('order_items', 'sku_id'), ('order_items', 'quantity'), ('order_items', 'unit_price'),
        ('order_deliveries', 'id'), ('order_deliveries', 'order_id'), ('order_deliveries', 'order_item_id'), ('order_deliveries', 'delivery_status'),
        ('account_recharges', 'id'), ('account_recharges', 'recharge_no'), ('account_recharges', 'user_id'), ('account_recharges', 'status'), ('account_recharges', 'payable_amount'),
        ('payment_channels', 'id'), ('payment_channels', 'code'), ('payment_channels', 'enabled'), ('payment_channels', 'provider'),
        ('payment_sessions', 'id'), ('payment_sessions', 'session_no'), ('payment_sessions', 'status'), ('payment_sessions', 'provider'),
        ('payment_callback_logs', 'id'), ('payment_callback_logs', 'provider'), ('payment_callback_logs', 'event_type'),
        ('balance_transactions', 'id'), ('balance_transactions', 'user_id'), ('balance_transactions', 'amount'), ('balance_transactions', 'balance_before'), ('balance_transactions', 'balance_after'),
        ('digital_inventory', 'id'), ('digital_inventory', 'product_id'), ('digital_inventory', 'sku_id'), ('digital_inventory', 'content_hash'), ('digital_inventory', 'status'),
        ('digital_inventory_batches', 'id'), ('digital_inventory_batches', 'product_id'), ('digital_inventory_batches', 'sku_id'), ('digital_inventory_batches', 'status'),
        ('admin_audit_logs', 'id'), ('admin_audit_logs', 'admin_user_id'), ('admin_audit_logs', 'action'), ('admin_audit_logs', 'module'),
        ('app_migration_history', 'id'), ('app_migration_history', 'migration_name'), ('app_migration_history', 'status')
    ) as c(table_name, column_name)
  loop
    if to_regclass('public.' || column_check.table_name) is not null
       and not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = column_check.table_name
          and c.column_name = column_check.column_name
      ) then
      missing_columns := array_append(missing_columns, column_check.table_name || '.' || column_check.column_name);
    end if;
  end loop;

  foreach function_name in array required_functions loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = function_name
    ) then
      missing_functions := array_append(missing_functions, function_name);
    end if;
  end loop;

  for constraint_check in
    select *
    from (
      values
        ('orders', 'orders_order_no_key'),
        ('account_recharges', 'account_recharges_recharge_no_key'),
        ('app_migration_history', 'app_migration_history_migration_name_key')
    ) as c(table_name, constraint_name)
  loop
    if to_regclass('public.' || constraint_check.table_name) is not null
       and not exists (
        select 1
        from pg_constraint pc
        join pg_class cls on cls.oid = pc.conrelid
        join pg_namespace ns on ns.oid = cls.relnamespace
        where ns.nspname = 'public'
          and cls.relname = constraint_check.table_name
          and pc.conname = constraint_check.constraint_name
      ) then
      missing_constraints := array_append(missing_constraints, constraint_check.table_name || '.' || constraint_check.constraint_name);
    end if;
  end loop;

  select jsonb_build_object(
    'migration_name', migration_name,
    'status', status,
    'applied_at', applied_at,
    'environment', environment
  )
  into latest_migration
  from public.app_migration_history
  where status = 'success'
  order by applied_at desc nulls last, created_at desc
  limit 1;

  return jsonb_build_object(
    'checked_at', now(),
    'missing_tables', missing_tables,
    'missing_columns', missing_columns,
    'missing_functions', missing_functions,
    'missing_constraints', missing_constraints,
    'latest_migration', latest_migration,
    'summary', jsonb_build_object(
      'required_tables', array_length(required_tables, 1),
      'missing_table_count', coalesce(array_length(missing_tables, 1), 0),
      'missing_column_count', coalesce(array_length(missing_columns, 1), 0),
      'missing_function_count', coalesce(array_length(missing_functions, 1), 0),
      'missing_constraint_count', coalesce(array_length(missing_constraints, 1), 0)
    )
  );
end;
$$;

revoke all on function public.app_check_database_structure() from anon;
grant execute on function public.app_check_database_structure() to authenticated;
