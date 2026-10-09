-- Forward-only defensive ACL hardening. No business rows are changed.
-- Deploy the verified server-side profile bootstrap before applying this ACL.
begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null
     or to_regprocedure('public.handle_new_user()') is null then
    raise exception 'PROFILE_INSERT_BASELINE_MISSING';
  end if;
  if not exists (select 1 from pg_class where oid='public.profiles'::regclass and relkind='r' and relrowsecurity) then
    raise exception 'PROFILE_INSERT_RLS_BASELINE_MISSING';
  end if;
  if not exists (
    select 1 from pg_proc p where p.oid='public.handle_new_user()'::regprocedure
      and p.prosecdef and p.proconfig @> array['search_path=public']::text[]
      and pg_get_functiondef(p.oid) ilike '%public.role_for_email(new.email)%'
      and has_table_privilege(p.proowner, 'public.profiles', 'INSERT')
  ) or not exists (
    select 1 from pg_trigger where tgrelid='auth.users'::regclass
      and tgfoid='public.handle_new_user()'::regprocedure and not tgisinternal
      and tgenabled='O' and (tgtype & 4)=4 and (tgtype & 2)=0 and (tgtype & 1)=1
  ) then raise exception 'PROFILE_SIGNUP_TRIGGER_BASELINE_INVALID'; end if;
  if not has_table_privilege('service_role', 'public.profiles', 'INSERT') then
    raise exception 'PROFILE_SERVICE_BOOTSTRAP_BASELINE_INVALID';
  end if;
  if not has_column_privilege('authenticated','public.profiles','display_name','UPDATE')
     or has_column_privilege('authenticated','public.profiles','balance','UPDATE')
     or has_column_privilege('authenticated','public.profiles','role','UPDATE') then
    raise exception 'PROFILE_SAFE_UPDATE_BASELINE_INVALID';
  end if;
end;
$$;

revoke insert on public.profiles from public, anon, authenticated;
-- Table and column grants are independent. Revoke every explicit column grant,
-- including referral fields, so existing/future columns cannot retain a bypass.
do $$
declare columns_sql text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into columns_sql
  from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
  execute format('revoke insert (%s) on public.profiles from public, anon, authenticated', columns_sql);
  if has_any_column_privilege('authenticated','public.profiles','INSERT')
     or has_any_column_privilege('anon','public.profiles','INSERT') then
    -- Also detects unexpected role inheritance: fail closed, do not broaden scope.
    raise exception 'PROFILE_INSERT_REVOKE_POSTCHECK_FAILED';
  end if;
  if not has_table_privilege('service_role','public.profiles','INSERT')
     or not has_column_privilege('authenticated','public.profiles','display_name','UPDATE') then
    raise exception 'PROFILE_BOOTSTRAP_OR_SAFE_UPDATE_POSTCHECK_FAILED';
  end if;
end;
$$;
commit;
