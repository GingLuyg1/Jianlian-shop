-- Super admin payment management extension for Jianlian Shop.
-- Execute manually in Supabase SQL Editor. This file does not integrate real payment providers.

alter table if exists public.order_payments
  add column if not exists business_type text not null default 'order',
  add column if not exists channel text,
  add column if not exists network text,
  add column if not exists business_amount numeric(12, 2) not null default 0,
  add column if not exists fee_amount numeric(12, 2) not null default 0,
  add column if not exists payable_amount numeric(12, 2) not null default 0,
  add column if not exists received_amount numeric(12, 2) not null default 0,
  add column if not exists provider_trade_no text,
  add column if not exists paid_at timestamptz,
  add column if not exists callback_status text,
  add column if not exists exception_type text,
  add column if not exists error_summary text;

update public.order_payments
set business_type = 'order',
    channel = coalesce(channel, payment_method),
    business_amount = case when business_amount = 0 then amount else business_amount end,
    payable_amount = case when payable_amount = 0 then amount else payable_amount end,
    received_amount = case when status = 'paid' and received_amount = 0 then amount else received_amount end,
    paid_at = coalesce(paid_at, reviewed_at)
where business_type is null or channel is null or payable_amount = 0;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.order_payments'::regclass
    and conname = 'order_payments_status_check';

  if constraint_name is not null then
    alter table public.order_payments drop constraint order_payments_status_check;
  end if;
end $$;

alter table if exists public.order_payments
  add constraint order_payments_status_check
  check (status in ('pending','submitted','under_review','paid','rejected','cancelled','processing','failed','expired','closed','refunded'));

create index if not exists order_payments_business_type_idx on public.order_payments(business_type);
create index if not exists order_payments_channel_idx on public.order_payments(channel);
create index if not exists order_payments_paid_at_idx on public.order_payments(paid_at desc);
create index if not exists order_payments_exception_type_idx on public.order_payments(exception_type) where exception_type is not null;
create unique index if not exists order_payments_provider_trade_no_unique
  on public.order_payments(provider_trade_no)
  where provider_trade_no is not null and provider_trade_no <> '';

