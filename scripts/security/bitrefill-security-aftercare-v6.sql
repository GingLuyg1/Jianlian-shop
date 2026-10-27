-- V6 forward-only security patch; NOT DB9. Apply only under separate target
-- deployment authorization. Tested directly in a disposable synthetic database.
-- No business rows, mappings, historical migrations or financial RPC bodies change.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

do $preflight$
declare
  target regclass;
  name text;
begin
  foreach name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = name) then
      raise exception 'V6_REQUIRED_ROLE_MISSING: %', name;
    end if;
  end loop;
  foreach name in array array['products', 'product_skus'] loop
    target := to_regclass('public.' || name);
    if target is null or not exists (
      select 1 from pg_class where oid = target and relkind = 'r' and relrowsecurity
    ) or not exists (
      select 1 from pg_attribute where attrelid = target and attname = 'metadata'
        and atttypid = 'jsonb'::regtype and attnum > 0 and not attisdropped
    ) then
      raise exception 'V6_EXPECTED_METADATA_RLS_TABLE_REQUIRED: %', name;
    end if;
    -- A definer view can bypass base-table column privileges. Refuse an
    -- unknown public-readable metadata view instead of silently widening scope.
    if exists (
      with recursive dependent_views(oid) as (
        select r.ev_class from pg_depend d
        join pg_rewrite r on r.oid = d.objid and d.classid = 'pg_rewrite'::regclass
        join pg_attribute a on a.attrelid = target and a.attname = 'metadata'
        where d.refobjid = target and d.refclassid = 'pg_class'::regclass
          and d.refobjsubid in (0, a.attnum)
        union
        select r.ev_class from dependent_views previous
        join pg_depend d on d.refobjid = previous.oid and d.refclassid = 'pg_class'::regclass
        join pg_rewrite r on r.oid = d.objid and d.classid = 'pg_rewrite'::regclass
      )
      select 1 from dependent_views d join pg_class v on v.oid = d.oid
      where v.relkind in ('v', 'm')
        and (has_any_column_privilege('anon', v.oid, 'select')
          or has_any_column_privilege('authenticated', v.oid, 'select'))
    ) then
      raise exception 'V6_PUBLIC_METADATA_VIEW_REQUIRES_REVIEW: %', name;
    end if;
  end loop;
  if to_regprocedure('public.create_refund_request(text,text,text,numeric,text,text)') is null
    or to_regprocedure('public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text)') is null
    or to_regclass('public.refund_requests') is null then
    raise exception 'V6_EXISTING_REFUND_CONTRACT_REQUIRED';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname = 'create_refund_request') <> 1 then
    raise exception 'V6_UNEXPECTED_REFUND_RPC_OVERLOAD';
  end if;
end;
$preflight$;

-- Revoking a column grant alone does not defeat a table-wide SELECT grant.
-- Clear both kinds, including PUBLIC and stale explicit column grants, then
-- grant a fixed public projection. Unknown/future columns remain private.
do $columns$
declare
  target text;
  fields text;
  allowed text[];
begin
  foreach target in array array['products', 'product_skus'] loop
    execute format('revoke select on table public.%I from public, anon, authenticated', target);
    select string_agg(quote_ident(attname), ', ' order by attnum) into fields
      from pg_attribute where attrelid = to_regclass('public.' || target)
        and attnum > 0 and not attisdropped;
    execute format('revoke select (%s) on table public.%I from public, anon, authenticated', fields, target);
    allowed := case when target = 'products' then array[
      'id','category_id','subcategory_id','name','slug','short_description','description',
      'image_url','gallery','price','original_price','stock','has_skus','delivery_type',
      'status','sort_order','created_at','updated_at'
    ] else array[
      'id','product_id','sku_code','sku_title','price','original_price','stock','status',
      'delivery_type','image_url','sort_order','created_at','updated_at'
    ] end;
    select string_agg(quote_ident(attname), ', ' order by attnum) into fields
      from pg_attribute where attrelid = to_regclass('public.' || target)
        and attnum > 0 and not attisdropped and attname = any(allowed);
    execute format('grant select (%s) on table public.%I to anon, authenticated', fields, target);
  end loop;
end;
$columns$;

-- Close direct Data API/RPC submissions as well as the Next.js endpoint.
-- The existing super-admin manual processing RPC and history SELECT are untouched.
revoke execute on function public.create_refund_request(text,text,text,numeric,text,text)
  from public, anon, authenticated;
revoke insert on table public.refund_requests from public, anon, authenticated;
do $refund_columns$
declare fields text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into fields
    from pg_attribute where attrelid = 'public.refund_requests'::regclass
      and attnum > 0 and not attisdropped;
  execute format('revoke insert (%s) on public.refund_requests from public, anon, authenticated', fields);
end;
$refund_columns$;

do $verify$
declare name text; target text;
begin
  foreach name in array array['anon', 'authenticated'] loop
    foreach target in array array['products', 'product_skus'] loop
      if has_column_privilege(name, 'public.' || target, 'metadata', 'select')
        or not has_column_privilege(name, 'public.' || target, 'id', 'select') then
        raise exception 'V6_METADATA_COLUMN_PRIVILEGES_UNSAFE: % %', name, target;
      end if;
    end loop;
    if has_function_privilege(name, 'public.create_refund_request(text,text,text,numeric,text,text)', 'execute')
      or has_any_column_privilege(name, 'public.refund_requests', 'insert') then
      raise exception 'V6_CUSTOMER_REFUND_PRIVILEGES_UNSAFE: %', name;
    end if;
  end loop;
  -- Do not silently compensate for a broken/missing server credential contract.
  if not has_column_privilege('service_role', 'public.products', 'metadata', 'select')
    or not has_column_privilege('service_role', 'public.product_skus', 'metadata', 'select')
    or not has_function_privilege('authenticated', 'public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text)', 'execute')
    or not has_table_privilege('authenticated', 'public.refund_requests', 'select') then
    raise exception 'V6_ADMIN_OR_HISTORY_CONTRACT_NOT_PRESERVED';
  end if;
end;
$verify$;
commit;
