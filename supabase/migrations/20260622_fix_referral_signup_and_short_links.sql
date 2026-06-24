-- Fix referral signup trigger and invite binding compatibility.
-- Run once in Supabase SQL Editor after reviewing.
-- This migration keeps the auth trigger and invite/referral binding logic enabled.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists invite_code text;

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

alter table public.profiles
  add column if not exists promotion_balance numeric(12, 2) not null default 0;

alter table public.profiles
  alter column promotion_balance set default 0;

alter table public.profiles
  alter column role set default 'user';

alter table public.profiles
  alter column balance set default 0;

alter table public.profiles
  alter column created_at set default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'display_name'
      and is_nullable = 'NO'
      and column_default is null
  ) then
    execute 'alter table public.profiles alter column display_name set default ''''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'shipping_address'
      and is_nullable = 'NO'
      and column_default is null
  ) then
    execute 'alter table public.profiles alter column shipping_address set default ''{}''::jsonb';
  end if;
end $$;

create unique index if not exists profiles_invite_code_unique_idx
  on public.profiles(invite_code)
  where invite_code is not null;

create index if not exists profiles_referred_by_idx
  on public.profiles(referred_by);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  unique(referred_user_id)
);

create unique index if not exists referrals_referred_user_unique_idx
  on public.referrals(referred_user_id);

create index if not exists referrals_referrer_idx
  on public.referrals(referrer_id, created_at desc);

create index if not exists referrals_referral_code_idx
  on public.referrals(referral_code);

alter table public.referrals enable row level security;

drop policy if exists "Users can view own referral relations" on public.referrals;
create policy "Users can view own referral relations"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referred_user_id);

drop policy if exists "Admins can view all referral relations" on public.referrals;
create policy "Admins can view all referral relations"
  on public.referrals for select
  to authenticated
  using (public.is_admin(auth.uid()));

create or replace function public.role_for_email(input_email text)
returns text
language sql
stable
as $$
  select case
    when lower(coalesce(input_email, '')) = 'gac000189@gmail.com' then 'admin'
    else 'user'
  end
$$;

create or replace function public.make_referral_code()
returns text
language sql
volatile
as $$
  select 'JL' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8))
$$;

create or replace function public.generate_unique_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try integer := 0;
begin
  loop
    v_try := v_try + 1;
    v_code := public.make_referral_code();

    if not exists (select 1 from public.profiles where invite_code = v_code) then
      return v_code;
    end if;

    if v_try >= 50 then
      raise exception 'REFERRAL_CODE_GENERATION_FAILED';
    end if;
  end loop;
end;
$$;

create or replace function public.ensure_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_code text;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select invite_code into v_code
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    v_code := public.generate_unique_referral_code();

    insert into public.profiles (
      id,
      email,
      role,
      balance,
      promotion_balance,
      invite_code
    ) values (
      v_user_id,
      nullif(v_email, ''),
      public.role_for_email(v_email),
      0,
      0,
      v_code
    );

    return v_code;
  end if;

  if v_code is not null and trim(v_code) <> '' then
    return v_code;
  end if;

  loop
    v_code := public.generate_unique_referral_code();

    begin
      update public.profiles
      set invite_code = v_code
      where id = v_user_id
        and invite_code is null;

      if found then
        return v_code;
      end if;
    exception when unique_violation then
      -- Retry with a different generated code.
    end;
  end loop;
end;
$$;

grant execute on function public.ensure_my_referral_code() to authenticated;

create or replace function public.bind_referrer_by_code(input_invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite_code text := upper(trim(coalesce(input_invite_code, '')));
  v_inviter_id uuid;
  v_current_referrer uuid;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if v_invite_code = '' then
    return false;
  end if;

  perform public.ensure_my_referral_code();

  select referred_by into v_current_referrer
  from public.profiles
  where id = v_user_id
  for update;

  if v_current_referrer is not null then
    return false;
  end if;

  select id into v_inviter_id
  from public.profiles
  where upper(invite_code) = v_invite_code
  limit 1;

  if v_inviter_id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  if v_inviter_id = v_user_id then
    raise exception 'SELF_INVITE_NOT_ALLOWED';
  end if;

  update public.profiles
  set referred_by = v_inviter_id
  where id = v_user_id
    and referred_by is null;

  insert into public.referrals (
    referrer_id,
    referred_user_id,
    referral_code
  ) values (
    v_inviter_id,
    v_user_id,
    v_invite_code
  ) on conflict (referred_user_id) do nothing;

  return true;
end;
$$;

grant execute on function public.bind_referrer_by_code(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter_id uuid;
  v_invite_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_new_invite_code text;
begin
  v_new_invite_code := public.generate_unique_referral_code();

  if v_invite_code <> '' then
    select id into v_inviter_id
    from public.profiles
    where upper(invite_code) = v_invite_code
      and id <> new.id
    limit 1;
  end if;

  insert into public.profiles (
    id,
    email,
    phone,
    role,
    balance,
    promotion_balance,
    invite_code,
    referred_by
  ) values (
    new.id,
    lower(new.email),
    new.phone,
    public.role_for_email(new.email),
    0,
    0,
    v_new_invite_code,
    v_inviter_id
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email),
      phone = coalesce(excluded.phone, public.profiles.phone),
      role = coalesce(public.profiles.role, excluded.role, 'user'),
      balance = coalesce(public.profiles.balance, 0),
      promotion_balance = coalesce(public.profiles.promotion_balance, 0),
      invite_code = coalesce(public.profiles.invite_code, excluded.invite_code),
      referred_by = coalesce(public.profiles.referred_by, excluded.referred_by);

  if v_inviter_id is not null then
    begin
      insert into public.referrals (
        referrer_id,
        referred_user_id,
        referral_code
      ) values (
        v_inviter_id,
        new.id,
        v_invite_code
      ) on conflict (referred_user_id) do nothing;
    exception when others then
      -- Do not break Supabase Auth user creation if the referral audit row fails unexpectedly.
      -- profiles.referred_by is already written above, and bind_referrer_by_code can repair the relation later.
      raise warning 'REFERRAL_INSERT_SKIPPED: %', sqlerrm;
    end;
  end if;

  return new;
exception when unique_violation then
  -- Retry once with a new code if a concurrent signup generated the same invite code.
  v_new_invite_code := public.generate_unique_referral_code();

  insert into public.profiles (
    id,
    email,
    phone,
    role,
    balance,
    promotion_balance,
    invite_code,
    referred_by
  ) values (
    new.id,
    lower(new.email),
    new.phone,
    public.role_for_email(new.email),
    0,
    0,
    v_new_invite_code,
    v_inviter_id
  )
  on conflict (id) do update
  set invite_code = coalesce(public.profiles.invite_code, excluded.invite_code),
      referred_by = coalesce(public.profiles.referred_by, excluded.referred_by);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill missing invite codes for existing profiles without overwriting existing codes.
do $$
declare
  v_profile record;
  v_code text;
begin
  for v_profile in
    select id from public.profiles where invite_code is null
  loop
    v_code := public.generate_unique_referral_code();
    update public.profiles
    set invite_code = v_code
    where id = v_profile.id
      and invite_code is null;
  end loop;
end $$;
