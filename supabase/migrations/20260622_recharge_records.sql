-- Account recharge records for Jianlian Shop.
-- Execute this file in Supabase SQL Editor when enabling account recharge orders.
-- This does not integrate any real payment provider and does not mark records as paid.

create table if not exists public.recharge_records (
  id uuid primary key default gen_random_uuid(),
  recharge_no text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_code text not null,
  channel_name text not null,
  provider text not null,
  currency text not null check (currency in ('CNY', 'USDT')),
  network text check (network in ('TRC20', 'BEP20')),
  amount numeric(18, 6) not null default 0,
  fee_amount numeric(18, 6) not null default 0,
  payable_amount numeric(18, 6) not null default 0,
  arrival_amount numeric(18, 6) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed', 'expired', 'closed')),
  provider_trade_no text,
  payment_url text,
  qr_code_url text,
  payment_address text,
  paid_at timestamptz,
  expired_at timestamptz,
  closed_at timestamptz,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recharge_records_user_id_idx on public.recharge_records(user_id);
create index if not exists recharge_records_status_idx on public.recharge_records(status);
create index if not exists recharge_records_channel_code_idx on public.recharge_records(channel_code);
create index if not exists recharge_records_created_at_idx on public.recharge_records(created_at desc);

create or replace function public.set_recharge_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_recharge_records_updated_at on public.recharge_records;
create trigger trg_recharge_records_updated_at
before update on public.recharge_records
for each row execute function public.set_recharge_records_updated_at();

alter table public.recharge_records enable row level security;

drop policy if exists "Users can read own recharge records" on public.recharge_records;
create policy "Users can read own recharge records"
on public.recharge_records for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own recharge records" on public.recharge_records;
create policy "Users can create own recharge records"
on public.recharge_records for insert
to authenticated
with check (user_id = auth.uid() and status in ('pending', 'processing'));

drop policy if exists "Admins can read all recharge records" on public.recharge_records;
create policy "Admins can read all recharge records"
on public.recharge_records for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can update recharge records" on public.recharge_records;
create policy "Admins can update recharge records"
on public.recharge_records for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
