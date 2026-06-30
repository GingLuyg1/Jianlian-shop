-- Optional production data origin labels.
-- Execute manually only after review. This migration is additive and does not modify existing data values.

alter table if exists public.profiles
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.products
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.categories
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.orders
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.payment_sessions
  add column if not exists provider_environment text,
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.account_recharges
  add column if not exists provider_environment text,
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.digital_inventory
  add column if not exists source_environment text,
  add column if not exists data_origin text,
  add column if not exists is_test boolean not null default false;

alter table if exists public.admin_audit_logs
  add column if not exists source_environment text,
  add column if not exists data_origin text;

create index if not exists profiles_is_test_idx on public.profiles(is_test);
create index if not exists products_is_test_idx on public.products(is_test);
create index if not exists categories_is_test_idx on public.categories(is_test);
create index if not exists orders_is_test_idx on public.orders(is_test);
create index if not exists payment_sessions_is_test_idx on public.payment_sessions(is_test);
create index if not exists account_recharges_is_test_idx on public.account_recharges(is_test);
create index if not exists digital_inventory_is_test_idx on public.digital_inventory(is_test);
