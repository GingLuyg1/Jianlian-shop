-- Profiles schema alignment for account profile read/create/update flows.
-- Execute manually. This migration is additive and does not delete existing data.
-- Intentionally does not add a country column because current UI and order flows
-- do not require it.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists recipient_name text,
  add column if not exists shipping_address jsonb not null default '{}'::jsonb,
  add column if not exists avatar_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists account_status text not null default 'active',
  add column if not exists risk_status text not null default 'normal',
  add column if not exists status_reason text,
  add column if not exists risk_reason text,
  add column if not exists last_login_at timestamptz;

update public.profiles
set shipping_address = '{}'::jsonb
where shipping_address is null;

update public.profiles
set metadata = '{}'::jsonb
where metadata is null;

alter table public.profiles
  alter column shipping_address set default '{}'::jsonb,
  alter column shipping_address set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active','disabled','deleted','pending_deletion'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_risk_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_risk_status_check
      check (risk_status in ('normal','watch','high_risk','blocked'));
  end if;
end $$;

create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_risk_status_idx on public.profiles(risk_status);
create index if not exists profiles_display_name_idx on public.profiles(display_name);

create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin(auth.uid()) then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.balance is distinct from old.balance
    or new.promotion_balance is distinct from old.promotion_balance
    or new.invite_code is distinct from old.invite_code
    or new.referred_by is distinct from old.referred_by
    or new.account_status is distinct from old.account_status
    or new.risk_status is distinct from old.risk_status
    or new.status_reason is distinct from old.status_reason
    or new.risk_reason is distinct from old.risk_reason
    or new.last_login_at is distinct from old.last_login_at
  then
    raise exception 'PROFILE_SENSITIVE_FIELD_UPDATE_DENIED';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_sensitive_fields on public.profiles;
create trigger profiles_protect_sensitive_fields
before update on public.profiles
for each row execute function public.protect_profile_sensitive_fields();

alter table public.profiles enable row level security;
