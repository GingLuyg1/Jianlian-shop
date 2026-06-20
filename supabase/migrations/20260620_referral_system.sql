-- Jianlian Shop referral system migration.
-- Run this file in Supabase SQL Editor after reviewing.
-- It does not change product, category, or order core table structures.

alter table public.profiles
add column if not exists invite_code text;

alter table public.profiles
add column if not exists referred_by uuid references public.profiles(id) on delete set null;

alter table public.profiles
add column if not exists promotion_balance numeric(12, 2) not null default 0;

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

insert into public.referrals (
  referrer_id,
  referred_user_id,
  referral_code
)
select
  referred_by,
  id,
  coalesce((
    select p2.invite_code
    from public.profiles p2
    where p2.id = public.profiles.referred_by
  ), 'LEGACY')
from public.profiles
where referred_by is not null
on conflict (referred_user_id) do nothing;

drop policy if exists "Users can view profiles they referred" on public.profiles;
create policy "Users can view profiles they referred"
on public.profiles for select
to authenticated
using (auth.uid() = referred_by);

create or replace function public.make_referral_code()
returns text
language sql
volatile
as $$
  select 'JL' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8))
$$;

create or replace function public.ensure_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_try integer := 0;
begin
  if v_user_id is null then
    raise exception '请先登录';
  end if;

  select invite_code into v_code
  from public.profiles
  where id = v_user_id;

  if v_code is not null and trim(v_code) <> '' then
    return v_code;
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.make_referral_code();

    begin
      update public.profiles
      set invite_code = v_code
      where id = v_user_id
        and invite_code is null;

      if found then
        return v_code;
      end if;

      select invite_code into v_code
      from public.profiles
      where id = v_user_id;

      if v_code is not null and trim(v_code) <> '' then
        return v_code;
      end if;
    exception when unique_violation then
      if v_try >= 20 then
        raise exception '邀请码生成失败，请稍后重试';
      end if;
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
  v_inviter_id uuid;
  v_current_referrer uuid;
begin
  if v_user_id is null then
    raise exception '请先登录';
  end if;

  if nullif(trim(input_invite_code), '') is null then
    return false;
  end if;

  select referred_by into v_current_referrer
  from public.profiles
  where id = v_user_id
  for update;

  if v_current_referrer is not null then
    return false;
  end if;

  select id into v_inviter_id
  from public.profiles
  where lower(invite_code) = lower(trim(input_invite_code))
  limit 1;

  if v_inviter_id is null then
    raise exception '邀请码不存在';
  end if;

  if v_inviter_id = v_user_id then
    raise exception '不能绑定自己的邀请码';
  end if;

  update public.profiles
  set referred_by = v_inviter_id
  where id = v_user_id
    and referred_by is null;

  insert into public.referrals (
    referrer_id,
    referred_user_id,
    referral_code
  )
  values (
    v_inviter_id,
    v_user_id,
    trim(input_invite_code)
  )
  on conflict (referred_user_id) do nothing;

  return found;
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
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.protect_profile_referral_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists profiles_protect_referral_fields on public.profiles;
create trigger profiles_protect_referral_fields
before update on public.profiles
for each row execute function public.protect_profile_referral_fields();

create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid references public.profiles(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_no text,
  order_amount numeric(12, 2) not null default 0,
  paid_at timestamptz,
  referred_user_label text,
  commission_rate numeric(6, 4) not null default 0.03,
  commission_amount numeric(12, 2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'available', 'withdrawn', 'cancelled')),
  created_at timestamptz not null default now(),
  available_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(order_id)
);

create index if not exists referral_commissions_referrer_idx
on public.referral_commissions(referrer_id, created_at desc);

create index if not exists referral_commissions_status_idx
on public.referral_commissions(status);

alter table public.referral_commissions enable row level security;

drop policy if exists "Users can view own referral commissions" on public.referral_commissions;
create policy "Users can view own referral commissions"
on public.referral_commissions for select
to authenticated
using (auth.uid() = referrer_id);

drop policy if exists "Admins can view all referral commissions" on public.referral_commissions;
create policy "Admins can view all referral commissions"
on public.referral_commissions for select
to authenticated
using (public.is_admin(auth.uid()));

create or replace function public.sync_referral_commission_for_order(
  p_order_id uuid,
  p_commission_rate numeric default 0.03
)
returns public.referral_commissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_referrer_id uuid;
  v_commission public.referral_commissions;
  v_amount numeric(12, 2);
  v_is_eligible boolean;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '无后台访问权限';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '订单不存在';
  end if;

  select referred_by into v_referrer_id
  from public.profiles
  where id = v_order.user_id;

  if v_referrer_id is null or v_referrer_id = v_order.user_id then
    return null;
  end if;

  v_is_eligible :=
    v_order.payment_status = 'paid'
    and v_order.status not in ('cancelled', 'refunded', 'failed')
    and coalesce(v_order.total_amount, 0) > 0;

  if v_is_eligible then
    v_amount := round((v_order.total_amount * coalesce(p_commission_rate, 0.03))::numeric, 2);

    insert into public.referral_commissions (
      referrer_id,
      referred_user_id,
      order_id,
      order_no,
      order_amount,
      paid_at,
      referred_user_label,
      commission_rate,
      commission_amount,
      status,
      available_at
    )
    values (
      v_referrer_id,
      v_order.user_id,
      v_order.id,
      v_order.order_no,
      v_order.total_amount,
      coalesce(v_order.paid_at, now()),
      v_order.customer_email,
      coalesce(p_commission_rate, 0.03),
      v_amount,
      'available',
      now()
    )
    on conflict (order_id) do update
      set order_no = excluded.order_no,
          order_amount = excluded.order_amount,
          paid_at = excluded.paid_at,
          referred_user_label = excluded.referred_user_label,
          commission_rate = excluded.commission_rate,
          commission_amount = excluded.commission_amount,
          status = case
            when public.referral_commissions.status = 'withdrawn' then 'withdrawn'
            else 'available'
          end,
          available_at = coalesce(public.referral_commissions.available_at, now()),
          updated_at = now()
    returning * into v_commission;
  else
    update public.referral_commissions
    set status = case
          when status = 'withdrawn' then status
          else 'cancelled'
        end,
        updated_at = now()
    where order_id = v_order.id
    returning * into v_commission;
  end if;

  update public.profiles p
  set promotion_balance = coalesce((
    select sum(commission_amount)
    from public.referral_commissions rc
    where rc.referrer_id = p.id
      and rc.status = 'available'
  ), 0)
  where p.id = v_referrer_id;

  return v_commission;
end;
$$;

grant execute on function public.sync_referral_commission_for_order(uuid, numeric) to authenticated;