create table if not exists public.account_recharges (
  id uuid primary key default gen_random_uuid(),
  recharge_no text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  channel text not null,
  network text,
  amount numeric(12, 2) not null default 0,
  fee_amount numeric(12, 2) not null default 0,
  payable_amount numeric(12, 2) not null default 0,
  received_amount numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','expired','closed','refunded')),
  provider_trade_no text,
  paid_at timestamptz,
  callback_status text,
  exception_type text,
  error_summary text,
  user_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.account_recharges
  alter column amount type numeric(18, 6) using amount::numeric(18, 6),
  alter column fee_amount type numeric(18, 6) using fee_amount::numeric(18, 6),
  alter column payable_amount type numeric(18, 6) using payable_amount::numeric(18, 6),
  alter column received_amount type numeric(18, 6) using received_amount::numeric(18, 6),
  add column if not exists channel_code text,
  add column if not exists channel_name text,
  add column if not exists provider text,
  add column if not exists currency text not null default 'CNY',
  add column if not exists requested_amount numeric(18, 6) not null default 0,
  add column if not exists credited_amount numeric(18, 6) not null default 0,
  add column if not exists payment_url text,
  add column if not exists qr_code_url text,
  add column if not exists payment_address text,
  add column if not exists raw_response jsonb;

update public.account_recharges
set channel_code = coalesce(channel_code, channel),
    channel_name = coalesce(channel_name, channel),
    requested_amount = case when requested_amount = 0 then amount else requested_amount end,
    credited_amount = case when credited_amount = 0 then received_amount else credited_amount end
where channel_code is null
   or channel_name is null
   or requested_amount = 0
   or (credited_amount = 0 and received_amount <> 0);

create index if not exists account_recharges_user_id_idx on public.account_recharges(user_id);
create index if not exists account_recharges_user_email_idx on public.account_recharges(user_email);
create index if not exists account_recharges_channel_idx on public.account_recharges(channel);
create index if not exists account_recharges_status_idx on public.account_recharges(status);
create index if not exists account_recharges_created_at_idx on public.account_recharges(created_at desc);
create index if not exists account_recharges_paid_at_idx on public.account_recharges(paid_at desc);
create index if not exists account_recharges_exception_type_idx on public.account_recharges(exception_type) where exception_type is not null;
create unique index if not exists account_recharges_provider_trade_no_unique
  on public.account_recharges(provider_trade_no)
  where provider_trade_no is not null and provider_trade_no <> '';

create table if not exists public.payment_callback_logs (
  id uuid primary key default gen_random_uuid(),
  channel text,
  payment_no text,
  business_type text,
  provider_trade_no text,
  signature_result text,
  process_result text check (process_result is null or process_result in ('success','signature_failed','amount_mismatch','order_not_found','duplicate','processing_failed')),
  http_status integer,
  is_duplicate boolean not null default false,
  payload_summary jsonb not null default '{}'::jsonb,
  error_summary text,
  received_at timestamptz not null default now()
);

create index if not exists payment_callback_logs_payment_no_idx on public.payment_callback_logs(payment_no);
create index if not exists payment_callback_logs_channel_idx on public.payment_callback_logs(channel);
create index if not exists payment_callback_logs_received_at_idx on public.payment_callback_logs(received_at desc);
create index if not exists payment_callback_logs_process_result_idx on public.payment_callback_logs(process_result);

create table if not exists public.payment_channels (
  id uuid primary key default gen_random_uuid(),
  channel text unique not null,
  enabled boolean not null default false,
  display_name text not null,
  min_amount numeric(12, 2) not null default 0,
  fee_rate numeric(8, 6) not null default 0,
  currency text not null default 'CNY',
  network text,
  sort_order integer not null default 100,
  provider_name text,
  api_url text,
  merchant_id text,
  app_id text,
  callback_url text,
  timeout_minutes integer not null default 30,
  secret_key_masked text,
  signing_key_masked text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.payment_channels
  add column if not exists code text,
  add column if not exists minimum_amount numeric(18, 6),
  add column if not exists provider text;

update public.payment_channels
set code = coalesce(code, channel),
    minimum_amount = coalesce(minimum_amount, min_amount),
    provider = coalesce(
      provider,
      case
        when channel in ('alipay', 'wechat') then 'generic_api'
        when channel in ('binance', 'binance_pay') then 'binance'
        when channel in ('usdt_trc20', 'usdt_bep20') then 'crypto_address'
        else provider_name
      end
    )
where code is null or minimum_amount is null or provider is null;

create unique index if not exists payment_channels_code_unique on public.payment_channels(code);

create index if not exists payment_channels_enabled_idx on public.payment_channels(enabled);
create index if not exists payment_channels_sort_order_idx on public.payment_channels(sort_order);

insert into public.payment_channels (
  channel, code, enabled, display_name, currency, network,
  min_amount, minimum_amount, fee_rate, provider, sort_order
)
values
  ('alipay', 'alipay', false, '支付宝', 'CNY', null, 10, 10, 0, 'generic_api', 10),
  ('wechat', 'wechat', false, '微信支付', 'CNY', null, 10, 10, 0, 'generic_api', 20),
  ('binance_pay', 'binance_pay', false, '币安转账', 'USDT', null, 1, 1, 0, 'binance', 30),
  ('usdt_trc20', 'usdt_trc20', false, 'USDT-TRC20', 'USDT', 'TRON', 1, 1, 0, 'crypto_address', 40),
  ('usdt_bep20', 'usdt_bep20', false, 'USDT-BEP20', 'USDT', 'BSC', 1, 1, 0, 'crypto_address', 50)
on conflict (channel) do nothing;

create or replace function public.set_payment_admin_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_account_recharges_updated_at on public.account_recharges;
create trigger trg_account_recharges_updated_at
before update on public.account_recharges
for each row execute function public.set_payment_admin_updated_at();

drop trigger if exists trg_payment_channels_updated_at on public.payment_channels;
create trigger trg_payment_channels_updated_at
before update on public.payment_channels
for each row execute function public.set_payment_admin_updated_at();

alter table public.account_recharges enable row level security;
alter table public.payment_callback_logs enable row level security;
alter table public.payment_channels enable row level security;

drop policy if exists "Users can read own recharge records" on public.account_recharges;
create policy "Users can read own recharge records"
on public.account_recharges for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own recharge records" on public.account_recharges;
create policy "Users can create own recharge records"
on public.account_recharges for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins can read all recharge records" on public.account_recharges;
create policy "Admins can read all recharge records"
on public.account_recharges for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage recharge records" on public.account_recharges;
create policy "Admins can manage recharge records"
on public.account_recharges for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can read payment callbacks" on public.payment_callback_logs;
create policy "Admins can read payment callbacks"
on public.payment_callback_logs for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage payment callbacks" on public.payment_callback_logs;
create policy "Admins can manage payment callbacks"
on public.payment_callback_logs for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can read payment channels" on public.payment_channels;
create policy "Admins can read payment channels"
on public.payment_channels for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Public can read enabled payment channels" on public.payment_channels;
create policy "Public can read enabled payment channels"
on public.payment_channels for select
to anon, authenticated
using (enabled = true);

drop policy if exists "Admins can manage payment channels" on public.payment_channels;
create policy "Admins can manage payment channels"
on public.payment_channels for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
