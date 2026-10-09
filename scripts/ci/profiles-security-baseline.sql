-- Synthetic isolated baseline; schema/functions from SELECT-only Production audit, no user data.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}'::jsonb);
create table public.profiles(
 id uuid primary key references auth.users(id) on delete cascade, email text,phone text,
 role text not null default 'user' check(role in ('user','admin','support','finance')),
 balance numeric(12,2) not null default 0, promotion_balance numeric(12,2) not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 invite_code text,referred_by uuid references public.profiles(id) on delete set null,
 display_name text,avatar_url text,recipient_name text,shipping_address text,country text,
 account_status text not null default 'active' check(account_status in ('active','restricted','suspended','disabled')),
 risk_status text not null default 'normal' check(risk_status in ('normal','watch','high_risk','blocked')),
 status_reason text,risk_reason text,status_updated_at timestamptz,status_updated_by uuid,
 risk_updated_at timestamptz,risk_updated_by uuid,last_login_at timestamptz,
 deleted_at timestamptz,anonymized_at timestamptz,deletion_requested_at timestamptz
);
create table public.admin_users(user_id uuid primary key,admin_level text,status text);
create table public.referrals(referrer_id uuid,referred_user_id uuid unique,referral_code text);
CREATE OR REPLACE FUNCTION public.role_for_email(input_email text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select 'user'::text
  from (values ($1)) as ignored(input_value);
$function$;

CREATE OR REPLACE FUNCTION public.role_for_email(input_email character varying)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.role_for_email(input_email::text);
$function$;

CREATE OR REPLACE FUNCTION public.make_referral_code()
 RETURNS text
 LANGUAGE sql
AS $function$
  select 'JL' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8))
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select $1 is not null and exists (
    select 1 from public.admin_users au
    where au.user_id = $1
      and au.status = 'active'
      and au.admin_level = 'super_admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.is_super_admin(auth.uid()); $function$;

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select $1 is not null and (
    exists (
      select 1 from public.admin_users au
      where au.user_id = $1
        and au.status = 'active'
        and au.admin_level in ('admin','super_admin')
    )
    or (
      not exists (select 1 from public.admin_users au where au.user_id = $1)
      and exists (select 1 from public.profiles p where p.id = $1 and p.role = 'admin')
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.is_admin(auth.uid()); $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inviter_profile_id uuid;
  submitted_invite_code text;
  new_invite_code text;
begin
  submitted_invite_code := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  new_invite_code := public.make_referral_code();

  if submitted_invite_code is not null then
    select id into inviter_profile_id
    from public.profiles
    where lower(invite_code) = lower(submitted_invite_code)
      and id <> new.id
    limit 1;
  end if;

  insert into public.profiles (
    id,
    email,
    phone,
    role,
    invite_code,
    referred_by
  )
  values (
    new.id,
    lower(new.email),
    new.phone,
    public.role_for_email(new.email),
    new_invite_code,
    inviter_profile_id
  )
  on conflict (id) do nothing;

  if inviter_profile_id is not null then
    insert into public.referrals (
      referrer_id,
      referred_user_id,
      referral_code
    )
    values (
      inviter_profile_id,
      new.id,
      submitted_invite_code
    )
    on conflict (referred_user_id) do nothing;
  end if;

  return new;
exception when unique_violation then
  insert into public.profiles (
    id,email,phone,role,invite_code,referred_by
  )
  values (
    new.id,lower(new.email),new.phone,public.role_for_email(new.email),
    public.make_referral_code(),inviter_profile_id
  )
  on conflict (id) do nothing;
  if inviter_profile_id is not null then
    insert into public.referrals (
      referrer_id,
      referred_user_id,
      referral_code
    )
    values (
      inviter_profile_id,
      new.id,
      submitted_invite_code
    )
    on conflict (referred_user_id) do nothing;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_referral_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.role := old.role;
    new.balance := old.balance;
    new.promotion_balance := old.promotion_balance;
    new.invite_code := old.invite_code;
    new.referred_by := old.referred_by;
  end if;

  return new;
end;
$function$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger profiles_protect_referral_fields before update on public.profiles for each row execute function public.protect_profile_referral_fields();
create trigger profiles_protect_sensitive_fields before update on public.profiles for each row execute function public.protect_profile_sensitive_fields();
alter table public.profiles enable row level security;
grant select,insert on public.profiles to authenticated;
grant update(display_name,phone,recipient_name,shipping_address,avatar_url) on public.profiles to authenticated;
grant all on public.profiles to service_role;
-- Include an explicit column INSERT grant to prove table-only REVOKE is insufficient.
grant insert(role,balance) on public.profiles to authenticated;
create policy "Admins can update all profiles" on public.profiles for UPDATE to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Admins can view all profiles" on public.profiles for SELECT to authenticated using (is_admin(auth.uid()));
create policy "Users can insert own profile" on public.profiles for INSERT to authenticated with check ((auth.uid() = id));
create policy "Users can read own profile" on public.profiles for SELECT to authenticated using ((auth.uid() = id));
create policy "Users can update own safe profile fields" on public.profiles for UPDATE to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "Users can view own profile" on public.profiles for SELECT to authenticated using ((auth.uid() = id));
create policy "Users can view profiles they referred" on public.profiles for SELECT to authenticated using ((auth.uid() = referred_by));
